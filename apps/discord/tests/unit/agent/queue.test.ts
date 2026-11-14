import { describe, expect, it } from 'vitest';
import {
  DuplicateRequestError,
  AgentQueue,
  QueueFullError,
  RateLimitedError,
} from '@discord/agent/queue.js';

describe('AgentQueue', () => {
  it('bounds concurrency and rejects a saturated pending queue', async () => {
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queue = new AgentQueue(1, 1);
    queue.reserve('u1', 'g1');
    const first = queue.enqueue('1', () => blocked);
    queue.reserve('u2', 'g1');
    const second = queue.enqueue('2', async () => undefined);
    expect(() => {
      queue.reserve('u3', 'g1');
      queue.enqueue('3', async () => undefined);
    }).toThrow(QueueFullError);
    release?.();
    await Promise.all([first, second]);
  });

  it('deduplicates active source message ids', async () => {
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queue = new AgentQueue();
    queue.reserve('u1', 'g1');
    const first = queue.enqueue('same', () => blocked);
    expect(() => queue.enqueue('same', async () => undefined)).toThrow(
      DuplicateRequestError,
    );
    release?.();
    await first;
  });

  it('enforces the three-per-user rolling window on reserve', () => {
    const queue = new AgentQueue(4, 10, () => 1000);
    queue.reserve('u1', 'g1');
    queue.reserve('u1', 'g1');
    queue.reserve('u1', 'g1');
    expect(() => queue.reserve('u1', 'g1')).toThrow(RateLimitedError);
  });

  it('does not consume a user admission when the shared bucket rejects', () => {
    const queue = new AgentQueue(2, 25, () => 1000);
    for (let n = 0; n < 20; n += 1) {
      queue.reserve(`user-${n}`, 'full');
    }
    for (let n = 0; n < 2; n += 1) {
      expect(() => queue.reserve('victim', 'full')).toThrow(RateLimitedError);
    }
    const internal = queue as unknown as {
      userWindows: Map<string, number[]>;
    };
    expect(internal.userWindows.has('victim')).toBe(false);
    for (let n = 0; n < 3; n += 1) {
      expect(() => queue.reserve('victim', `open-${n}`)).not.toThrow();
    }
  });

  it('evicts expired identity buckets', () => {
    let now = 1000;
    const queue = new AgentQueue(2, 25, () => now);
    queue.reserve('expired-user', 'expired-guild');
    now += 60_000;
    queue.reserve('current-user', 'current-guild');

    const internal = queue as unknown as {
      userWindows: Map<string, number[]>;
      guildWindows: Map<string, number[]>;
    };
    expect(internal.userWindows.has('expired-user')).toBe(false);
    expect(internal.guildWindows.has('expired-guild')).toBe(false);
  });

  it('offers one rate-limit notice per user per window', () => {
    const queue = new AgentQueue(2, 25, () => 1000);
    expect(queue.takeRateLimitNotice('u1')).toBe(true);
    expect(queue.takeRateLimitNotice('u1')).toBe(false);
    expect(queue.takeRateLimitNotice('u2')).toBe(true);
  });

  it('re-offers a notice after a failed delivery releases the claim', () => {
    const queue = new AgentQueue(2, 25, () => 1000);
    expect(queue.takeRateLimitNotice('u1')).toBe(true);
    queue.releaseRateLimitNotice('u1');
    expect(queue.takeRateLimitNotice('u1')).toBe(true);
  });
});
