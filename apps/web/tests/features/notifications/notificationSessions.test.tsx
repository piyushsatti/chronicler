import type { ReactNode } from 'react';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { queryKeys } from '../../../src/api/queryKeys.js';
import { AuthProvider, useAuth } from '../../../src/auth/AuthContext.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { useMe } from '../../../src/hooks/useMe.js';
import { useLoginNotifications } from '../../../src/features/notifications/hooks/useLoginNotifications.js';
import { useMarkNotificationsRead } from '../../../src/features/notifications/hooks/useMarkNotificationsRead.js';
import { NotificationsPage } from '../../../src/features/notifications/pages/NotificationsPage.js';
import { LoginNotificationsPanel } from '../../../src/features/notifications/components/LoginNotificationsPanel.js';
import { server } from '../../../src/mocks/server.js';
import { createTestQueryClient } from '../../../src/providers.js';
import goodMe from '../../fixtures/wire/me/good.json';
import { renderWithProviders } from '../../test-utils.js';
import { dispatchFeatureGraphql, graphqlOperationName } from './graphql-test-utils.js';

const bodySchema = z.object({
  query: z.string(),
  variables: z.record(z.string(), z.unknown()).optional(),
});
const writeSchema = z.object({ meta: z.object({ idempotencyKey: z.string().uuid() }) });
const noticeId = '75000000-0000-4000-8000-000000000001';
const currentToken = (subject: string) =>
  `${btoa('{}')}.${btoa(JSON.stringify({ sub: subject, exp: Date.now() / 1000 + 3600 }))}.test`;
const page = (title: string) => ({
  items: [
    {
      id: noticeId,
      kind: 'QUEST_SIGNUP_CONFIRMED',
      label: 'Quest signup confirmed',
      title,
      readAt: '2026-10-20T00:00:00Z',
      subjectId: '76000000-0000-4000-8000-000000000001',
      subjectType: 'quest',
      subjectCode: 'Q-CURRENT',
    },
  ],
  hasMore: false,
  nextBefore: null,
});
function deferred() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
function harness<T>(hook: () => T) {
  const client = createTestQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  }
  const rendered = renderHook(hook, { wrapper: Wrapper });
  return {
    ...rendered,
    client,
    dispose: () => {
      rendered.unmount();
      client.clear();
    },
  };
}
function preview() {
  return harness(() => ({
    login: useLoginNotifications(true),
    auth: useAuth(),
    me: useMe(),
  }));
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TOKEN_KEY, currentToken('old'));
});

