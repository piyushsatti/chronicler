import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deliverActivity,
  postDiscordEvent,
  resetActivityInFlightForTests,
} from '@discord/activity/forward.js';
import { testConfig } from '../../support/config.js';

const config = testConfig({
  apiUrl: 'http://api:8000',
  ingestSecret: 'test-ingest-secret',
});

function fakeEvent(overrides: Record<string, unknown> = {}) {
  return {
    event_id: 'msg-1',
    kind: 'message' as const,
    discord_user_id: 'user-1',
    channel_id: 'chan-1',
    occurred_at: '2026-07-01T12:00:00.000Z',
    amount: 1,
    ...overrides,
  };
}

describe('postDiscordEvent', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('POSTs to {API_URL}/v1/ingest/discord-event with the X-Ingest-Secret header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await postDiscordEvent(config, fakeEvent());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api:8000/v1/ingest/discord-event');
    expect((init.headers as Record<string, string>)['X-Ingest-Secret']).toBe(
      'test-ingest-secret',
    );
    expect(JSON.parse(init.body as string)).toEqual(fakeEvent());
  });

  it('throws one Error on a 422 response', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response('unknown_kind', { status: 422 }),
      ) as unknown as typeof fetch;

    await expect(postDiscordEvent(config, fakeEvent())).rejects.toThrow(/422/);
  });

  it('throws one Error on a 401 response', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response('unauthorized', { status: 401 }),
      ) as unknown as typeof fetch;

    await expect(postDiscordEvent(config, fakeEvent())).rejects.toThrow(/401/);
  });

  it('throws one Error on a 500 response', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response('boom', { status: 500 }),
      ) as unknown as typeof fetch;

    await expect(postDiscordEvent(config, fakeEvent())).rejects.toThrow(/500/);
  });

  it('propagates a network failure as one Error', async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    await expect(postDiscordEvent(config, fakeEvent())).rejects.toThrow('fetch failed');
  });
});

describe('deliverActivity', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    resetActivityInFlightForTests();
  });

  it('logs once and does not throw on 500, 401, 429, and network failure', async () => {
    const { logger } = await import('@discord/log.js');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    for (const [status, body] of [
      [500, 'boom'],
      [401, 'unauthorized'],
      [429, 'slow down'],
    ] as const) {
      errorSpy.mockClear();
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(new Response(body, { status })) as unknown as typeof fetch;
      resetActivityInFlightForTests();
      expect(() =>
        deliverActivity(config, fakeEvent({ event_id: `msg-${status}` })),
      ).not.toThrow();
      await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1));
      expect(errorSpy.mock.calls[0]?.[0]).toBe('Activity post failed');
    }

    errorSpy.mockClear();
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;
    resetActivityInFlightForTests();
    expect(() =>
      deliverActivity(config, fakeEvent({ event_id: 'msg-net' })),
    ).not.toThrow();
    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1));
    expect(errorSpy.mock.calls[0]?.[0]).toBe('Activity post failed');
    errorSpy.mockRestore();
  });

  it('sheds the ninth in-flight post', async () => {
    const { logger } = await import('@discord/log.js');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    let resolveFetch!: () => void;
    const gate = new Promise<void>((resolve) => {
      resolveFetch = resolve;
    });
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      await gate;
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    resetActivityInFlightForTests();
    for (let i = 0; i < 8; i += 1) {
      deliverActivity(config, fakeEvent({ event_id: `held-${i}` }));
    }
    deliverActivity(config, fakeEvent({ event_id: 'shed-9' }));

    expect(errorSpy).toHaveBeenCalledWith(
      'Activity post shed',
      expect.objectContaining({ eventId: 'shed-9' }),
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(8);
    resolveFetch();
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(8));
    errorSpy.mockRestore();
  });
});
