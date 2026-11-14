import { describe, expect, it, vi } from 'vitest';
import { createAgentApi } from '@discord/agent/api.js';
import { createHttp, type FetchFn, type HttpPort } from '@discord/api/http.js';

function http(fetchFn: FetchFn) {
  return createHttp({
    apiUrl: 'http://api:8000',
    secret: 'secret',
    fetch: fetchFn,
  });
}

function jsonResponse(
  status: number,
  body = '',
  headers?: Record<string, string>,
): Response {
  return new Response(body, { status, headers });
}

describe('createHttp classification', () => {
  it.each([
    {
      name: '2xx',
      fetch: async () => new Response(null, { status: 200 }),
      want: { ok: true, status: 200, text: '' },
    },
    {
      name: '401 permanent',
      fetch: async () => jsonResponse(401, 'unauthorized'),
      want: { ok: false, kind: 'permanent', status: 401, detail: 'unauthorized' },
    },
    {
      name: '403 permanent',
      fetch: async () => jsonResponse(403, 'forbidden'),
      want: { ok: false, kind: 'permanent', status: 403, detail: 'forbidden' },
    },
    {
      name: '404 permanent',
      fetch: async () => jsonResponse(404, 'missing'),
      want: { ok: false, kind: 'permanent', status: 404, detail: 'missing' },
    },
    {
      name: '422 permanent',
      fetch: async () => jsonResponse(422, 'bad'),
      want: { ok: false, kind: 'permanent', status: 422, detail: 'bad' },
    },
    {
      name: '408 retryable',
      fetch: async () => jsonResponse(408, 'timeout'),
      want: { ok: false, kind: 'retryable', status: 408, detail: 'timeout' },
    },
    {
      name: '429 retryable with Retry-After',
      fetch: async () =>
        jsonResponse(429, 'slow', { 'Retry-After': '1.5' }),
      want: {
        ok: false,
        kind: 'retryable',
        status: 429,
        detail: 'slow',
        retryAfterMs: 1500,
      },
    },
    {
      name: '429 retryable caps Retry-After',
      fetch: async () =>
        jsonResponse(429, 'slow', { 'Retry-After': '9999' }),
      want: {
        ok: false,
        kind: 'retryable',
        status: 429,
        detail: 'slow',
        retryAfterMs: 300_000,
      },
    },
    {
      name: '500 retryable',
      fetch: async () => jsonResponse(500, 'boom'),
      want: { ok: false, kind: 'retryable', status: 500, detail: 'boom' },
    },
    {
      name: '503 retryable',
      fetch: async () => jsonResponse(503, 'down'),
      want: { ok: false, kind: 'retryable', status: 503, detail: 'down' },
    },
    {
      name: 'network error retryable',
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
      want: { ok: false, kind: 'retryable', detail: 'fetch failed' },
    },
    {
      name: 'timeout retryable',
      fetch: async () => {
        const err = new Error('The operation was aborted due to timeout');
        err.name = 'TimeoutError';
        throw err;
      },
      want: {
        ok: false,
        kind: 'retryable',
        detail: 'timeout: The operation was aborted due to timeout',
      },
    },
  ] as const)('$name', async ({ fetch: fetchFn, want }) => {
    const result = await http(fetchFn).request({ method: 'GET', path: '/x' });
    expect(result).toEqual(want);
  });
});

describe('createHttp capped body reader', () => {
  it('cancels the stream when the body exceeds maxBytes', async () => {
    let cancelled = false;
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls > 8) {
          controller.error(new Error('read past the byte cap'));
          return;
        }
        controller.enqueue(new TextEncoder().encode('aaaaaa'));
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchFn: FetchFn = async () =>
      new Response(stream, { status: 200, headers: { 'content-type': 'text/plain' } });

    const result = await http(fetchFn).request({
      method: 'GET',
      path: '/x',
      maxBytes: 5,
    });

    expect(result).toEqual({
      ok: false,
      kind: 'permanent',
      status: 200,
      detail: 'response exceeded 5 bytes',
    });
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThan(8);
  });

  it('keeps retryable status when an oversize body is capped', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('abcdef'));
        controller.close();
      },
    });
    const fetchFn: FetchFn = async () =>
      new Response(stream, {
        status: 429,
        headers: { 'Retry-After': '2', 'content-type': 'text/plain' },
      });

    const result = await http(fetchFn).request({
      method: 'GET',
      path: '/x',
      maxBytes: 5,
    });

    expect(result).toEqual({
      ok: false,
      kind: 'retryable',
      status: 429,
      detail: 'response exceeded 5 bytes',
      retryAfterMs: 2000,
    });
  });

  it('returns the body when it fits under maxBytes', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response('ok-body', { status: 200 }));

    const result = await http(fetchFn as unknown as FetchFn).request({
      method: 'GET',
      path: '/x',
      maxBytes: 64,
    });

    expect(result).toEqual({ ok: true, status: 200, text: 'ok-body' });
  });
});

describe('createAgentApi poll', () => {
  it('passes maxBytes of 64 KiB', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, status: 204, text: '' });
    const httpPort: HttpPort = { request };
    await createAgentApi(httpPort).poll('00000000-0000-4000-8000-000000000001');
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ maxBytes: 64 * 1024 }),
    );
  });
});
