/**
 * Entry point for the Chronicler Discord bot.
 */
import { config as loadDotenv } from 'dotenv';
import { loadConfig } from './config.js';
import { start } from './session.js';
import { logger } from './log.js';
import { realProcess } from './process.js';

loadDotenv({
  path: new URL('../.env.local', import.meta.url),
  quiet: true,
});

const config = loadConfig(process.env);

realProcess.onFatal((payload) => {
  logger.error(
    'Fatal process error',
    payload !== null && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : { error: String(payload) },
  );
  realProcess.exit(1);
});

start({ config }).catch((err: unknown) => {
  logger.error('Failed to start Chronicler bot', {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  realProcess.exit(1);
});
