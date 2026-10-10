/**
 * Structured JSON logger for the Chronicler bot.
 * Each method outputs a single JSON string via the corresponding console method.
 */

type LogLevel = 'info' | 'warn' | 'error';

type LogRecord = {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
};

function log(
  level: LogLevel,
  message: string,
  metadata: Record<string, unknown> = {},
): void {
  const record: LogRecord = {
    ...metadata,
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  const line = JSON.stringify(record);
  if (level === 'info') {
    console.info(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.error(line);
  }
}

export const logger = {
  /**
   * Log an informational message with optional metadata.
   */
  info(message: string, metadata: Record<string, unknown> = {}): void {
    log('info', message, metadata);
  },

  /**
   * Log a warning message with optional metadata.
   */
  warn(message: string, metadata: Record<string, unknown> = {}): void {
    log('warn', message, metadata);
  },

  /**
   * Log an error message with optional metadata.
   */
  error(message: string, metadata: Record<string, unknown> = {}): void {
    log('error', message, metadata);
  },
};
