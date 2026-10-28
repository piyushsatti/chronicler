import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import {
  markNotificationsRead,
  parseNotificationPage,
  parseUnreadCount,
} from '../../../src/features/notifications/adapters/notificationsAdapter.js';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { server } from '../../../src/mocks/server.js';
import bad from '../../fixtures/wire/notifications/list-bad.json';
import good from '../../fixtures/wire/notifications/list-good.json';

describe('notifications adapters', () => {
  it('parses list', () => {
    const result = parseNotificationPage(good);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items[0]?.label).toBe('Quest signup');
      expect(result.data.items[0]?.unread).toBe(true);
    }
  });

  it('rejects bad list', () => {
    expect(parseNotificationPage(bad).ok).toBe(false);
  });

  it('parses unread count', () => {
    const result = parseUnreadCount(2);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe(2);
  });
});

describe('unread count parser', () => {
  it('parses zero unread count', () => {
    const result = parseUnreadCount(0);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe(0);
  });

  it.each([
    ['negative count', -1],
    ['fractional count', 1.5],
    ['null payload', null],
    ['string count', '2'],
    ['object payload', { count: 2 }],
  ] as const)('rejects unread count wire with %s', (_label, wire) => {
    expect(parseUnreadCount(wire).ok).toBe(false);
  });
});

describe('bounded mark-read adapter', () => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const session = () => ({
    token: 'captured-session',
    idempotencyKey: 'captured-write-key',
    signal: new AbortController().signal,
  });

  it('sends one compact normalized batch under its captured session and accepts write receipt', async () => {
    localStorage.setItem(TOKEN_KEY, 'later-session');
    const requests: {
      body: unknown;
      authorization: string | null;
      contentType: string | null;
    }[] = [];
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        requests.push({
          body: await request.json(),
          authorization: request.headers.get('authorization'),
          contentType: request.headers.get('content-type'),
        });
        return HttpResponse.json({
          data: {
            markNotificationsRead: { replayed: false, affectedCount: 1 },
          },
        });
      }),
    );
    await markNotificationsRead([id.toUpperCase(), id], session());
    expect(requests).toHaveLength(1);
    expect(requests[0]?.authorization).toBe('Bearer captured-session');
    expect(requests[0]?.contentType).toBe('application/json');
    const body = requests[0]?.body as {
      variables?: { ids?: string[]; meta?: { idempotencyKey?: string } };
    };
    expect(body.variables?.ids).toEqual([id]);
    expect(typeof body.variables?.meta?.idempotencyKey).toBe('string');
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
      http.post(GRAPHQL_PATH, () => {
        requests += 1;
        return HttpResponse.json({
          data: {
            markNotificationsRead: { replayed: false, affectedCount: 1 },
          },
        });
      }),
    );
    await expect(markNotificationsRead(ids, session())).rejects.toMatchObject({
      kind: 'invalid',
    });
    expect(requests).toBe(0);
  });

  it('does not accept a missing write receipt', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({ data: { markNotificationsRead: { ok: true } } }),
      ),
    );
    await expect(markNotificationsRead([id], session())).rejects.toMatchObject({
      kind: 'invalid',
    });
  });

  it('keeps an empty batch a local no-op', async () => {
    let requests = 0;
    server.use(
      http.post(GRAPHQL_PATH, () => {
        requests += 1;
        return HttpResponse.json({
          data: {
            markNotificationsRead: { replayed: false, affectedCount: 0 },
          },
        });
      }),
    );
    await markNotificationsRead([], session());
    expect(requests).toBe(0);
  });
});
