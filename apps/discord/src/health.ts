/**
 * Shard lifecycle logging -- makes gateway reconnects auditable.
 *
 * The problem this exists to solve: `bootstrap.ts` previously logged only
 * `shardDisconnect` and `shardReconnecting`, which record that a reconnect was
 * *attempted* and never what it *resolved to*. Those are the two outcomes that
 * matter and they are opposites:
 *
 *   - **resume** (`shardResume`) -- Discord replayed the missed events onto the
 *     same session. Nothing was lost. `replayedEvents` says how many.
 *   - **fresh identify** (`shardReady` while a reconnect is in flight) -- the
 *     session was invalidated. Every gateway event in the gap is gone
 *     permanently; Discord will not replay it, and no bot-side queue can
 *     recover it, because the bot never received it.
 *
 * Without separating those, a production log full of "Shard reconnecting" is
 * unreadable: it cannot answer "did we lose activity last night?". Live
 * observation on 2026-07-28 found five reconnects in ten hours with no way to
 * classify any of them (FINDINGS 58).
 *
 * Note `shardDisconnect` is NOT the routine case. discord.js emits it only when
 * a shard's WebSocket closes and **will not** reconnect, which is why the live
 * logs contained zero of them while reconnecting every couple of hours.
 *
 * This module only observes. Recovering a lost gap is the high-water-mark
 * backfill in D23, which belongs here later and is deliberately not built yet.
 */

import os from 'node:os';
import type { Client, CloseEvent } from 'discord.js';
import { config } from './config.js';
import { logger } from './log.js';

/** Injectable clock, so tests do not depend on wall time. */
export type Clock = () => number;

/** Injectable heartbeat poster, so tests do not depend on real fetch/network. */
export interface HeartbeatStatus {
  gateway_ready: boolean;
  shard_state: Record<string, 'ready' | 'reconnecting' | 'disconnected' | 'unknown'>;
  host: string;
  build_sha: string;
}

export type HeartbeatPoster = (status?: HeartbeatStatus) => Promise<void>;

export type ProcessExit = (code: number) => void;

/** Stops the heartbeat interval started by {@link mountShardHealth}. */
export type HeartbeatDisposer = () => void;

const HEARTBEAT_PATH = '/v1/ingest/heartbeat';
// Default 60s matches the retained ingest heartbeat watch cadence (OP-040).
// The bot does not read API config; keep this literal aligned by hand.
const DEFAULT_HEARTBEAT_INTERVAL_MS = 60_000;

/**
 * POSTs `/v1/ingest/heartbeat` with the shared ingest secret.
 * Errors are logged, never thrown -- a failed heartbeat POST must not exit.
 */
