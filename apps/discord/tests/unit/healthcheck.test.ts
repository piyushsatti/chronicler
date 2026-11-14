/**
 * Freshness helper and alive-file touch from the shard health timer.
 */

import { writeFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@discord/log.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    writeFileSync: vi.fn(actual.writeFileSync),
  };
});

function fakeClient(): import('discord.js').Client {
  const client = { on: vi.fn() };
  return client as unknown as import('discord.js').Client;
}

describe('isFresh', () => {
  it('treats 149s as fresh and 151s as stale', async () => {
    const { isFresh } = await import('@discord/healthcheck.js');
    const now = 1_000_000;
    const maxAgeMs = 150_000;
    expect(isFresh(now - 149_000, now, maxAgeMs)).toBe(true);
    expect(isFresh(now - 151_000, now, maxAgeMs)).toBe(false);
  });
});

describe('alive file from timer', () => {
  let alivePath: string;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    const { BOT_ALIVE_PATH } = await import('@discord/healthcheck.js');
    alivePath = BOT_ALIVE_PATH;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes the alive file on the timer with heartbeat off', async () => {
    const { mountShardHealth } = await import('@discord/health.js');
    const dispose = mountShardHealth(fakeClient(), {
      heartbeatEnabled: false,
      heartbeatPoster: vi.fn(),
      heartbeatIntervalMs: 1_000,
      nonReadyExitMs: 60_000,
    });

    expect(writeFileSync).toHaveBeenCalledWith(alivePath, '');
    vi.mocked(writeFileSync).mockClear();

    await vi.advanceTimersByTimeAsync(1_000);

    expect(writeFileSync).toHaveBeenCalledWith(alivePath, '');
    expect(writeFileSync).toHaveBeenCalledTimes(1);
    dispose();
  });
});
