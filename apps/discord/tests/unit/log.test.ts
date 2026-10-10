import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '@discord/log.js';

describe('logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('info outputs a JSON string via console.info', () => {
    logger.info('test message');
    expect(console.info).toHaveBeenCalledOnce();
    const output = (console.info as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('test message');
    expect(typeof parsed.timestamp).toBe('string');
    expect(new Date(parsed.timestamp as string).toISOString()).toBe(parsed.timestamp);
  });

  it('warn outputs a JSON string via console.warn', () => {
    logger.warn('a warning');
    expect(console.warn).toHaveBeenCalledOnce();
    const output = (console.warn as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed.level).toBe('warn');
    expect(parsed.message).toBe('a warning');
  });

  it('error outputs a JSON string via console.error', () => {
    logger.error('something broke');
    expect(console.error).toHaveBeenCalledOnce();
    const output = (console.error as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed.level).toBe('error');
    expect(parsed.message).toBe('something broke');
  });

  it('spreads additional metadata into the log object', () => {
    logger.info('with metadata', { requestId: 'abc123', userId: 42 });
    const output = (console.info as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed.requestId).toBe('abc123');
    expect(parsed.userId).toBe(42);
  });

  it('metadata does not overwrite level or message', () => {
    logger.info('original', { level: 'OVERRIDE', message: 'OVERRIDE' });
    const output = (console.info as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('original');
  });
});
