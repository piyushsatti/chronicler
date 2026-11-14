/**
 * Tests for shard/health.ts -- the discriminator between a resumed session
 * (nothing lost) and a fresh identify (everything in the gap lost).
 *
 * The bug this guards against is silence: the previous logging could not tell
 * the two apart, so a night of reconnects said nothing about whether activity
 * was dropped (FINDINGS 58).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mountShardHealth } from '@discord/health.js';
import { logger } from '@discord/log.js';
import { testConfig } from '../support/config.js';

vi.mock('@discord/log.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const config = testConfig();

beforeEach(() => {
  vi.clearAllMocks();
});

/** Minimal Client stand-in: records handlers and lets a test fire them. */
function fakeClient(): {
  client: import('discord.js').Client;
  emit: (event: string, ...args: unknown[]) => void;
  events: () => string[];
} {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const client = {
    on: (event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
    },
  };
  return {
    client: client as unknown as import('discord.js').Client,
    emit: (event, ...args) => {
      const handler = handlers.get(event);
      if (handler === undefined) {
        throw new Error(`no handler registered for "${event}"`);
      }
      handler(...args);
    },
    events: () => [...handlers.keys()],
  };
}

/** Clock that advances by a fixed step on every read. */
function steppingClock(start: number, step: number): () => number {
  let t = start - step;
  return () => {
    t += step;
    return t;
  };
}

describe('mountShardHealth', () => {
  it('subscribes to every shard lifecycle event, not just the attempt', () => {
    const { client, events } = fakeClient();

    mountShardHealth(client, config);

    expect(events().sort()).toEqual(
      [
        'shardDisconnect',
        'shardError',
        'shardReady',
        'shardReconnecting',
        'shardResume',
      ].sort(),
    );
  });

  it('logs the first shardReady as a plain startup, not a loss', () => {
    const { client, emit } = fakeClient();

    mountShardHealth(client, config);
    emit('shardReady', 0, new Set(['guild-a']));

    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('Shard ready', {
      shardId: 0,
      unavailableGuilds: 1,
    });
  });

  it('reports a resume as no loss, carrying replayedEvents and the gap', () => {
    const { client, emit } = fakeClient();

    mountShardHealth(client, config, { now: steppingClock(1000, 250) });
    emit('shardReconnecting', 0);
    emit('shardResume', 0, 12);

    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('Shard resumed, session intact', {
      shardId: 0,
      replayedEvents: 12,
      gapMs: 250,
      eventsLost: false,
    });
  });

  it('reports a shardReady DURING a reconnect as a lost session', () => {
    const { client, emit } = fakeClient();

    mountShardHealth(client, config, { now: steppingClock(1000, 500) });
    emit('shardReconnecting', 0);
    emit('shardReady', 0, undefined);

    expect(logger.error).toHaveBeenCalledTimes(1);
    const [message, meta] = vi.mocked(logger.error).mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(message).toContain('session lost');
    expect(meta).toMatchObject({ shardId: 0, gapMs: 500, eventsLost: true });
  });

  it('notifies subscribers of session_lost after reconnect then shardReady', () => {
    const { client, emit } = fakeClient();
    const received: unknown[] = [];

    const health = mountShardHealth(client, config, {
      now: steppingClock(1000, 500),
    });
    health.subscribe((event) => {
      received.push(event);
    });
    emit('shardReconnecting', 0);
    emit('shardReady', 0, undefined);

    expect(received).toEqual([{ type: 'session_lost', shardId: 0, gapMs: 500 }]);
  });

  it('does not carry a resolved reconnect into the next shardReady', () => {
    const { client, emit } = fakeClient();

    mountShardHealth(client, config, { now: steppingClock(1000, 100) });
    emit('shardReconnecting', 0);
    emit('shardResume', 0, 3);
    emit('shardReady', 0, undefined);

    // The resume cleared the reconnect, so the later ready is a plain ready.
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('tracks shards independently', () => {
    const { client, emit } = fakeClient();

    mountShardHealth(client, config, { now: steppingClock(1000, 100) });
    emit('shardReconnecting', 1);
    emit('shardReady', 0, undefined); // shard 0 never reconnected

    expect(logger.error).not.toHaveBeenCalled();

    emit('shardReady', 1, undefined); // shard 1 did
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('logs a terminal disconnect with its close code', () => {
    const { client, emit } = fakeClient();

    mountShardHealth(client, config);
    emit('shardDisconnect', { code: 4014, reason: '', wasClean: false }, 0);

    expect(logger.error).toHaveBeenCalledWith(
      'Shard disconnected and will not reconnect',
      {
        shardId: 0,
        code: 4014,
      },
    );
  });

  it('exits on a terminal disconnect when exitOnTerminal is set', () => {
    const { client, emit } = fakeClient();
    const exit = vi.fn();

    mountShardHealth(client, config, { exitOnTerminal: true, exit });
    emit('shardDisconnect', { code: 4004, reason: '', wasClean: false }, 0);

    expect(exit).toHaveBeenCalledWith(1);
  });

  it('logs a shard websocket error', () => {
    const { client, emit } = fakeClient();

    mountShardHealth(client, config);
    emit('shardError', new Error('ECONNRESET'), 0);

    expect(logger.error).toHaveBeenCalledWith('Shard websocket error', {
      shardId: 0,
      error: 'ECONNRESET',
    });
  });
});
