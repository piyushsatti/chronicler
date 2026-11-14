/**
 * Container liveness probe: freshness of the bot event-loop heartbeat file.
 * Compose runs this as CMD; no HTTP listener.
 */
import { statSync } from 'node:fs';

/** Container-local path the timer touches; healthcheck reads the same file. */
export const BOT_ALIVE_PATH = '/tmp/chronicler-bot-alive';

const MAX_AGE_MS = 150_000;

export function isFresh(mtimeMs: number, now: number, maxAgeMs: number): boolean {
  return now - mtimeMs < maxAgeMs;
}

function check(): void {
  try {
    const { mtimeMs } = statSync(BOT_ALIVE_PATH);
    process.exitCode = isFresh(mtimeMs, Date.now(), MAX_AGE_MS) ? 0 : 1;
  } catch {
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  check();
}
