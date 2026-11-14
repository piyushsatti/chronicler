import type { BotConfig } from '../../src/config.js';

export function testConfig(overrides: Partial<BotConfig> = {}): BotConfig {
  return {
    token: 'test-token',
    guildId: 'test-guild-id',
    apiUrl: 'http://api:8080',
    ingestSecret: 'test-ingest-secret',
    snifferEnabled: false,
    heartbeatEnabled: true,
    host: undefined,
    build: 'unknown',
    agentEnabled: false,
    agentAllowedGuildIds: new Set(),
    agentAllowedChannelIds: new Set(),
    agentAllowedDmUserIds: new Set(),
    agentPublicOrigin: '',
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
    BOT_DISCORD_TOKEN: 'test-token',
    GUILD_ID: 'test-guild-id',
    INGEST_SECRET: 'test-ingest-secret',
    API_URL: 'http://api:8080',
    BOT_API_ALLOWED_ORIGIN: 'http://api:8080',
    BOT_ALLOW_INSECURE_API_URL: 'true',
    ...overrides,
  };
}
