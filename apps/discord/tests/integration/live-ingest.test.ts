/**
 * Opt-in live join: bot forward/heartbeat clients against a running Go API.
 *
 * Default `bun run test` skips this file (no CHRONICLER_LIVE_INGEST).
 * Against chronicler-dev (compose.dev-tests.yaml):
 *
 *   CHRONICLER_LIVE_INGEST=1 \
 *   CHRONICLER_LIVE_API_URL=http://127.0.0.1:8080 \
 *   CHRONICLER_LIVE_INGEST_SECRET=local-test-only-ingest-secret \
 *   bun run --filter @pi/discord test:live-ingest
 *
 * Evidence level is live HTTP only when this suite runs green; fixture
 * integration tests under api.test.ts do not count as live.
 */

import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messageEvent } from '../fixtures/api.js';

const liveEnabled = process.env['CHRONICLER_LIVE_INGEST'] === '1';
const liveApiUrl = (process.env['CHRONICLER_LIVE_API_URL'] ?? 'http://127.0.0.1:8080').replace(
  /\/$/,
  '',
);
const liveSecret =
  process.env['CHRONICLER_LIVE_INGEST_SECRET'] ?? 'local-test-only-ingest-secret';

describe.skipIf(!liveEnabled)('live ingest against running Go API', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('API_URL', liveApiUrl);
    vi.stubEnv('BOT_API_ALLOWED_ORIGIN', liveApiUrl);
    vi.stubEnv('BOT_ALLOW_INSECURE_API_URL', 'true');
    vi.stubEnv('INGEST_SECRET', liveSecret);
    vi.stubEnv('GUILD_ID', 'test-guild-id');
    vi.stubEnv('BOT_HEARTBEAT_ENABLED', 'true');
    vi.stubEnv('SNIFFER_ENABLED', 'false');
    vi.stubEnv('AGENT_ENABLED', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects a wrong ingest secret with 401 from the live API', async () => {
    const response = await fetch(`${liveApiUrl}/v1/ingest/discord-event`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Ingest-Secret': 'definitely-not-the-live-secret',
      },
      body: JSON.stringify({
        ...messageEvent,
        event_id: `live-unauth-${randomUUID()}`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    expect(response.status, `live API unreachable or misconfigured at ${liveApiUrl}`).toBe(401);
  });

  it('posts a bot-shaped discord-event through postDiscordEvent', async () => {
    const { postDiscordEvent } = await import('@discord/activity/forward.js');
    const event = {
      ...messageEvent,
      event_id: `live-event-${randomUUID()}`,
      occurred_at: new Date().toISOString(),
    };
    await expect(postDiscordEvent(event)).resolves.toBeUndefined();
  });

  it('posts a bot-shaped heartbeat through postHeartbeat', async () => {
    const { postHeartbeat } = await import('@discord/health.js');
    await expect(
      postHeartbeat({
        gateway_ready: true,
        shard_state: { '0': 'ready' },
        host: 'discord-live-ingest',
        build_sha: 'live-ingest-harness',
      }),
    ).resolves.toBeUndefined();
  });
});
