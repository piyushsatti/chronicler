import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import {
  markNotificationsRead,
  parseNotifications,
  parseUnreadCount,
} from '../../../src/features/notifications/adapters/notificationsAdapter.js';
import { rest } from '../../../src/api/endpoints.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { server } from '../../../src/mocks/server.js';
import bad from '../../fixtures/wire/notifications/list-bad.json';
import good from '../../fixtures/wire/notifications/list-good.json';
import unread from '../../fixtures/wire/notifications/unread-good.json';

describe('notifications adapters', () => {
  it('parses list', () => {
    const result = parseNotifications(good);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0]?.label).toBe('Quest signup');
      expect(result.data[0]?.unread).toBe(true);
    }
  });

  it('rejects bad list', () => {
    expect(parseNotifications(bad).ok).toBe(false);
  });

  it('parses unread count', () => {
    const result = parseUnreadCount(unread);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe(2);
  });
});

describe('unread count parser', () => {
  it('parses zero unread count', () => {
    const result = parseUnreadCount({ count: 0 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe(0);
  });

  it.each([
    ['negative count', { count: -1 }],
    ['fractional count', { count: 1.5 }],
    ['null payload', null],
    ['string count', { count: '2' }],
    ['missing count', {}],
  ] as const)('rejects unread count wire with %s', (_label, wire) => {
    expect(parseUnreadCount(wire).ok).toBe(false);
  });
});

describe('bounded mark-read adapter', () => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const session = () => ({
    token: 'captured-session',
    signal: new AbortController().signal,
  });

  it('sends one compact normalized batch under its captured session and accepts bodyless 204', async () => {
    localStorage.setItem(TOKEN_KEY, 'later-session');
    const requests: {
      body: string;
      authorization: string | null;
      contentType: string | null;
    }[] = [];
    server.use(
      http.post(rest.notificationsMarkRead, async ({ request }) => {
        requests.push({
          body: await request.text(),
          authorization: request.headers.get('authorization'),
          contentType: request.headers.get('content-type'),
        });
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await markNotificationsRead([id.toUpperCase(), id], session());
    expect(requests).toEqual([
      {
        body: JSON.stringify({ ids: [id] }),
        authorization: 'Bearer captured-session',
        contentType: 'application/json',
      },
    ]);
  });

  it.each([
    [
      'more than 100 entries before deduplication',
      Array.from({ length: 101 }, () => id),
    ],
    ['malformed UUID', ['not-a-uuid']],
    ['leading whitespace', [` ${id}`]],
    ['compact UUID', [id.replaceAll('-', '')]],
    ['URN', [`urn:uuid:${id}`]],
  ] as const)('rejects %s before transport', async (_label, ids) => {
    let requests = 0;
    server.use(
      http.post(rest.notificationsMarkRead, () => {
        requests += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await expect(markNotificationsRead(ids, session())).rejects.toMatchObject({
      kind: 'invalid',
    });
    expect(requests).toBe(0);
  });

  it('does not accept the obsolete 200 JSON success fixture', async () => {
    server.use(
      http.post(rest.notificationsMarkRead, () => HttpResponse.json({ ok: true })),
    );
    await expect(markNotificationsRead([id], session())).rejects.toMatchObject({
      kind: 'invalid',
    });
  });

  it('keeps an empty batch a local no-op', async () => {
    let requests = 0;
    server.use(
      http.post(rest.notificationsMarkRead, () => {
        requests += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await markNotificationsRead([], session());
    expect(requests).toBe(0);
  });
});
