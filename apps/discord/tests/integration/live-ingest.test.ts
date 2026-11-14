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
import { describe, expect, it } from 'vitest';
import { postDiscordEvent } from '@discord/activity/forward.js';
import { postHeartbeat } from '@discord/health.js';
import { messageEvent } from '../fixtures/api.js';
import { testConfig } from '../support/config.js';

const liveEnabled = process.env['CHRONICLER_LIVE_INGEST'] === '1';
const liveApiUrl = (
  process.env['CHRONICLER_LIVE_API_URL'] ?? 'http://127.0.0.1:8080'
).replace(/\/$/, '');
const liveSecret =
  process.env['CHRONICLER_LIVE_INGEST_SECRET'] ?? 'local-test-only-ingest-secret';

const liveConfig = testConfig({
  apiUrl: liveApiUrl,
  ingestSecret: liveSecret,
  guildId: 'test-guild-id',
  heartbeatEnabled: true,
  snifferEnabled: false,
  agentEnabled: false,
});

describe.skipIf(!liveEnabled)('live ingest against running Go API', () => {
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
    expect(
      response.status,
      `live API unreachable or misconfigured at ${liveApiUrl}`,
    ).toBe(401);
  });

  it('posts a bot-shaped discord-event through postDiscordEvent', async () => {
    const event = {
      ...messageEvent,
      event_id: `live-event-${randomUUID()}`,
      occurred_at: new Date().toISOString(),
    };
    await expect(postDiscordEvent(liveConfig, event)).resolves.toBeUndefined();
  });

  it('posts a bot-shaped heartbeat through postHeartbeat', async () => {
    await expect(
      postHeartbeat(liveConfig, {
        gateway_ready: true,
        shard_state: { '0': 'ready' },
        host: 'discord-live-ingest',
        build_sha: 'live-ingest-test',
      }),
    ).resolves.toBeUndefined();
  });
});
