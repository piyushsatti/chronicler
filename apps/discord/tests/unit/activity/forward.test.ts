import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ActivityForwarder,
  postDiscordEvent,
} from '@discord/activity/forward.js';
import type { ApiResponse } from '@discord/api/http.js';
import type { FetchFn } from '@discord/api/http.js';
import type { IngestPort } from '@discord/api/ingest.js';
import type { SniffedEvent } from '@discord/activity/types.js';
import { testConfig } from '../../support/config.js';

const config = testConfig({
  ingestSecret: 'test-ingest-secret',
});

function fakeEvent(overrides: Partial<SniffedEvent> = {}): SniffedEvent {
  return {
    event_id: 'msg-1',
    kind: 'message',
    discord_user_id: 'user-1',
    channel_id: 'chan-1',
    occurred_at: '2026-07-01T12:00:00.000Z',
    amount: 1,
    ...overrides,
  };
}

function fakeIngest(
  handler: (event: unknown) => Promise<ApiResponse>,
): IngestPort {
  return {
    postEvent: vi.fn(handler),
    postHeartbeat: vi.fn(),
  };
}

describe('postDiscordEvent', () => {
  it('POSTs to {API_URL}/v1/ingest/discord-event with the X-Ingest-Secret header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

    await postDiscordEvent(config, fakeEvent(), {
      fetch: fetchMock as unknown as FetchFn,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${config.apiUrl}/v1/ingest/discord-event`);
    expect((init.headers as Record<string, string>)['X-Ingest-Secret']).toBe(
      'test-ingest-secret',
    );
    expect(JSON.parse(init.body as string)).toEqual(fakeEvent());
  });

  it('throws one Error on a 422 response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('unknown_kind', { status: 422 }));

    await expect(
      postDiscordEvent(config, fakeEvent(), { fetch: fetchMock as unknown as FetchFn }),
    ).rejects.toThrow(/422/);
  });

  it('throws one Error on a 401 response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('unauthorized', { status: 401 }));

    await expect(
      postDiscordEvent(config, fakeEvent(), { fetch: fetchMock as unknown as FetchFn }),
    ).rejects.toThrow(/401/);
  });

  it('throws one Error on a 500 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }));

    await expect(
      postDiscordEvent(config, fakeEvent(), { fetch: fetchMock as unknown as FetchFn }),
    ).rejects.toThrow(/500/);
  });

  it('propagates a network failure as one Error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    await expect(
      postDiscordEvent(config, fakeEvent(), { fetch: fetchMock as unknown as FetchFn }),
    ).rejects.toThrow('fetch failed');
  });
});

describe('ActivityForwarder', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('resends the same event object and event_id on every attempt', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const event = fakeEvent();
    const seen: unknown[] = [];
    const ingest = fakeIngest(async (e) => {
      seen.push(e);
      if (seen.length < 3) {
        return { ok: false, kind: 'retryable', detail: 'down' };
      }
      return { ok: true, status: 200, text: '{}' };
    });
    const forwarder = new ActivityForwarder({ ingest, now: Date.now });

    forwarder.enqueue(event);
    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(seen).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(seen).toHaveLength(3);
    expect(seen[0]).toBe(event);
    expect(seen[1]).toBe(event);
    expect(seen[2]).toBe(event);
    expect(seen.map((e) => (e as SniffedEvent).event_id)).toEqual([
      'msg-1',
      'msg-1',
      'msg-1',
    ]);
  });

  it('sends nothing while the backoff gate is closed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const ingest = fakeIngest(async () => ({
      ok: false,
      kind: 'retryable',
      detail: 'down',
    }));
    const forwarder = new ActivityForwarder({ ingest, now: Date.now });

    forwarder.enqueue(fakeEvent({ event_id: 'a' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(ingest.postEvent).toHaveBeenCalledTimes(1);

    forwarder.enqueue(fakeEvent({ event_id: 'b' }));
    await vi.advanceTimersByTimeAsync(499);
    expect(ingest.postEvent).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(ingest.postEvent).toHaveBeenCalledTimes(3);
  });

  it('advances the shared gate once for one outage wave', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.25);
    const ingest = fakeIngest(async () => ({
      ok: false,
      kind: 'retryable',
      detail: 'down',
    }));
    const forwarder = new ActivityForwarder({
      ingest,
      now: Date.now,
      maxInFlight: 8,
    });

    for (let i = 0; i < 8; i += 1) {
      forwarder.enqueue(fakeEvent({ event_id: `e${i}` }));
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(ingest.postEvent).toHaveBeenCalledTimes(8);
    expect(random).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(249);
    expect(ingest.postEvent).toHaveBeenCalledTimes(8);
    await vi.advanceTimersByTimeAsync(1);
    expect(ingest.postEvent).toHaveBeenCalledTimes(16);
  });

  it('preserves FIFO when parallel sends fail', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const releases: Array<(r: ApiResponse) => void> = [];
    const ingest = fakeIngest(async () => {
      return new Promise<ApiResponse>((resolve) => {
        releases.push(resolve);
      });
    });
    const forwarder = new ActivityForwarder({
      ingest,
      now: Date.now,
      maxInFlight: 2,
    });

    forwarder.enqueue(fakeEvent({ event_id: 'A' }));
    forwarder.enqueue(fakeEvent({ event_id: 'B' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(releases).toHaveLength(2);

    releases[0]!({ ok: false, kind: 'retryable', detail: 'down' });
    await Promise.resolve();
    releases[1]!({ ok: false, kind: 'retryable', detail: 'down' });
    await Promise.resolve();

    const retryIds: string[] = [];
    (ingest.postEvent as ReturnType<typeof vi.fn>).mockImplementation(
      async (event: unknown) => {
        retryIds.push((event as SniffedEvent).event_id);
        return { ok: true, status: 200, text: '{}' };
      },
    );
    await vi.advanceTimersByTimeAsync(500);
    expect(retryIds).toEqual(['A', 'B']);
  });


  it('drops a returning in-flight event when the buffer is full', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { logger } = await import('@discord/log.js');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    let releaseA: ((r: ApiResponse) => void) | undefined;
    const ingest = fakeIngest(async (event) => {
      if ((event as SniffedEvent).event_id === 'A') {
        return new Promise<ApiResponse>((resolve) => {
          releaseA = resolve;
        });
      }
      return { ok: false, kind: 'retryable', detail: 'down', retryAfterMs: 5000 };
    });
    const forwarder = new ActivityForwarder({
      ingest,
      now: Date.now,
      capacity: 2,
      maxInFlight: 1,
    });

    forwarder.enqueue(fakeEvent({ event_id: 'A' }));
    forwarder.enqueue(fakeEvent({ event_id: 'B' }));
    forwarder.enqueue(fakeEvent({ event_id: 'C' }));
    await vi.advanceTimersByTimeAsync(0);

    releaseA!({ ok: false, kind: 'retryable', detail: 'down' });
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(errorSpy).toHaveBeenCalledWith(
      'Activity forwarder dropped events',
      expect.objectContaining({ capacity: 1 }),
    );

    const retryIds: string[] = [];
    (ingest.postEvent as ReturnType<typeof vi.fn>).mockImplementation(
      async (event: unknown) => {
        retryIds.push((event as SniffedEvent).event_id);
        return { ok: true, status: 200, text: '{}' };
      },
    );
    await vi.advanceTimersByTimeAsync(5000);
    expect(retryIds).toEqual(['B', 'C']);
  });

  it('does not evict buffered events when concurrent retries hit a full buffer', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
    const { logger } = await import('@discord/log.js');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const seen: string[] = [];
    const pending = new Map<string, (r: ApiResponse) => void>();
    const ingest = fakeIngest(async (event) => {
      const id = (event as SniffedEvent).event_id;
      seen.push(id);
      return new Promise<ApiResponse>((resolve) => {
        pending.set(id, resolve);
      });
    });
    const forwarder = new ActivityForwarder({
      ingest,
      now: Date.now,
      capacity: 2,
      maxInFlight: 2,
    });

    for (const id of ['A', 'B', 'C', 'D']) {
      forwarder.enqueue(fakeEvent({ event_id: id }));
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toEqual(['A', 'B']);

    // Drain skips post-dispatch pump, so both requeues observe [C,D] still full.
    const drainPromise = forwarder.drain(Date.now() + 5000);
    await Promise.resolve();

    pending.get('A')!({ ok: false, kind: 'retryable', detail: 'down' });
    pending.get('B')!({ ok: false, kind: 'retryable', detail: 'down' });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(errorSpy).toHaveBeenCalledWith(
      'Activity forwarder dropped events',
      expect.objectContaining({ capacity: 2 }),
    );

    (ingest.postEvent as ReturnType<typeof vi.fn>).mockImplementation(
      async (event: unknown) => {
        seen.push((event as SniffedEvent).event_id);
        return { ok: true, status: 200, text: '{}' };
      },
    );
    for (const id of ['C', 'D']) {
      pending.get(id)?.({ ok: true, status: 200, text: '{}' });
    }
    await vi.advanceTimersByTimeAsync(10);
    const result = await drainPromise;
    expect(result.delivered).toBe(2);
    expect(result.remaining).toBe(0);
    expect(seen).toEqual(['A', 'B', 'C', 'D']);
    expect(seen.filter((id) => id === 'A')).toHaveLength(1);
    expect(seen.filter((id) => id === 'B')).toHaveLength(1);
  });

  it('drops a 401 without retry and logs a count', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
    const { logger } = await import('@discord/log.js');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const ingest = fakeIngest(async () => ({
      ok: false,
      kind: 'permanent',
      status: 401,
      detail: 'unauthorized',
    }));
    const forwarder = new ActivityForwarder({ ingest, now: Date.now });

    forwarder.enqueue(fakeEvent());
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    expect(ingest.postEvent).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      'Activity forwarder dropped events',
      expect.objectContaining({ permanent: 1 }),
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ingest.postEvent).toHaveBeenCalledTimes(1);
  });

  it('logs one drop line for many permanent failures', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
    const { logger } = await import('@discord/log.js');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const ingest = fakeIngest(async () => ({
      ok: false,
      kind: 'permanent',
      status: 401,
      detail: 'unauthorized',
    }));
    const forwarder = new ActivityForwarder({
      ingest,
      now: Date.now,
      maxInFlight: 10,
    });

    for (let i = 0; i < 10; i += 1) {
      forwarder.enqueue(fakeEvent({ event_id: `p${i}` }));
    }
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      'Activity forwarder dropped events',
      expect.objectContaining({ permanent: 10 }),
    );
  });

  it('drops the oldest event when over capacity and counts it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
    const { logger } = await import('@discord/log.js');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    let releaseHang: ((r: ApiResponse) => void) | undefined;
    const ingest = fakeIngest(async (event) => {
      if ((event as SniffedEvent).event_id === 'in-flight') {
        return new Promise<ApiResponse>((resolve) => {
          releaseHang = resolve;
        });
      }
      return { ok: true, status: 200, text: '{}' };
    });
    const forwarder = new ActivityForwarder({
      ingest,
      now: Date.now,
      capacity: 2,
      maxInFlight: 1,
    });

    forwarder.enqueue(fakeEvent({ event_id: 'in-flight' }));
    forwarder.enqueue(fakeEvent({ event_id: 'old' }));
    forwarder.enqueue(fakeEvent({ event_id: 'mid' }));
    forwarder.enqueue(fakeEvent({ event_id: 'new' }));
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(errorSpy).toHaveBeenCalledWith(
      'Activity forwarder dropped events',
      expect.objectContaining({ capacity: 1 }),
    );
    expect(ingest.postEvent).toHaveBeenCalledTimes(1);
    expect((ingest.postEvent as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ event_id: 'in-flight' }),
    );

    releaseHang!({ ok: true, status: 200, text: '{}' });
    await vi.advanceTimersByTimeAsync(0);
    const ids = (ingest.postEvent as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => (call[0] as SniffedEvent).event_id,
    );
    expect(ids).toEqual(['in-flight', 'mid', 'new']);
  });

  it('drain returns by its deadline even when ingest never answers', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
    const ingest = fakeIngest(
      async () =>
        new Promise<ApiResponse>(() => {
          /* hang */
        }),
    );
    const forwarder = new ActivityForwarder({ ingest, now: Date.now, maxInFlight: 1 });
    forwarder.enqueue(fakeEvent());

    const deadline = Date.now() + 50;
    const resultPromise = forwarder.drain(deadline);
    let settled = false;
    void resultPromise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(49);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const result = await resultPromise;
    expect(settled).toBe(true);
    expect(result.delivered).toBe(0);
    expect(result.remaining).toBe(1);
  });

  it('drain keeps retrying without backoff until the deadline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    let calls = 0;
    const ingest = fakeIngest(async () => {
      calls += 1;
      if (calls < 3) {
        return { ok: false, kind: 'retryable', status: 503, detail: 'down' };
      }
      return { ok: true, status: 200, text: '{}' };
    });
    const forwarder = new ActivityForwarder({ ingest, now: Date.now, maxInFlight: 1 });
    forwarder.enqueue(fakeEvent());
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);

    const resultPromise = forwarder.drain(Date.now() + 5000);
    // First full-jitter backoff at random=0.5 is 500ms; retries must land sooner.
    await vi.advanceTimersByTimeAsync(10);
    expect(calls).toBe(3);
    await vi.advanceTimersByTimeAsync(4990);
    const result = await resultPromise;
    expect(result.delivered).toBe(1);
    expect(result.remaining).toBe(0);
  });

  it('drain returns by its deadline under persistent retryable failures', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const ingest = fakeIngest(async () => ({
      ok: false,
      kind: 'retryable',
      detail: 'down',
    }));
    const forwarder = new ActivityForwarder({ ingest, now: Date.now, maxInFlight: 1 });
    forwarder.enqueue(fakeEvent());
    await vi.advanceTimersByTimeAsync(0);
    const callsBeforeDrain = (ingest.postEvent as ReturnType<typeof vi.fn>).mock.calls
      .length;

    const resultPromise = forwarder.drain(Date.now() + 1000);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await resultPromise;
    expect(result.delivered).toBe(0);
    expect(result.remaining).toBe(1);
    expect(
      (ingest.postEvent as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThan(callsBeforeDrain);
  });

  it('does not capacity-drop a live event to admit an already-aged one', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
    const { logger } = await import('@discord/log.js');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    let releaseHang: ((r: ApiResponse) => void) | undefined;
    const ingest = fakeIngest(async (event) => {
      if ((event as SniffedEvent).event_id === 'hang') {
        return new Promise<ApiResponse>((resolve) => {
          releaseHang = resolve;
        });
      }
      return { ok: true, status: 200, text: '{}' };
    });
    const forwarder = new ActivityForwarder({
      ingest,
      now: Date.now,
      capacity: 2,
      maxInFlight: 1,
    });

    forwarder.enqueue(fakeEvent({ event_id: 'hang' }));
    forwarder.enqueue(fakeEvent({ event_id: 'fresh1' }));
    forwarder.enqueue(fakeEvent({ event_id: 'fresh2' }));
    forwarder.enqueue(
      fakeEvent({
        event_id: 'aged',
        occurred_at: '2026-07-01T11:49:00.000Z',
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(errorSpy).toHaveBeenCalledWith(
      'Activity forwarder dropped events',
      expect.objectContaining({ age: 1 }),
    );

    releaseHang!({ ok: true, status: 200, text: '{}' });
    await vi.advanceTimersByTimeAsync(0);
    const ids = (ingest.postEvent as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => (call[0] as SniffedEvent).event_id,
    );
    expect(ids).toEqual(['hang', 'fresh1', 'fresh2']);
    expect(ids).not.toContain('aged');
  });

  it('age-drops a failed in-flight event on requeue instead of displacing fresher work', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
    const { logger } = await import('@discord/log.js');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    let releaseAged: ((r: ApiResponse) => void) | undefined;
    const ingest = fakeIngest(async (event) => {
      if ((event as SniffedEvent).event_id === 'aged-inflight') {
        return new Promise<ApiResponse>((resolve) => {
          releaseAged = resolve;
        });
      }
      return { ok: true, status: 200, text: '{}' };
    });
    const forwarder = new ActivityForwarder({
      ingest,
      now: Date.now,
      capacity: 2,
      maxAgeMs: 60_000,
      maxInFlight: 1,
    });

    forwarder.enqueue(
      fakeEvent({
        event_id: 'aged-inflight',
        occurred_at: '2026-07-01T11:59:30.000Z',
      }),
    );
    forwarder.enqueue(fakeEvent({ event_id: 'fresh1' }));
    forwarder.enqueue(fakeEvent({ event_id: 'fresh2' }));
    await vi.advanceTimersByTimeAsync(0);

    vi.setSystemTime(new Date('2026-07-01T12:01:00.000Z'));
    releaseAged!({ ok: false, kind: 'retryable', detail: 'down' });
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(errorSpy).toHaveBeenCalledWith(
      'Activity forwarder dropped events',
      expect.objectContaining({ age: 1 }),
    );

    const ids = (ingest.postEvent as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => (call[0] as SniffedEvent).event_id,
    );
    expect(ids).toEqual(['aged-inflight', 'fresh1', 'fresh2']);
  });

  it('drops events older than maxAge and does not POST them', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
    const { logger } = await import('@discord/log.js');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const ingest = fakeIngest(async () => ({ ok: true, status: 200, text: '{}' }));
    const forwarder = new ActivityForwarder({ ingest, now: Date.now });

    forwarder.enqueue(
      fakeEvent({
        event_id: 'aged',
        occurred_at: '2026-07-01T11:49:00.000Z',
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(ingest.postEvent).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      'Activity forwarder dropped events',
      expect.objectContaining({ age: 1 }),
    );
  });
});


