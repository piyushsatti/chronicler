/**
 * Tests for the heartbeat interval added to shard/health.ts (#445, dead man's
 * switch pattern). Uses fake timers + an injected poster so no real
 * network/interval leaks between tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mountShardHealth, postHeartbeat } from '@discord/health.js';
import { testConfig } from '../support/config.js';

vi.mock('@discord/log.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const config = testConfig();

function fakeClient(): import('discord.js').Client {
  const client = { on: vi.fn() };
  return client as unknown as import('discord.js').Client;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('postHeartbeat', () => {
  it('POSTs JSON to /v1/ingest/heartbeat with X-Ingest-Secret', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await postHeartbeat(config, {
      gateway_ready: true,
      shard_state: { '0': 'ready' },
      host: 'test-host',
      build_sha: 'test-build',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${config.apiUrl}/v1/ingest/heartbeat`);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual(
      expect.objectContaining({
        'X-Ingest-Secret': config.ingestSecret,
        'content-type': 'application/json',
      }),
    );
    expect(JSON.parse(String(init.body))).toEqual({
      gateway_ready: true,
      shard_state: { '0': 'ready' },
      host: 'test-host',
      build_sha: 'test-build',
    });
  });
});

describe('mountShardHealth heartbeat', () => {
  it('can disable only the periodic ingest heartbeat for an isolated agent process', async () => {
    const poster = vi.fn().mockResolvedValue(undefined);
    const dispose = mountShardHealth(fakeClient(), config, {
      heartbeatEnabled: false,
      heartbeatPoster: poster,
      heartbeatIntervalMs: 1,
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(poster).not.toHaveBeenCalled();
    dispose();
  });

  it('keeps the gateway liveness watchdog active when heartbeat posts are disabled', async () => {
    const poster = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();
    const dispose = mountShardHealth(fakeClient(), config, {
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
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const client = {
      on: (event: string, handler: (...args: unknown[]) => void) => {
        handlers.set(event, handler);
      },
    } as unknown as import('discord.js').Client;
    const poster = vi.fn().mockResolvedValue(undefined);
    const dispose = mountShardHealth(client, config, {
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
    const poster = vi.fn().mockResolvedValue(undefined);
    const dispose = mountShardHealth(fakeClient(), config, {
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
    const poster = vi.fn().mockResolvedValue(undefined);
    const dispose = mountShardHealth(fakeClient(), config, {
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
    const poster = vi.fn().mockResolvedValue(undefined);
    const dispose = mountShardHealth(fakeClient(), config, { heartbeatPoster: poster });

    await vi.advanceTimersByTimeAsync(59_999);
    expect(poster).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(poster).toHaveBeenCalledTimes(1);

    dispose();
  });

  it('does not exit after the watchdog disposer runs', async () => {
    const exit = vi.fn();
    const dispose = mountShardHealth(fakeClient(), config, {
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
    const dispose = mountShardHealth(client, config, {
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
