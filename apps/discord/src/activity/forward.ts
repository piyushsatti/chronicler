/**
 * In-memory transport buffer for activity ingest (D23).
 */

import { createHttp, type FetchFn } from '../api/http.js';
import { createIngest, type IngestPort } from '../api/ingest.js';
import type { BotConfig } from '../config.js';
import { logger } from '../log.js';
import type { SniffedEvent } from './types.js';

export type Clock = () => number;

const DEFAULT_CAPACITY = 2000;
const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;
const DEFAULT_MAX_IN_FLIGHT = 8;
const BACKOFF_CAP_MS = 30_000;

export type ActivityApiDeps = {
  ingest?: IngestPort;
  fetch?: FetchFn;
};

function ingestFor(config: BotConfig, deps?: ActivityApiDeps): IngestPort {
  if (deps?.ingest) return deps.ingest;
  return createIngest(
    createHttp({
      apiUrl: config.apiUrl,
      secret: config.ingestSecret,
      fetch: deps?.fetch,
    }),
  );
}

/**
 * POST one normalized event to `/v1/ingest/discord-event`.
 * Resolves on any 2xx. Any other status or network failure throws one Error.
 */
export async function postDiscordEvent(
  config: BotConfig,
  event: SniffedEvent,
  deps?: ActivityApiDeps,
): Promise<void> {
  const result = await ingestFor(config, deps).postEvent(event);
  if (result.ok) return;
  if (result.status === undefined) {
    throw new Error(result.detail);
  }
  throw new Error(
    `ingest rejected event ${event.event_id} (${result.status}): ${result.detail}`,
  );
}

export class ActivityForwarder {
  private readonly ingest: IngestPort;
  private readonly now: Clock;
  private readonly capacity: number;
  private readonly maxAgeMs: number;
  private readonly maxInFlight: number;
  private readonly queue: SniffedEvent[] = [];
  private readonly order = new WeakMap<SniffedEvent, number>();
  private nextSeq = 0;
  private inFlight = 0;
  private gateOpenAt = 0;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private draining = false;
  private droppedPermanent = 0;
  private droppedCapacity = 0;
  private droppedAge = 0;
  private lastLogged = { permanent: 0, capacity: 0, age: 0 };
  private logScheduled = false;
  private readonly progressWaiters = new Set<() => void>();

  constructor(o: {
    ingest: IngestPort;
    now: Clock;
    capacity?: number;
    maxAgeMs?: number;
    maxInFlight?: number;
  }) {
    this.ingest = o.ingest;
    this.now = o.now;
    this.capacity = o.capacity ?? DEFAULT_CAPACITY;
    this.maxAgeMs = o.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
    this.maxInFlight = o.maxInFlight ?? DEFAULT_MAX_IN_FLIGHT;
  }

  enqueue(e: SniffedEvent): void {
    this.trimAged();
    if (this.isAged(e)) {
      this.droppedAge += 1;
      this.scheduleLogDrops();
      return;
    }
    this.order.set(e, this.nextSeq++);
    this.ensureRoom();
    this.queue.push(e);
    this.pump();
  }

  async drain(
    deadlineAt: number,
  ): Promise<{ delivered: number; remaining: number }> {
    let delivered = 0;
    this.draining = true;
    this.gateOpenAt = 0;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    try {
      while (this.now() < deadlineAt) {
        this.trimAged();
        const deliveredBefore = delivered;
        this.pump(() => {
          delivered += 1;
        });
        if (this.queue.length === 0 && this.inFlight === 0) break;
        const waitMs = Math.max(0, deadlineAt - this.now());
        if (waitMs === 0) break;
        if (this.inFlight > 0) {
          await Promise.race([
            this.whenProgress(),
            new Promise<void>((resolve) => {
              setTimeout(resolve, waitMs);
            }),
          ]);
        }
        // Pace retries on a macrotask so instant retryable failures cannot
        // spin the drain loop on microtasks until the heap dies.
        if (
          delivered === deliveredBefore &&
          (this.queue.length > 0 || this.inFlight > 0) &&
          this.now() < deadlineAt
        ) {
          const yieldMs = Math.min(Math.max(0, deadlineAt - this.now()), 1);
          await new Promise<void>((resolve) => {
            setTimeout(resolve, yieldMs);
          });
        }
      }
    } finally {
      this.draining = false;
      if (this.queue.length > 0) {
        this.pump();
      }
    }

    return { delivered, remaining: this.queue.length + this.inFlight };
  }

