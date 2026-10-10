import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('config', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses provided env vars', async () => {
    vi.stubEnv('DISCORD_TOKEN', 'test-token');
    vi.stubEnv('BOT_CLIENT_ID', 'test-client-id');
    vi.stubEnv('GUILD_ID', 'test-guild-id');
    vi.stubEnv('API_URL', 'http://localhost:8000');
    vi.stubEnv('INGEST_SECRET', 'test-ingest-secret');
    vi.stubEnv('DEV_GUILD_ID', 'dev-guild-id');
    vi.stubEnv('BOT_HOST', 'titan');
    vi.stubEnv('CHRONICLER_BUILD_SHA', 'abc123');

    const { config } = await import('@discord/config.js');
    expect(config.token).toBe('test-token');
    expect(config.clientId).toBe('test-client-id');
    expect(config.guildId).toBe('test-guild-id');
    expect(config.apiUrl).toBe('http://localhost:8000');
    expect(config.ingestSecret).toBe('test-ingest-secret');
    expect(config.devGuildId).toBe('dev-guild-id');
    expect(config.host).toBe('titan');
    expect(config.build).toBe('abc123');
  });

  it('falls back to default apiUrl when API_URL is absent', async () => {
    vi.stubEnv('DISCORD_TOKEN', 'test-token');
    vi.stubEnv('BOT_CLIENT_ID', 'test-client-id');
    vi.stubEnv('GUILD_ID', 'test-guild-id');
    vi.stubEnv('API_URL', '');

    const { config } = await import('@discord/config.js');
    expect(config.apiUrl).toBe('http://api:8000');
  });

  it('devGuildId is undefined when DEV_GUILD_ID is not set', async () => {
    vi.stubEnv('DISCORD_TOKEN', 'test-token');
    vi.stubEnv('BOT_CLIENT_ID', 'test-client-id');
    vi.stubEnv('GUILD_ID', 'test-guild-id');
    vi.stubEnv('DEV_GUILD_ID', '');

    const { config } = await import('@discord/config.js');
    expect(config.devGuildId).toBeUndefined();
  });

  it('throws when INGEST_SECRET is missing with the sensor enabled', async () => {
    vi.stubEnv('DISCORD_TOKEN', 'test-token');
    vi.stubEnv('BOT_CLIENT_ID', 'test-client-id');
    vi.stubEnv('GUILD_ID', 'test-guild-id');
    vi.stubEnv('INGEST_SECRET', '');
    vi.stubEnv('SNIFFER_ENABLED', 'true');

    await expect(import('@discord/config.js')).rejects.toThrow(
      'INGEST_SECRET is required when SNIFFER_ENABLED=true',
    );
  });

  it('throws when DISCORD_TOKEN is missing', async () => {
    vi.stubEnv('DISCORD_TOKEN', '');
    vi.stubEnv('BOT_CLIENT_ID', 'test-client-id');
    vi.stubEnv('GUILD_ID', 'test-guild-id');

    await expect(import('@discord/config.js')).rejects.toThrow(
      'Required environment variable BOT_DISCORD_TOKEN (or DISCORD_TOKEN) is not set',
    );
  });

  it('throws when BOT_CLIENT_ID is missing', async () => {
    vi.stubEnv('DISCORD_TOKEN', 'test-token');
    vi.stubEnv('BOT_CLIENT_ID', '');
    vi.stubEnv('GUILD_ID', 'test-guild-id');

    await expect(import('@discord/config.js')).rejects.toThrow(
      'Required environment variable BOT_CLIENT_ID is not set',
    );
  });

  it('throws when GUILD_ID is missing with the sensor enabled', async () => {
    vi.stubEnv('DISCORD_TOKEN', 'test-token');
    vi.stubEnv('BOT_CLIENT_ID', 'test-client-id');
    vi.stubEnv('GUILD_ID', '');
    vi.stubEnv('SNIFFER_ENABLED', 'true');

    await expect(import('@discord/config.js')).rejects.toThrow(
      'GUILD_ID is required when SNIFFER_ENABLED=true',
    );
  });

  it('keeps the production heartbeat enabled when the sensor is disabled', async () => {
    vi.stubEnv('DISCORD_TOKEN', 'test-token');
    vi.stubEnv('BOT_CLIENT_ID', 'test-client-id');
    vi.stubEnv('GUILD_ID', 'test-guild-id');
    vi.stubEnv('INGEST_SECRET', 'test-ingest-secret');
    vi.stubEnv('SNIFFER_ENABLED', 'false');
    vi.stubEnv('BOT_HEARTBEAT_ENABLED', '');

    const { config } = await import('@discord/config.js');
    expect(config.snifferEnabled).toBe(false);
    expect(config.heartbeatEnabled).toBe(true);
  });

  it('rejects an invalid heartbeat flag', async () => {
    vi.stubEnv('BOT_HEARTBEAT_ENABLED', 'sometimes');
    await expect(import('@discord/config.js')).rejects.toThrow(
      'BOT_HEARTBEAT_ENABLED must be true or false',
    );
  });

  it('requires HTTPS and the deployment-approved API origin outside tests', async () => {
    vi.stubEnv('DISCORD_TOKEN', 'test-token');
    vi.stubEnv('BOT_CLIENT_ID', 'test-client-id');
    vi.stubEnv('GUILD_ID', 'test-guild-id');
    vi.stubEnv('INGEST_SECRET', 'test-ingest-secret');
    const { validateApiUrl } = await import('@discord/config.js');

    expect(() =>
      validateApiUrl('http://api.example.test', {
        allowedOrigin: 'http://api.example.test',
        allowInsecure: false,
        isTest: false,
      }),
    ).toThrow('must use HTTPS');
    expect(() =>
      validateApiUrl('https://attacker.example.test', {
        allowedOrigin: 'https://api.example.test',
        allowInsecure: false,
        isTest: false,
      }),
    ).toThrow('does not match BOT_API_ALLOWED_ORIGIN');
    expect(
      validateApiUrl('https://api.example.test/', {
        allowedOrigin: 'https://api.example.test',
        allowInsecure: false,
        isTest: false,
      }),
    ).toBe('https://api.example.test');
  });

  it('keeps mentions disabled by default and requires an allowlist', async () => {
    vi.stubEnv('AGENT_ENABLED', '');
    let loaded = await import('@discord/config.js');
    expect(loaded.config.agentEnabled).toBe(false);

    vi.resetModules();
    vi.stubEnv('AGENT_ENABLED', 'true');
    vi.stubEnv('AGENT_ALLOWED_GUILD_IDS', '789');
    vi.stubEnv('AGENT_ALLOWED_CHANNEL_IDS', '');
    await expect(import('@discord/config.js')).rejects.toThrow('AGENT_ALLOWED_CHANNEL_IDS');

    vi.resetModules();
    vi.stubEnv('AGENT_ALLOWED_CHANNEL_IDS', '123,456');
    vi.stubEnv('AGENT_ALLOWED_GUILD_IDS', '');
    await expect(import('@discord/config.js')).rejects.toThrow('AGENT_ALLOWED_GUILD_IDS');

    vi.resetModules();
    vi.stubEnv('AGENT_ALLOWED_GUILD_IDS', '789');
    loaded = await import('@discord/config.js');
    expect(loaded.config.agentAllowedChannelIds.has('456')).toBe(true);
    expect(loaded.config.ingestSecret).toBe('test-ingest-secret');
  });

  it('supports DM mentions with an ingest secret and no guild', async () => {
    vi.stubEnv('DISCORD_TOKEN', 'test-token');
    vi.stubEnv('BOT_CLIENT_ID', 'test-client-id');
    vi.stubEnv('SNIFFER_ENABLED', 'false');
    vi.stubEnv('BOT_HEARTBEAT_ENABLED', 'false');
    vi.stubEnv('GUILD_ID', '');
    vi.stubEnv('INGEST_SECRET', '');
    vi.stubEnv('AGENT_ENABLED', 'true');
    vi.stubEnv('INGEST_SECRET', 'test-ingest-secret');
    vi.stubEnv('AGENT_ALLOWED_GUILD_IDS', '');
    vi.stubEnv('AGENT_ALLOWED_CHANNEL_IDS', '');
    vi.stubEnv('AGENT_ALLOWED_DM_USER_IDS', '444');

    const { config } = await import('@discord/config.js');
    expect(config.guildId).toBe('');
    expect(config.ingestSecret).toBe('test-ingest-secret');
    expect(config.agentAllowedDmUserIds.has('444')).toBe(true);
    expect(config.heartbeatEnabled).toBe(false);
  });
});
