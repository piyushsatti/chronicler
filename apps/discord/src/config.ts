/**
 * Reads and validates configuration from environment variables.
 * Required variables throw at startup if absent; optional variables fall back to defaults.
 *
 * Loads apps/discord/.env.local (copy of .env.example). A missing file is
 * ignored so Docker can inject the same names from the environment.
 */
import { config as loadDotenv } from 'dotenv';

if (!process.env['VITEST']) {
  loadDotenv({
    path: new URL('../.env.local', import.meta.url),
    quiet: true,
  });
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

function requireBotToken(): string {
  const value = process.env['BOT_DISCORD_TOKEN'] || process.env['DISCORD_TOKEN'];
  if (value === undefined || value === '') {
    throw new Error(
      'Required environment variable BOT_DISCORD_TOKEN (or DISCORD_TOKEN) is not set',
    );
  }
  return value;
}

function positiveInteger(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === '') return fallback;
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer`);
  }
  return value;
}

function discordIdSet(name: string): ReadonlySet<string> {
  const values = (process.env[name] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.some((value) => !/^\d+$/.test(value))) {
    throw new Error(`${name} must contain comma-separated Discord snowflakes`);
  }
  return new Set(values);
}

const isVitest = process.env['VITEST'] !== undefined;
const snifferEnabled = (process.env['SNIFFER_ENABLED'] ?? '').toLowerCase() === 'true';
const heartbeatFlag = (process.env['BOT_HEARTBEAT_ENABLED'] ?? '').trim().toLowerCase();
if (heartbeatFlag !== '' && heartbeatFlag !== 'true' && heartbeatFlag !== 'false') {
  throw new Error('BOT_HEARTBEAT_ENABLED must be true or false');
}
const heartbeatEnabled = heartbeatFlag === '' || heartbeatFlag === 'true';
const agentEnabled = (process.env['AGENT_ENABLED'] ?? '').toLowerCase() === 'true';
const agentAllowedGuildIds = discordIdSet('AGENT_ALLOWED_GUILD_IDS');
const agentAllowedChannelIds = discordIdSet('AGENT_ALLOWED_CHANNEL_IDS');
const agentAllowedDmUserIds = discordIdSet('AGENT_ALLOWED_DM_USER_IDS');
if (
  agentEnabled &&
  agentAllowedDmUserIds.size === 0 &&
  (agentAllowedChannelIds.size === 0 || agentAllowedGuildIds.size === 0)
) {
  throw new Error(
    'AGENT_ENABLED=true requires AGENT_ALLOWED_DM_USER_IDS or both AGENT_ALLOWED_GUILD_IDS and AGENT_ALLOWED_CHANNEL_IDS',
  );
}
const guildId = process.env['GUILD_ID'] ?? '';
const ingestSecret = process.env['INGEST_SECRET'] ?? '';
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

export function validateApiUrl(
  rawValue: string,
  options: {
    allowedOrigin?: string;
    allowInsecure: boolean;
    isTest: boolean;
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
    !(parsed.protocol === 'http:' && (options.isTest || options.allowInsecure))
  ) {
    throw new Error(
      'Environment variable API_URL must use HTTPS unless BOT_ALLOW_INSECURE_API_URL=true',
    );
  }
  if (!options.isTest && !options.allowedOrigin) {
    throw new Error('Required environment variable BOT_API_ALLOWED_ORIGIN is not set');
  }
  if (options.allowedOrigin) {
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
  }
  return parsed.origin;
}

export const config = {
  token: requireBotToken(),
  clientId: requireEnv('BOT_CLIENT_ID'),
  guildId,
  apiUrl: validateApiUrl(process.env['API_URL'] || 'http://api:8000', {
    allowedOrigin: process.env['BOT_API_ALLOWED_ORIGIN'] || undefined,
    allowInsecure:
      (process.env['BOT_ALLOW_INSECURE_API_URL'] ?? '').toLowerCase() === 'true',
    isTest: isVitest,
  }),
  ingestSecret,
  devGuildId: process.env['DEV_GUILD_ID'] || undefined,
  snifferEnabled,
  heartbeatEnabled,
  host: process.env['BOT_HOST'] || undefined,
  build:
    process.env['BOT_BUILD_ID'] ||
    process.env['CHRONICLER_BUILD_SHA'] ||
    process.env['BUILD_SHA'] ||
    process.env['BUILD_VERSION'] ||
    'unknown',
  agentEnabled,
  agentAllowedGuildIds,
  agentAllowedChannelIds,
  agentAllowedDmUserIds,
  agentPublicOrigin:
    process.env['AGENT_PUBLIC_ORIGIN'] || 'https://chronicler.smokebombstudios.com',
  agentMaxConcurrent: positiveInteger('AGENT_MAX_CONCURRENT', 2),
  agentQueueCapacity: positiveInteger('AGENT_QUEUE_CAPACITY', 25),
} as const;