export async function postHeartbeat(status?: HeartbeatStatus): Promise<void> {
  try {
    const response = await fetch(`${config.apiUrl}${HEARTBEAT_PATH}`, {
      method: 'POST',
      headers: {
        'X-Ingest-Secret': config.ingestSecret,
        'content-type': 'application/json',
      },
      body: JSON.stringify(
        status ?? {
          gateway_ready: false,
          shard_state: {},
          host: os.hostname(),
          build_sha: config.build,
        },
      ),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      logger.warn('Heartbeat POST failed', { status: response.status });
    }
  } catch (err: unknown) {
    logger.warn('Heartbeat POST errored', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export interface ShardHealthOptions {
  /** Disable only the ingest heartbeat for an isolated agent process. */
  heartbeatEnabled?: boolean;
  now?: Clock;
  /** Overrides the default `/v1/ingest/heartbeat` poster. Test seam. */
  heartbeatPoster?: HeartbeatPoster;
  /** Overrides the default 60s heartbeat interval. Test seam. */
  heartbeatIntervalMs?: number;
  /** Host/build labels are injectable for deterministic heartbeat assertions. */
  host?: string;
  build?: string;
  /** Exits after a terminal shard state or prolonged non-ready gateway. */
  exit?: ProcessExit;
  nonReadyExitMs?: number;
  exitOnTerminal?: boolean;
}

/**
 * Attach shard lifecycle listeners to `client`. Call before login, same
 * contract as {@link mountActivity}.
 *
 * Tracks, per shard, the moment a reconnect began, so the resolving event can
 * report how long the gap was and whether anything was lost.
 *
 * Also starts the heartbeat interval (#445): POSTs to Go
 * `POST /v1/ingest/heartbeat` (`apps/api/internal/ingest`, OpenAPI Heartbeat)
 * on a fixed cadence so the API can detect a wedged/dead bot process.
 * Returns a disposer that stops the interval -- callers that don't need it
 * (production bootstrap) can ignore the return value; tests use it to avoid
 * leaking timers.
 */
export function mountShardHealth(
  client: Client,
  options: ShardHealthOptions = {},
): HeartbeatDisposer {
  const now = options.now ?? Date.now;
  const poster =
    options.heartbeatPoster ?? ((status?: HeartbeatStatus) => postHeartbeat(status));
  const intervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  const host = options.host ?? config.host ?? os.hostname();
  const buildSha = options.build ?? config.build;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const nonReadyExitMs = options.nonReadyExitMs ?? 5 * 60 * 1000;
  const exitOnTerminal = options.exitOnTerminal ?? false;
  let gatewayReady = false;
  let nonReadySince = now();
  let terminal = false;
  const shardStates = new Map<number, HeartbeatStatus['shard_state'][string]>();
  for (const shardId of client.ws?.shards.keys() ?? []) {
    shardStates.set(Number(shardId), 'unknown');
  }

  const isHealthy = (): boolean => {
    if (!gatewayReady || terminal) {
      return false;
    }
    for (const state of shardStates.values()) {
      if (state !== 'ready') {
        return false;
      }
    }
    return true;
  };

  const heartbeatStatus = (): HeartbeatStatus => {
    return {
      gateway_ready: isHealthy(),
      shard_state: Object.fromEntries(
        [...shardStates.entries()].map(([shardId, state]) => [String(shardId), state]),
      ),
      host,
      build_sha: buildSha,
    };
  };

  const checkGatewayLiveness = (): boolean => {
    const healthy = isHealthy();
    if (healthy) {
      nonReadySince = now();
    } else if (now() - nonReadySince >= nonReadyExitMs) {
      logger.error('Gateway remained non-ready beyond the configured grace period', {
        nonReadyExitMs,
        status: heartbeatStatus(),
      });
      exit(1);
      return false;
    }
    return true;
  };

  const publishHeartbeat = (): void => {
    if (!checkGatewayLiveness()) return;
    void poster(heartbeatStatus());
  };

  const timer = setInterval(() => {
    if (options.heartbeatEnabled === false) {
      checkGatewayLiveness();
      return;
    }
    publishHeartbeat();
  }, intervalMs);
  // Don't hold the process open just for the heartbeat/watchdog timer.
  timer.unref?.();

  /** shardId -> timestamp the current reconnect attempt started. */
  const reconnectingSince = new Map<number, number>();

  const gapMs = (shardId: number): number | null => {
    const started = reconnectingSince.get(shardId);
    return started === undefined ? null : now() - started;
  };

  client.on('shardReconnecting', (shardId: number) => {
    shardStates.set(shardId, 'reconnecting');
    gatewayReady = false;
    reconnectingSince.set(shardId, now());
    logger.warn('Shard reconnecting', { shardId });
  });

  client.on('shardResume', (shardId: number, replayedEvents: number) => {
    shardStates.set(shardId, 'ready');
    gatewayReady = true;
    const gap = gapMs(shardId);
    reconnectingSince.delete(shardId);
    logger.info('Shard resumed, session intact', {
      shardId,
      replayedEvents,
      gapMs: gap,
      eventsLost: false,
    });
  });

  client.on(
    'shardReady',
    (shardId: number, unavailableGuilds: Set<string> | undefined) => {
      shardStates.set(shardId, 'ready');
      gatewayReady = true;
      const gap = gapMs(shardId);
      if (gap === null) {
        // First identify of the process. Not a reconnect, nothing was missed.
        logger.info('Shard ready', {
          shardId,
          unavailableGuilds: unavailableGuilds?.size ?? 0,
        });
        return;
      }
      reconnectingSince.delete(shardId);
      // A reconnect that lands on shardReady rather than shardResume means
      // Discord invalidated the session and issued a fresh one.
      logger.error(
        'Shard re-identified after reconnect -- session lost, gateway events in the gap are unrecoverable',
        {
          shardId,
          gapMs: gap,
          unavailableGuilds: unavailableGuilds?.size ?? 0,
          eventsLost: true,
        },
      );
    },
  );

  client.on('shardError', (error: Error, shardId: number) => {
    logger.error('Shard websocket error', { shardId, error: error.message });
  });

  client.on('shardDisconnect', (closeEvent: CloseEvent, shardId: number) => {
    shardStates.set(shardId, 'disconnected');
    gatewayReady = false;
    terminal = true;
    reconnectingSince.delete(shardId);
    // Terminal: discord.js has given up on this shard.
    // Only `code` is logged: discord.js deprecated `reason` and `wasClean`
    // when it moved to @discordjs/ws, and both are now always empty. The close
    // code is the diagnostic that matters anyway (4004 bad token, 4014
    // disallowed intents, 4013 invalid intents).
    logger.error('Shard disconnected and will not reconnect', {
      shardId,
      code: closeEvent.code,
    });
    if (exitOnTerminal) {
      exit(1);
    }
  });

  // `clientReady` is intentionally optional for tiny test doubles. Real
  // discord.js emits it after the gateway has identified all shards.
  const clientWithOnce = client as Client & {
    once?: (event: string, listener: () => void) => Client;
  };
  if (typeof clientWithOnce.once === 'function') {
    clientWithOnce.once('clientReady', () => {
      gatewayReady = true;
      terminal = false;
      nonReadySince = now();
    });
  }

  return () => {
    if (timer !== undefined) clearInterval(timer);
  };
}
