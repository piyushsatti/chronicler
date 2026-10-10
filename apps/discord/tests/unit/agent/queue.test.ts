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
    const first = queue.enqueue('1', 'u1', 'g1', () => blocked);
    const second = queue.enqueue('2', 'u2', 'g1', async () => undefined);
    expect(() => queue.enqueue('3', 'u3', 'g1', async () => undefined)).toThrow(
      QueueFullError,
    );
    release?.();
    await Promise.all([first, second]);
  });

  it('deduplicates active source message ids', async () => {
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queue = new AgentQueue();
    const first = queue.enqueue('same', 'u1', 'g1', () => blocked);
    expect(() => queue.enqueue('same', 'u1', 'g1', async () => undefined)).toThrow(
      DuplicateRequestError,
    );
    release?.();
    await first;
  });

  it('enforces the three-per-user rolling window', () => {
    const queue = new AgentQueue(4, 10, () => 1000);
    void queue.enqueue('1', 'u1', 'g1', async () => undefined);
    void queue.enqueue('2', 'u1', 'g1', async () => undefined);
    void queue.enqueue('3', 'u1', 'g1', async () => undefined);
    expect(() => queue.enqueue('4', 'u1', 'g1', async () => undefined)).toThrow(
      RateLimitedError,
    );
  });

  it('does not consume a user admission when the shared bucket rejects', () => {
    const queue = new AgentQueue(2, 25, () => 1000);
    for (let n = 0; n < 20; n += 1) {
      void queue.enqueue(`shared-${n}`, `user-${n}`, 'full', async () => undefined);
    }
    for (let n = 0; n < 2; n += 1) {
      expect(() =>
        queue.enqueue(`rejected-${n}`, 'victim', 'full', async () => undefined),
      ).toThrow(RateLimitedError);
    }
    const internal = queue as unknown as {
      userWindows: Map<string, number[]>;
    };
    expect(internal.userWindows.has('victim')).toBe(false);
    for (let n = 0; n < 3; n += 1) {
      expect(() =>
        queue.enqueue(`accepted-${n}`, 'victim', `open-${n}`, async () => undefined),
      ).not.toThrow();
    }
  });

  it('evicts expired identity buckets', () => {
    let now = 1000;
    const queue = new AgentQueue(2, 25, () => now);
    void queue.enqueue('first', 'expired-user', 'expired-guild', async () => undefined);
    now += 60_000;
    void queue.enqueue(
      'second',
      'current-user',
      'current-guild',
      async () => undefined,
    );

    const internal = queue as unknown as {
      userWindows: Map<string, number[]>;
      guildWindows: Map<string, number[]>;
    };
    expect(internal.userWindows.has('expired-user')).toBe(false);
    expect(internal.guildWindows.has('expired-guild')).toBe(false);
  });
});
