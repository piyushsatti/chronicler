/**
 * Tests for the heartbeat interval added to shard/health.ts (#445, dead man's
 * switch pattern). Uses fake timers + an injected poster so no real
 * network/interval leaks between tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@discord/log.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function fakeClient(): import('discord.js').Client {
  const client = { on: vi.fn() };
  return client as unknown as import('discord.js').Client;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('mountShardHealth heartbeat', () => {
  it('can disable only the periodic ingest heartbeat for an isolated agent process', async () => {
    const { mountShardHealth } = await import('@discord/health.js');
    const poster = vi.fn().mockResolvedValue(undefined);
    const dispose = mountShardHealth(fakeClient(), {
      heartbeatEnabled: false,
      heartbeatPoster: poster,
      heartbeatIntervalMs: 1,
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(poster).not.toHaveBeenCalled();
    dispose();
  });

  it('keeps the gateway liveness watchdog active when heartbeat posts are disabled', async () => {
    const { mountShardHealth } = await import('@discord/health.js');
    const poster = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();
    const dispose = mountShardHealth(fakeClient(), {
      heartbeatEnabled: false,
      heartbeatPoster: poster,
      heartbeatIntervalMs: 1_000,
      nonReadyExitMs: 2_000,
      exit,
    });

    await vi.advanceTimersByTimeAsync(2_000);

    expect(poster).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
    dispose();
  });

  it('marks the heartbeat unhealthy while the gateway is disconnected and includes identity', async () => {
    const { mountShardHealth } = await import('@discord/health.js');
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const client = {
      on: (event: string, handler: (...args: unknown[]) => void) => {
        handlers.set(event, handler);
      },
    } as unknown as import('discord.js').Client;
    const poster = vi.fn().mockResolvedValue(undefined);
    const dispose = mountShardHealth(client, {
      heartbeatPoster: poster,
      heartbeatIntervalMs: 1000,
      host: 'test-host',
      build: 'test-build',
    });

    handlers.get('shardReady')?.(2, undefined);
    await vi.advanceTimersByTimeAsync(1000);
    expect(poster).toHaveBeenLastCalledWith({
      gateway_ready: true,
      shard_state: { '2': 'ready' },
      host: 'test-host',
      build_sha: 'test-build',
    });

    handlers.get('shardReconnecting')?.(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(poster).toHaveBeenLastCalledWith({
      gateway_ready: false,
      shard_state: { '2': 'reconnecting' },
      host: 'test-host',
      build_sha: 'test-build',
    });
    dispose();
  });

  it('polls the injected poster on the given interval', async () => {
    const { mountShardHealth } = await import('@discord/health.js');
    const poster = vi.fn().mockResolvedValue(undefined);
    const dispose = mountShardHealth(fakeClient(), {
      heartbeatPoster: poster,
      heartbeatIntervalMs: 1000,
    });

    expect(poster).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(poster).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(poster).toHaveBeenCalledTimes(3);

    dispose();
  });

  it('the returned disposer stops further polling', async () => {
    const { mountShardHealth } = await import('@discord/health.js');
    const poster = vi.fn().mockResolvedValue(undefined);
    const dispose = mountShardHealth(fakeClient(), {
      heartbeatPoster: poster,
      heartbeatIntervalMs: 1000,
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(poster).toHaveBeenCalledTimes(1);

    dispose();

    await vi.advanceTimersByTimeAsync(5000);
    expect(poster).toHaveBeenCalledTimes(1);
  });

  it('defaults to a 60s interval when none is given', async () => {
    const { mountShardHealth } = await import('@discord/health.js');
    const poster = vi.fn().mockResolvedValue(undefined);
    const dispose = mountShardHealth(fakeClient(), { heartbeatPoster: poster });

    await vi.advanceTimersByTimeAsync(59_999);
    expect(poster).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(poster).toHaveBeenCalledTimes(1);

    dispose();
  });

  it('does not exit after the watchdog disposer runs', async () => {
    const { mountShardHealth } = await import('@discord/health.js');
    const exit = vi.fn();
    const dispose = mountShardHealth(fakeClient(), {
      heartbeatEnabled: false,
      heartbeatIntervalMs: 1_000,
      nonReadyExitMs: 2_000,
      exit,
    });
    dispose();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(exit).not.toHaveBeenCalled();
  });

  it('does not exit when the heartbeat poster rejects', async () => {
    const { mountShardHealth } = await import('@discord/health.js');
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const client = {
      on: (event: string, handler: (...args: unknown[]) => void) => {
        handlers.set(event, handler);
      },
      once: (event: string, handler: (...args: unknown[]) => void) => {
        if (event === 'clientReady') handler();
      },
    } as unknown as import('discord.js').Client;
    const exit = vi.fn();
    const poster = vi.fn().mockRejectedValue(new Error('api down'));
    const dispose = mountShardHealth(client, {
      heartbeatPoster: poster,
      heartbeatIntervalMs: 1_000,
      nonReadyExitMs: 60_000,
      exit,
    });
    handlers.get('shardReady')?.(0, undefined);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(poster).toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
    dispose();
  });
});
