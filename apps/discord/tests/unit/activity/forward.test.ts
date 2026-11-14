import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deliverActivity,
  postDiscordEvent,
  resetActivityInFlightForTests,
} from '@discord/activity/forward.js';
import type { FetchFn } from '@discord/api/http.js';
import { testConfig } from '../../support/config.js';

const config = testConfig({
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

describe('deliverActivity', () => {
  afterEach(() => {
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
      const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status }));
      resetActivityInFlightForTests();
      expect(() =>
        deliverActivity(config, fakeEvent({ event_id: `msg-${status}` }), {
          fetch: fetchMock as unknown as FetchFn,
        }),
      ).not.toThrow();
      await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1));
      expect(errorSpy.mock.calls[0]?.[0]).toBe('Activity post failed');
    }

    errorSpy.mockClear();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    resetActivityInFlightForTests();
    expect(() =>
      deliverActivity(config, fakeEvent({ event_id: 'msg-net' }), {
        fetch: fetchMock as unknown as FetchFn,
      }),
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
    const fetchMock = vi.fn().mockImplementation(async () => {
      await gate;
      return new Response(null, { status: 200 });
    });

    resetActivityInFlightForTests();
    for (let i = 0; i < 8; i += 1) {
      deliverActivity(config, fakeEvent({ event_id: `held-${i}` }), {
        fetch: fetchMock as unknown as FetchFn,
      });
    }
    deliverActivity(config, fakeEvent({ event_id: 'shed-9' }), {
      fetch: fetchMock as unknown as FetchFn,
    });

    expect(errorSpy).toHaveBeenCalledWith(
      'Activity post shed',
      expect.objectContaining({ eventId: 'shed-9' }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(8);
    resolveFetch();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(8));
    errorSpy.mockRestore();
  });
});