  private pump(onDelivered?: () => void): void {
    while (
      this.inFlight < this.maxInFlight &&
      this.queue.length > 0 &&
      (this.draining ||
        (this.timer === undefined && this.now() >= this.gateOpenAt))
    ) {
      const event = this.queue.shift();
      if (event === undefined) return;
      if (this.isAged(event)) {
        this.droppedAge += 1;
        this.scheduleLogDrops();
        continue;
      }
      this.inFlight += 1;
      void this.dispatch(event, onDelivered);
    }
  }

  private async dispatch(
    event: SniffedEvent,
    onDelivered?: () => void,
  ): Promise<void> {
    try {
      const result = await this.ingest.postEvent(event);
      if (result.ok) {
        this.attempt = 0;
        onDelivered?.();
        return;
      }
      if (result.kind === 'permanent') {
        this.droppedPermanent += 1;
        this.scheduleLogDrops();
        return;
      }
      if (this.isAged(event)) {
        this.droppedAge += 1;
        this.scheduleLogDrops();
      } else {
        this.requeue(event);
        if (
          !this.draining &&
          this.now() >= this.gateOpenAt &&
          this.timer === undefined
        ) {
          const delay =
            result.retryAfterMs ??
            Math.floor(
              Math.random() *
                Math.min(BACKOFF_CAP_MS, 1000 * 2 ** Math.min(this.attempt, 5)),
            );
          this.attempt += 1;
          this.gateOpenAt = this.now() + delay;
          this.schedule(delay);
        }
      }
    } finally {
      this.inFlight -= 1;
      this.notifyProgress();
      if (!this.draining) {
        this.pump(onDelivered);
      }
    }
  }

  private requeue(event: SniffedEvent): void {
    if (this.queue.length >= this.capacity) {
      this.droppedCapacity += 1;
      this.scheduleLogDrops();
      return;
    }
    const seq = this.order.get(event) ?? 0;
    let i = 0;
    while (i < this.queue.length && (this.order.get(this.queue[i]!) ?? 0) < seq) {
      i += 1;
    }
    this.queue.splice(i, 0, event);
  }

  private ensureRoom(): void {
    let dropped = 0;
    while (this.queue.length >= this.capacity) {
      this.queue.shift();
      dropped += 1;
    }
    if (dropped === 0) return;
    this.droppedCapacity += dropped;
    this.scheduleLogDrops();
  }

  private isAged(event: SniffedEvent): boolean {
    const occurredAt = Date.parse(event.occurred_at);
    if (!Number.isFinite(occurredAt)) return true;
    return this.now() - occurredAt > this.maxAgeMs;
  }

  private trimAged(): void {
    let dropped = 0;
    const kept: SniffedEvent[] = [];
    for (const event of this.queue) {
      if (this.isAged(event)) {
        dropped += 1;
      } else {
        kept.push(event);
      }
    }
    if (dropped === 0) return;
    this.queue.length = 0;
    this.queue.push(...kept);
    this.droppedAge += dropped;
    this.scheduleLogDrops();
  }

  private schedule(delay: number): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.pump();
    }, delay);
  }

  private whenProgress(): Promise<void> {
    return new Promise((resolve) => {
      this.progressWaiters.add(resolve);
    });
  }

  private notifyProgress(): void {
    for (const resolve of this.progressWaiters) resolve();
    this.progressWaiters.clear();
  }

  private scheduleLogDrops(): void {
    if (this.logScheduled) return;
    this.logScheduled = true;
    void Promise.resolve().then(() => {
      this.logScheduled = false;
      const next = {
        permanent: this.droppedPermanent,
        capacity: this.droppedCapacity,
        age: this.droppedAge,
      };
      if (
        next.permanent === this.lastLogged.permanent &&
        next.capacity === this.lastLogged.capacity &&
        next.age === this.lastLogged.age
      ) {
        return;
      }
      this.lastLogged = next;
      logger.error('Activity forwarder dropped events', next);
    });
  }
}
