/**
 * One-shot activity handoff. A failed POST is logged and dropped.
 */

import { createHttp, type FetchFn } from '../api/http.js';
import { createIngest, type IngestPort } from '../api/ingest.js';
import type { BotConfig } from '../config.js';
import { logger } from '../log.js';
import type { SniffedEvent } from './types.js';

const MAX_IN_FLIGHT = 8;

let inFlight = 0;

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

/** POST one event. A failure is logged and the event is dropped. Cap is 8 in flight. */
export function deliverActivity(
  config: BotConfig,
  event: SniffedEvent,
  deps?: ActivityApiDeps,
): void {
  if (inFlight >= MAX_IN_FLIGHT) {
    logger.error('Activity post shed', {
      eventId: event.event_id,
      inFlight,
      maxInFlight: MAX_IN_FLIGHT,
    });
    return;
  }
  inFlight += 1;
  void postDiscordEvent(config, event, deps)
    .catch((err: unknown) => {
      logger.error('Activity post failed', {
        eventId: event.event_id,
        error: err instanceof Error ? err.message : String(err),
      });
    })
    .finally(() => {
      inFlight -= 1;
    });
}

/** Test seam: reset the in-flight counter between cases. */
export function resetActivityInFlightForTests(): void {
  inFlight = 0;
}
