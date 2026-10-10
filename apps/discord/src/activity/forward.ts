/**
 * One-shot activity handoff. A failed POST is logged and dropped.
 */

import { config } from '../config.js';
import { logger } from '../log.js';
import type { SniffedEvent } from './types.js';

const INGEST_PATH = '/v1/ingest/discord-event';
const MAX_IN_FLIGHT = 8;

let inFlight = 0;

/**
 * POST one normalized event to `/v1/ingest/discord-event`.
 * Resolves on any 2xx. Any other status or network failure throws one Error.
 */
export async function postDiscordEvent(event: SniffedEvent): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}${INGEST_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Ingest-Secret': config.ingestSecret,
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err: unknown) {
    throw err instanceof Error ? err : new Error(String(err));
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `ingest rejected event ${event.event_id} (${response.status}): ${detail || response.statusText}`,
    );
  }
}

/** POST one event. A failure is logged and the event is dropped. Cap is 8 in flight. */
export function deliverActivity(event: SniffedEvent): void {
  if (inFlight >= MAX_IN_FLIGHT) {
    logger.error('Activity post shed', {
      eventId: event.event_id,
      inFlight,
      maxInFlight: MAX_IN_FLIGHT,
    });
    return;
  }
  inFlight += 1;
  void postDiscordEvent(event)
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
