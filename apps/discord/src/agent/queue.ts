export class QueueFullError extends Error {}
export class RateLimitedError extends Error {}
export class DuplicateRequestError extends Error {}

interface Pending<T> {
  key: string;
  userId: string;
  guildId: string;
  task: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

export class AgentQueue {
  private readonly pending: Pending<unknown>[] = [];
  private readonly activeKeys = new Set<string>();
  private readonly userWindows = new Map<string, number[]>();
  private readonly guildWindows = new Map<string, number[]>();
  private active = 0;

  constructor(
    private readonly maxConcurrent = 2,
    private readonly capacity = 25,
    private readonly now: () => number = Date.now,
  ) {}

  enqueue<T>(
    key: string,
    userId: string,
    guildId: string,
    task: () => Promise<T>,
  ): Promise<T> {
    if (this.activeKeys.has(key)) throw new DuplicateRequestError('duplicate');
    if (this.pending.length >= this.capacity) throw new QueueFullError('full');
    const now = this.now();
    this.pruneExpired(this.userWindows, now);
    this.pruneExpired(this.guildWindows, now);
    const userRecent = this.userWindows.get(userId) ?? [];
    const guildRecent = this.guildWindows.get(guildId) ?? [];
    if (userRecent.length >= 3 || guildRecent.length >= 20) {
      throw new RateLimitedError('rate_limited');
    }
    userRecent.push(now);
    guildRecent.push(now);
    this.userWindows.set(userId, userRecent);
    this.guildWindows.set(guildId, guildRecent);
    this.activeKeys.add(key);
    return new Promise<T>((resolve, reject) => {
      this.pending.push({
        key,
        userId,
        guildId,
        task,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.drain();
    });
  }

  get depth(): number {
    return this.pending.length;
  }

  private pruneExpired(windows: Map<string, number[]>, now: number): void {
    for (const [key, stamps] of windows) {
      const recent = stamps.filter((stamp) => now - stamp < 60_000);
      if (recent.length) windows.set(key, recent);
      else windows.delete(key);
    }
  }

  private drain(): void {
    while (this.active < this.maxConcurrent && this.pending.length) {
      const item = this.pending.shift();
      if (!item) return;
      this.active += 1;
      void item
        .task()
        .then(item.resolve, item.reject)
        .finally(() => {
          this.active -= 1;
          this.activeKeys.delete(item.key);
          this.drain();
        });
    }
  }
}
