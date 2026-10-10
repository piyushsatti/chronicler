import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@discord/log.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function baseEnv(): void {
  vi.stubEnv('DISCORD_TOKEN', 'test-token');
  vi.stubEnv('BOT_CLIENT_ID', 'test-client-id');
  vi.stubEnv('GUILD_ID', 'test-guild-id');
  vi.stubEnv('INGEST_SECRET', 'test-ingest-secret');
}

describe('mountAgent flag', () => {
  it('does not attach messageCreate when AGENT_ENABLED is unset', async () => {
    baseEnv();
    vi.stubEnv('AGENT_ENABLED', '');

    const { mountAgent } = await import('@discord/agent/mount.js');
    const client = { on: vi.fn() };
    const mounted = await mountAgent(client as never);
    expect(client.on).not.toHaveBeenCalled();
    await mounted.close();
  });
});