describe('notification current-session reads', () => {
  it('removes already cached private destinations before fetching a same-token role scope and never queues old rows in it', async () => {
    const gate = deferred();
    const originalToken = localStorage.getItem(TOKEN_KEY);
    let changed = false;
    let writesAfterChange = 0;
    let freshLists = 0;
    const documentId = '78000000-0000-4000-8000-000000000002';
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const body = bodySchema.parse(await request.json());
        const operation = graphqlOperationName(body.query);
        if (operation === 'MemberMe')
          return HttpResponse.json({
            data: {
              memberMe: { ...goodMe, roles: changed ? ['player'] : goodMe.roles },
            },
          });
        if (operation === 'MyUnreadNotificationCount')
          return HttpResponse.json({
            data: { myUnreadNotificationCount: changed ? 0 : 1 },
          });
        if (operation === 'MyNotifications') {
          if (changed) {
            freshLists += 1;
            await gate.promise;
            return HttpResponse.json({
              data: {
                myNotifications: { items: [], hasMore: false, nextBefore: null },
              },
            });
          }
          return HttpResponse.json({
            data: {
              myNotifications: {
                items: [
                  {
                    id: noticeId,
                    kind: 'DOCUMENT_EDITED',
                    title: 'Private DM notice',
                    label: 'Document edited',
                    subjectId: documentId,
                    subjectType: 'document',
                    subjectCode: null,
                    readAt: null,
                  },
                ],
                hasMore: false,
                nextBefore: null,
              },
            },
          });
        }
        if (operation === 'NotificationDocuments')
          return HttpResponse.json({
            data: {
              document0: {
                id: documentId,
                kind: 'codex_entry',
                slug: 'private-dm-destination',
                category: null,
              },
            },
          });
        if (
          operation === 'MarkNotificationsRead' ||
          operation === 'AcknowledgeSuppressedNotifications'
        ) {
          if (changed) writesAfterChange += 1;
        }
        return dispatchFeatureGraphql(body);
      }),
    );
    function AccountScope() {
      const me = useMe();
      return (
        <output data-testid="validated-notification-roles">
          {me.data?.roles.join(',')}
        </output>
      );
    }
    const rendered = renderWithProviders(
      <>
        <NotificationsPage />
        <LoginNotificationsPanel enabled />
        <AccountScope />
      </>,
      { route: '/notifications' },
    );
    try {
      await waitFor(() =>
        expect(screen.getAllByRole('link', { name: 'Private DM notice' })).toHaveLength(
          2,
        ),
      );
      await waitFor(() => {
        expect(rendered.queryClient.isFetching()).toBe(0);
        expect(rendered.queryClient.isMutating()).toBe(0);
      });
      changed = true;
      await act(async () => {
        await rendered.queryClient.invalidateQueries({ queryKey: queryKeys.me });
      });
      await waitFor(() =>
        expect(screen.getByTestId('validated-notification-roles')).toHaveTextContent(
          /^player$/,
        ),
      );
      expect(localStorage.getItem(TOKEN_KEY)).toBe(originalToken);
      expect(screen.queryByText('Private DM notice')).not.toBeInTheDocument();
      expect(
        document.querySelector('a[href="/codex/private-dm-destination"]'),
      ).toBeNull();
      const authority = JSON.stringify([goodMe.id, ['player']]);
      expect(
        rendered.queryClient.getQueryData([
          ...queryKeys.notificationsInbox(20),
          authority,
        ]),
      ).toBeUndefined();
      expect(
        rendered.queryClient.getQueryData([
          ...queryKeys.notificationsPreview(20),
          authority,
        ]),
      ).toBeUndefined();
      await waitFor(() => expect(freshLists).toBe(2));
      await act(async () => gate.release());
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'No notifications yet' })).toBeInTheDocument(),
      );
      expect(screen.queryByText('Private DM notice')).not.toBeInTheDocument();
      expect(
        document.querySelector('a[href="/codex/private-dm-destination"]'),
      ).toBeNull();
      expect(writesAfterChange).toBe(0);
      await waitFor(() =>
        expect(
          rendered.queryClient.getQueryData([
            ...queryKeys.notificationsUnread,
            authority,
          ]),
        ).toBe(0),
      );
    } finally {
      gate.release();
      rendered.unmount();
      rendered.queryClient.clear();
    }
  });

  it.each(['token', 'member', 'roles'])(
    'discards delayed list/count responses and retained retries after the %s changes',
    async (transition) => {
      const oldToken = localStorage.getItem(TOKEN_KEY);
      const gate = deferred();
      let changed = false;
      let oldRequests = 0;
      let freshRequests = 0;
      let count = 0;
      server.use(
        http.post(GRAPHQL_PATH, async ({ request }) => {
          const body = bodySchema.parse(await request.json());
          const operation = graphqlOperationName(body.query);
          if (operation === 'MemberMe')
            return HttpResponse.json({
              data: {
                memberMe: {
                  ...goodMe,
                  id:
                    changed && transition === 'member'
                      ? '77000000-0000-4000-8000-000000000001'
                      : goodMe.id,
                  roles: changed && transition === 'roles' ? ['player'] : goodMe.roles,
                },
              },
            });
          if (
            operation === 'MyNotifications' ||
            operation === 'MyUnreadNotificationCount'
          ) {
            const old = !changed;
            if (old) {
              oldRequests += 1;
              await gate.promise;
            } else freshRequests += 1;
            if (operation === 'MyUnreadNotificationCount') {
              count += 1;
              return HttpResponse.json({
                data: { myUnreadNotificationCount: old ? 99 : 5 },
              });
            }
            return HttpResponse.json({
              data: {
                myNotifications: page(old ? 'Old private notice' : 'Current notice'),
              },
            });
          }
          return dispatchFeatureGraphql(body);
        }),
      );
      const h = preview();
      try {
        await waitFor(() => expect(oldRequests).toBe(2));
        const retryOldSession = h.result.current.login.retry;
        changed = true;
        if (transition === 'token')
          act(() => h.result.current.auth.storeToken(currentToken('new')));
        else
          await act(async () => {
            await h.client.invalidateQueries({ queryKey: queryKeys.me });
          });
        await waitFor(() =>
          expect(h.result.current.login.listQ.data?.items[0]?.title).toBe(
            'Current notice',
          ),
        );
        await waitFor(() => expect(h.result.current.login.unreadQ.data).toBe(5));
        const completedFreshRequests = freshRequests;
        await act(async () => {
          retryOldSession();
          gate.release();
        });
        await waitFor(() => expect(h.client.isFetching()).toBe(0));
        expect(h.result.current.login.listQ.data?.items[0]?.title).toBe(
          'Current notice',
        );
        expect(h.result.current.login.unreadQ.data).toBe(5);
        expect(freshRequests).toBe(completedFreshRequests);
        expect(count).toBeGreaterThanOrEqual(1);
        expect(h.result.current.auth.isAuthenticated).toBe(true);
        if (transition === 'token')
          expect(h.result.current.auth.token).not.toBe(oldToken);
      } finally {
        gate.release();
        h.dispose();
      }
    },
  );

  it('discards late Document metadata after an account transition', async () => {
    const gate = deferred();
    let changed = false;
    let metadataStarted = false;
    const documentId = '78000000-0000-4000-8000-000000000001';
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const body = bodySchema.parse(await request.json());
        const operation = graphqlOperationName(body.query);
        if (operation === 'MyUnreadNotificationCount')
          return HttpResponse.json({ data: { myUnreadNotificationCount: 0 } });
        if (operation === 'MyNotifications')
          return HttpResponse.json({
            data: {
              myNotifications: {
                items: changed
                  ? []
                  : [
                      {
                        id: noticeId,
                        kind: 'DOCUMENT_EDITED',
                        label: 'Document edited',
                        subjectId: documentId,
                        subjectType: 'document',
                        subjectCode: null,
                        readAt: '2026-10-20T00:00:00Z',
                      },
                    ],
                hasMore: false,
                nextBefore: null,
              },
            },
          });
        if (operation === 'NotificationDocuments') {
          metadataStarted = true;
          await gate.promise;
          return HttpResponse.json({
            data: {
              document0: {
                id: documentId,
                kind: 'codex_entry',
                slug: 'old-private-document',
                category: null,
              },
            },
          });
        }
        return dispatchFeatureGraphql(body);
      }),
    );
    const h = preview();
    try {
      await waitFor(() => expect(metadataStarted).toBe(true));
      changed = true;
      act(() => h.result.current.auth.storeToken(currentToken('new')));
      await waitFor(() => expect(h.result.current.login.listQ.data?.items).toEqual([]));
      await act(async () => gate.release());
      await waitFor(() => expect(h.client.isFetching()).toBe(0));
      expect(h.result.current.login.listQ.data?.items).toEqual([]);
    } finally {
      gate.release();
      h.dispose();
    }
  });
});

