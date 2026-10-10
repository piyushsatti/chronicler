/**
 * Entry point for the Chronicler Discord bot.
 */
import 'dotenv/config';
import { start } from './session.js';
import { logger } from './log.js';

start().catch((err: unknown) => {
  logger.error('Failed to start Chronicler bot', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
