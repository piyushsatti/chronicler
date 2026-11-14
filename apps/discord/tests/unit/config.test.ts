import { describe, expect, it } from 'vitest';
import { loadConfig, validateApiUrl } from '@discord/config.js';
import { testEnv } from '../support/config.js';

describe('loadConfig', () => {
  it.each([
    ['BOT_DISCORD_TOKEN', { BOT_DISCORD_TOKEN: '' }],
    ['API_URL', { API_URL: '' }],
    ['BOT_API_ALLOWED_ORIGIN', { BOT_API_ALLOWED_ORIGIN: '' }],
  ] as const)('names missing required variable %s', (fragment, override) => {
    expect(() => loadConfig(testEnv(override))).toThrow(fragment);
  });

  it('uses provided env vars and keeps defaults', () => {
    const config = loadConfig(
      testEnv({
        API_URL: 'http://localhost:8080',
        BOT_API_ALLOWED_ORIGIN: 'http://localhost:8080',
        BOT_HOST: 'titan',
        BOT_BUILD_ID: 'abc123',
      }),
    );
    expect(config.token).toBe('test-token');
    expect(config.guildId).toBe('test-guild-id');
    expect(config.apiUrl).toBe('http://localhost:8080');
    expect(config.ingestSecret).toBe('test-ingest-secret');
    expect(config.host).toBe('titan');
    expect(config.build).toBe('abc123');
  });

  it('loads with only the current required env names', () => {
    const config = loadConfig(testEnv());
    expect(config.token).toBe('test-token');
    expect(config.apiUrl).toBe('http://api:8080');
  });

  it('does not accept the legacy discord token env alone', () => {
    const legacyToken = ['DISCORD', 'TOKEN'].join('_');
    expect(() =>
      loadConfig(testEnv({ BOT_DISCORD_TOKEN: '', [legacyToken]: 'legacy-token' })),
    ).toThrow('BOT_DISCORD_TOKEN');
  });

  it('ignores legacy build id aliases', () => {
    const legacyChronicler = ['CHRONICLER', 'BUILD', 'SHA'].join('_');
    const legacySha = ['BUILD', 'SHA'].join('_');
    const legacyVersion = ['BUILD', 'VERSION'].join('_');
    const config = loadConfig(
      testEnv({
        BOT_BUILD_ID: '',
        [legacyChronicler]: 'legacy-sha',
        [legacySha]: 'legacy-sha',
        [legacyVersion]: 'legacy-version',
      }),
    );
    expect(config.build).toBe('unknown');
  });

  it('requires AGENT_PUBLIC_ORIGIN when the agent is on', () => {
    expect(() =>
      loadConfig(
        testEnv({
          AGENT_ENABLED: 'true',
          AGENT_ALLOWED_DM_USER_IDS: '444',
          AGENT_PUBLIC_ORIGIN: '',
        }),
      ),
    ).toThrow('AGENT_PUBLIC_ORIGIN');
  });

  it('rejects an http AGENT_PUBLIC_ORIGIN', () => {
    expect(() =>
      loadConfig(
        testEnv({
          AGENT_ENABLED: 'true',
          AGENT_ALLOWED_DM_USER_IDS: '444',
          AGENT_PUBLIC_ORIGIN: 'http://chronicler.example',
        }),
      ),
    ).toThrow('AGENT_PUBLIC_ORIGIN must use HTTPS');
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
          AGENT_PUBLIC_ORIGIN: 'https://chronicler.example',
        }),
      ),
    ).toThrow('AGENT_ALLOWED_CHANNEL_IDS');

    expect(() =>
      loadConfig(
        testEnv({
          AGENT_ENABLED: 'true',
          AGENT_ALLOWED_CHANNEL_IDS: '123,456',
          AGENT_ALLOWED_GUILD_IDS: '',
          AGENT_PUBLIC_ORIGIN: 'https://chronicler.example',
        }),
      ),
    ).toThrow('AGENT_ALLOWED_GUILD_IDS');

    const loaded = loadConfig(
      testEnv({
        AGENT_ENABLED: 'true',
        AGENT_ALLOWED_GUILD_IDS: '789',
        AGENT_ALLOWED_CHANNEL_IDS: '123,456',
        AGENT_PUBLIC_ORIGIN: 'https://chronicler.example',
      }),
    );
    expect(loaded.agentAllowedChannelIds.has('456')).toBe(true);
    expect(loaded.ingestSecret).toBe('test-ingest-secret');
    expect(loaded.agentPublicOrigin).toBe('https://chronicler.example');
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
        AGENT_PUBLIC_ORIGIN: 'https://chronicler.example',
      }),
    );
    expect(config.guildId).toBe('');
    expect(config.ingestSecret).toBe('test-ingest-secret');
    expect(config.agentAllowedDmUserIds.has('444')).toBe(true);
    expect(config.heartbeatEnabled).toBe(false);
  });
});