describe('notification command retries and feedback', () => {
  it('reuses the exact acknowledgement key after failure and rejects late feedback or old callbacks after account change', async () => {
    const gate = deferred();
    const writes: { key: string; authorization: string | null }[] = [];
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const body = bodySchema.parse(await request.json());
        const operation = graphqlOperationName(body.query);
        if (operation === 'AcknowledgeSuppressedNotifications') {
          const variables = writeSchema.parse(body.variables);
          writes.push({
            key: variables.meta.idempotencyKey,
            authorization: request.headers.get('authorization'),
          });
          if (writes.length === 1)
            return HttpResponse.json({
              errors: [{ message: 'private error', extensions: { code: 'INTERNAL' } }],
            });
          if (writes.length === 3) await gate.promise;
          return HttpResponse.json({
            data: {
              acknowledgeSuppressedNotifications: {
                replayed: writes.length === 2,
                affectedCount: 2,
              },
            },
          });
        }
        return dispatchFeatureGraphql(body);
      }),
    );
    const h = preview();
    try {
      await waitFor(() => expect(h.result.current.login.ready).toBe(true));
      act(() => h.result.current.login.ack.mutate());
      await waitFor(() =>
        expect(h.result.current.login.ack.error?.kind).toBe('upstream'),
      );
      act(() => h.result.current.login.ack.mutate());
      await waitFor(() =>
        expect(h.result.current.login.ack.feedback).toBe(
          'Cleared 2 alerts for removed pages.',
        ),
      );
      expect(writes[0]).toEqual(writes[1]);
      const oldCallback = h.result.current.login.ack.mutate;
      act(() => h.result.current.login.ack.mutate());
      await waitFor(() => expect(writes).toHaveLength(3));
      expect(writes[2].key).not.toBe(writes[1].key);
      act(() => h.result.current.auth.storeToken(currentToken('new')));
      await waitFor(() => expect(h.result.current.login.ready).toBe(true));
      await act(async () => {
        oldCallback();
        gate.release();
      });
      await waitFor(() => expect(h.client.isMutating()).toBe(0));
      expect(writes).toHaveLength(3);
      expect(h.result.current.login.ack.feedback).toBeNull();
      expect(h.result.current.login.ack.error).toBeNull();
      expect(h.result.current.auth.isAuthenticated).toBe(true);
    } finally {
      gate.release();
      h.dispose();
    }
  });

  it('reuses the exact mark-read batch key after an uncertain response', async () => {
    const keys: string[] = [];
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const body = bodySchema.parse(await request.json());
        if (graphqlOperationName(body.query) === 'MarkNotificationsRead') {
          const variables = writeSchema.parse(body.variables);
          keys.push(variables.meta.idempotencyKey);
          return keys.length === 1
            ? HttpResponse.json({
                errors: [{ message: 'uncertain', extensions: { code: 'INTERNAL' } }],
              })
            : HttpResponse.json({
                data: { markNotificationsRead: { replayed: true, affectedCount: 1 } },
              });
        }
        return dispatchFeatureGraphql(body);
      }),
    );
    const h = harness(() => ({ queue: useMarkNotificationsRead(), me: useMe() }));
    try {
      await waitFor(() => expect(h.result.current.me.isSuccess).toBe(true));
      act(() => h.result.current.queue.enqueue([noticeId]));
      await waitFor(() => expect(h.result.current.queue.failedIds).toEqual([noticeId]));
      act(() => h.result.current.queue.retry());
      await waitFor(() =>
        expect(h.result.current.queue.succeededIds).toEqual([noticeId]),
      );
      expect(keys).toHaveLength(2);
      expect(keys[0]).toBe(keys[1]);
    } finally {
      h.dispose();
    }
  });
});
