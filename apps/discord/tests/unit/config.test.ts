import { describe, expect, it } from 'vitest';
import { loadConfig, validateApiUrl } from '@discord/config.js';
import { testEnv } from '../support/config.js';

describe('loadConfig', () => {
  it.each([
    ['BOT_DISCORD_TOKEN (or DISCORD_TOKEN)', { DISCORD_TOKEN: '', BOT_DISCORD_TOKEN: '' }],
    ['BOT_CLIENT_ID', { BOT_CLIENT_ID: '' }],
    ['BOT_API_ALLOWED_ORIGIN', { BOT_API_ALLOWED_ORIGIN: '' }],
  ] as const)('names missing required variable %s', (fragment, override) => {
    expect(() => loadConfig(testEnv(override))).toThrow(fragment);
  });

  it('uses provided env vars and keeps defaults', () => {
    const config = loadConfig(
      testEnv({
        API_URL: 'http://localhost:8000',
        BOT_API_ALLOWED_ORIGIN: 'http://localhost:8000',
        DEV_GUILD_ID: 'dev-guild-id',
        BOT_HOST: 'titan',
        CHRONICLER_BUILD_SHA: 'abc123',
      }),
    );
    expect(config.token).toBe('test-token');
    expect(config.clientId).toBe('test-client-id');
    expect(config.guildId).toBe('test-guild-id');
    expect(config.apiUrl).toBe('http://localhost:8000');
    expect(config.ingestSecret).toBe('test-ingest-secret');
    expect(config.devGuildId).toBe('dev-guild-id');
    expect(config.host).toBe('titan');
    expect(config.build).toBe('abc123');
  });

  it('falls back to default apiUrl when API_URL is absent', () => {
    const config = loadConfig(testEnv({ API_URL: '' }));
    expect(config.apiUrl).toBe('http://api:8000');
  });

  it('devGuildId is undefined when DEV_GUILD_ID is not set', () => {
    const config = loadConfig(testEnv({ DEV_GUILD_ID: '' }));
    expect(config.devGuildId).toBeUndefined();
  });

  it('throws when INGEST_SECRET is missing with the sensor enabled', () => {
    expect(() =>
      loadConfig(testEnv({ INGEST_SECRET: '', SNIFFER_ENABLED: 'true' })),
    ).toThrow('INGEST_SECRET is required when SNIFFER_ENABLED=true');
  });

  it('throws when GUILD_ID is missing with the sensor enabled', () => {
    expect(() => loadConfig(testEnv({ GUILD_ID: '', SNIFFER_ENABLED: 'true' }))).toThrow(
      'GUILD_ID is required when SNIFFER_ENABLED=true',
    );
  });

  it('keeps the production heartbeat enabled when the sensor is disabled', () => {
    const config = loadConfig(
      testEnv({ SNIFFER_ENABLED: 'false', BOT_HEARTBEAT_ENABLED: '' }),
    );
    expect(config.snifferEnabled).toBe(false);
    expect(config.heartbeatEnabled).toBe(true);
  });

  it('rejects an invalid heartbeat flag', () => {
    expect(() => loadConfig(testEnv({ BOT_HEARTBEAT_ENABLED: 'sometimes' }))).toThrow(
      'BOT_HEARTBEAT_ENABLED must be true or false',
    );
  });

  it('allowInsecure false rejects an http URL', () => {
    expect(() =>
      validateApiUrl('http://api.example.test', {
        allowedOrigin: 'http://api.example.test',
        allowInsecure: false,
      }),
    ).toThrow('must use HTTPS');
  });

  it('requires HTTPS and the deployment-approved API origin', () => {
    expect(() =>
      validateApiUrl('https://attacker.example.test', {
        allowedOrigin: 'https://api.example.test',
        allowInsecure: false,
      }),
    ).toThrow('does not match BOT_API_ALLOWED_ORIGIN');
    expect(
      validateApiUrl('https://api.example.test/', {
        allowedOrigin: 'https://api.example.test',
        allowInsecure: false,
      }),
    ).toBe('https://api.example.test');
  });

  it('keeps mentions disabled by default and requires an allowlist', () => {
    expect(loadConfig(testEnv({ AGENT_ENABLED: '' })).agentEnabled).toBe(false);

    expect(() =>
      loadConfig(
        testEnv({
          AGENT_ENABLED: 'true',
          AGENT_ALLOWED_GUILD_IDS: '789',
          AGENT_ALLOWED_CHANNEL_IDS: '',
        }),
      ),
    ).toThrow('AGENT_ALLOWED_CHANNEL_IDS');

    expect(() =>
      loadConfig(
        testEnv({
          AGENT_ENABLED: 'true',
          AGENT_ALLOWED_CHANNEL_IDS: '123,456',
          AGENT_ALLOWED_GUILD_IDS: '',
        }),
      ),
    ).toThrow('AGENT_ALLOWED_GUILD_IDS');

    const loaded = loadConfig(
      testEnv({
        AGENT_ENABLED: 'true',
        AGENT_ALLOWED_GUILD_IDS: '789',
        AGENT_ALLOWED_CHANNEL_IDS: '123,456',
      }),
    );
    expect(loaded.agentAllowedChannelIds.has('456')).toBe(true);
    expect(loaded.ingestSecret).toBe('test-ingest-secret');
  });

  it('supports DM mentions with an ingest secret and no guild', () => {
    const config = loadConfig(
      testEnv({
        SNIFFER_ENABLED: 'false',
        BOT_HEARTBEAT_ENABLED: 'false',
        GUILD_ID: '',
        AGENT_ENABLED: 'true',
        AGENT_ALLOWED_GUILD_IDS: '',
        AGENT_ALLOWED_CHANNEL_IDS: '',
        AGENT_ALLOWED_DM_USER_IDS: '444',
      }),
    );
    expect(config.guildId).toBe('');
    expect(config.ingestSecret).toBe('test-ingest-secret');
    expect(config.agentAllowedDmUserIds.has('444')).toBe(true);
    expect(config.heartbeatEnabled).toBe(false);
  });
});
