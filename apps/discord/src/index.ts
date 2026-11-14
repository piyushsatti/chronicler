/**
 * Entry point for the Chronicler Discord bot.
 */
import { config as loadDotenv } from 'dotenv';
import { loadConfig } from './config.js';
import { start } from './session.js';
import { logger } from './log.js';

loadDotenv({
  path: new URL('../.env.local', import.meta.url),
  quiet: true,
});

const config = loadConfig(process.env);

start({ config }).catch((err: unknown) => {
  logger.error('Failed to start Chronicler bot', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
