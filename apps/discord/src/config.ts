/**
 * Pure loader for bot configuration from an env map.
 * Required variables throw naming the variable; optional variables fall back to defaults.
 */

export type BotConfig = {
  token: string;
  clientId: string;
  guildId: string;
  apiUrl: string;
  ingestSecret: string;
  devGuildId: string | undefined;
  snifferEnabled: boolean;
  heartbeatEnabled: boolean;
  host: string | undefined;
  build: string;
  agentEnabled: boolean;
  agentAllowedGuildIds: ReadonlySet<string>;
  agentAllowedChannelIds: ReadonlySet<string>;
  agentAllowedDmUserIds: ReadonlySet<string>;
  agentPublicOrigin: string;
  agentMaxConcurrent: number;
  agentQueueCapacity: number;
};

function requireEnv(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
): string {
  const value = env[name];
  if (value === undefined || value === '') {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

function requireBotToken(env: Readonly<Record<string, string | undefined>>): string {
  const value = env['BOT_DISCORD_TOKEN'] || env['DISCORD_TOKEN'];
  if (value === undefined || value === '') {
    throw new Error(
      'Required environment variable BOT_DISCORD_TOKEN (or DISCORD_TOKEN) is not set',
    );
  }
  return value;
}

function positiveInteger(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
  fallback: number,
): number {
  const rawValue = env[name];
  if (rawValue === undefined || rawValue === '') return fallback;
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer`);
  }
  return value;
}

function discordIdSet(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
): ReadonlySet<string> {
  const values = (env[name] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.some((value) => !/^\d+$/.test(value))) {
    throw new Error(`${name} must contain comma-separated Discord snowflakes`);
  }
  return new Set(values);
}

export function validateApiUrl(
  rawValue: string,
  options: {
    allowedOrigin?: string;
    allowInsecure: boolean;
  },
): string {
  let parsed: URL;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error('Environment variable API_URL must be an absolute URL');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(
      'Environment variable API_URL must not contain credentials, query, or fragment',
    );
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new Error('Environment variable API_URL must be an origin without a path');
  }
  if (
    parsed.protocol !== 'https:' &&
    !(parsed.protocol === 'http:' && options.allowInsecure)
  ) {
    throw new Error(
      'Environment variable API_URL must use HTTPS unless BOT_ALLOW_INSECURE_API_URL=true',
    );
  }
  if (!options.allowedOrigin) {
    throw new Error('Required environment variable BOT_API_ALLOWED_ORIGIN is not set');
  }
  let allowed: URL;
  try {
    allowed = new URL(options.allowedOrigin);
  } catch {
    throw new Error(
      'Environment variable BOT_API_ALLOWED_ORIGIN must be an absolute origin',
    );
  }
  if (
    allowed.username ||
    allowed.password ||
    allowed.search ||
    allowed.hash ||
    (allowed.pathname !== '/' && allowed.pathname !== '')
  ) {
    throw new Error(
      'Environment variable BOT_API_ALLOWED_ORIGIN must be an origin only',
    );
  }
  if (parsed.origin !== allowed.origin) {
    throw new Error(
      'Environment variable API_URL does not match BOT_API_ALLOWED_ORIGIN',
    );
  }
  return parsed.origin;
}

export function loadConfig(
  env: Readonly<Record<string, string | undefined>>,
): BotConfig {
  const snifferEnabled = (env['SNIFFER_ENABLED'] ?? '').toLowerCase() === 'true';
  const heartbeatFlag = (env['BOT_HEARTBEAT_ENABLED'] ?? '').trim().toLowerCase();
  if (heartbeatFlag !== '' && heartbeatFlag !== 'true' && heartbeatFlag !== 'false') {
    throw new Error('BOT_HEARTBEAT_ENABLED must be true or false');
  }
  const heartbeatEnabled = heartbeatFlag === '' || heartbeatFlag === 'true';
  const agentEnabled = (env['AGENT_ENABLED'] ?? '').toLowerCase() === 'true';
  const agentAllowedGuildIds = discordIdSet(env, 'AGENT_ALLOWED_GUILD_IDS');
  const agentAllowedChannelIds = discordIdSet(env, 'AGENT_ALLOWED_CHANNEL_IDS');
  const agentAllowedDmUserIds = discordIdSet(env, 'AGENT_ALLOWED_DM_USER_IDS');
  if (
    agentEnabled &&
    agentAllowedDmUserIds.size === 0 &&
    (agentAllowedChannelIds.size === 0 || agentAllowedGuildIds.size === 0)
  ) {
    throw new Error(
      'AGENT_ENABLED=true requires AGENT_ALLOWED_DM_USER_IDS or both AGENT_ALLOWED_GUILD_IDS and AGENT_ALLOWED_CHANNEL_IDS',
    );
  }
  const guildId = env['GUILD_ID'] ?? '';
  const ingestSecret = env['INGEST_SECRET'] ?? '';
  if (snifferEnabled && guildId === '') {
    throw new Error('GUILD_ID is required when SNIFFER_ENABLED=true');
  }
  if (snifferEnabled && ingestSecret === '') {
    throw new Error('INGEST_SECRET is required when SNIFFER_ENABLED=true');
  }
  if (heartbeatEnabled && guildId === '') {
    throw new Error('GUILD_ID is required when BOT_HEARTBEAT_ENABLED=true');
  }
  if (heartbeatEnabled && ingestSecret === '') {
    throw new Error('INGEST_SECRET is required when BOT_HEARTBEAT_ENABLED=true');
  }
  if (agentEnabled && ingestSecret === '') {
    throw new Error('INGEST_SECRET is required when AGENT_ENABLED=true');
  }

  return {
    token: requireBotToken(env),
    clientId: requireEnv(env, 'BOT_CLIENT_ID'),
    guildId,
    apiUrl: validateApiUrl(env['API_URL'] || 'http://api:8000', {
      allowedOrigin: env['BOT_API_ALLOWED_ORIGIN'] || undefined,
      allowInsecure: (env['BOT_ALLOW_INSECURE_API_URL'] ?? '').toLowerCase() === 'true',
    }),
    ingestSecret,
    devGuildId: env['DEV_GUILD_ID'] || undefined,
    snifferEnabled,
    heartbeatEnabled,
    host: env['BOT_HOST'] || undefined,
    build:
      env['BOT_BUILD_ID'] ||
      env['CHRONICLER_BUILD_SHA'] ||
      env['BUILD_SHA'] ||
      env['BUILD_VERSION'] ||
      'unknown',
    agentEnabled,
    agentAllowedGuildIds,
    agentAllowedChannelIds,
    agentAllowedDmUserIds,
    agentPublicOrigin:
      env['AGENT_PUBLIC_ORIGIN'] || 'https://chronicler.smokebombstudios.com',
    agentMaxConcurrent: positiveInteger(env, 'AGENT_MAX_CONCURRENT', 2),
    agentQueueCapacity: positiveInteger(env, 'AGENT_QUEUE_CAPACITY', 25),
  };
}
