import type { BotConfig } from '../../src/config.js';

export function testConfig(overrides: Partial<BotConfig> = {}): BotConfig {
  return {
    token: 'test-token',
    clientId: 'test-client-id',
    guildId: 'test-guild-id',
    apiUrl: 'http://api:8000',
    ingestSecret: 'test-ingest-secret',
    devGuildId: undefined,
    snifferEnabled: false,
    heartbeatEnabled: true,
    host: undefined,
    build: 'unknown',
    agentEnabled: false,
    agentAllowedGuildIds: new Set(),
    agentAllowedChannelIds: new Set(),
    agentAllowedDmUserIds: new Set(),
    agentPublicOrigin: 'https://chronicler.smokebombstudios.com',
    agentMaxConcurrent: 2,
    agentQueueCapacity: 25,
    ...overrides,
  };
}

/** Env map that loadConfig accepts for the default http API URL. */
export function testEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    DISCORD_TOKEN: 'test-token',
    BOT_CLIENT_ID: 'test-client-id',
    GUILD_ID: 'test-guild-id',
    INGEST_SECRET: 'test-ingest-secret',
    BOT_API_ALLOWED_ORIGIN: 'http://api:8000',
    BOT_ALLOW_INSECURE_API_URL: 'true',
    ...overrides,
  };
}
