import { onlineManager, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GRAPHQL_PATH, rest } from '../../../src/api/endpoints.js';
import { queryKeys } from '../../../src/api/queryKeys.js';
import { AuthProvider, useAuth } from '../../../src/auth/AuthContext.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { useMe } from '../../../src/hooks/useMe.js';
import { useMarkNotificationsRead } from '../../../src/features/notifications/hooks/useMarkNotificationsRead.js';
import { useNotificationsPage } from '../../../src/features/notifications/hooks/useNotificationsPage.js';
import { useUnreadCount } from '../../../src/features/notifications/hooks/useUnreadCount.js';
import { server } from '../../../src/mocks/server.js';
import { createTestQueryClient } from '../../../src/providers.js';
import goodMe from '../../fixtures/wire/me/good.json';

const READ_AT = '2026-10-11T12:00:00Z';
function ids(count: number, start = 1): string[] {
  return Array.from(
    { length: count },
    (_, index) =>
      `aaaaaaaa-aaaa-4aaa-8aaa-${(start + index).toString(16).padStart(12, '0')}`,
  );
}
function token(subject: string): string {
  return `${btoa('{}')}.${btoa(JSON.stringify({ sub: subject, exp: Date.now() / 1000 + 3600 }))}.test`;
}
function deferred() {
  let resolve!: () => void;
  return {
    promise: new Promise<void>((done) => {
      resolve = done;
    }),
    release: () => resolve(),
  };
}
function harness<T>(hook: () => T) {
  const queryClient = createTestQueryClient();
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  }
  const rendered = renderHook(hook, { wrapper });
  return {
    ...rendered,
    queryClient,
    dispose: () => {
      rendered.unmount();
      queryClient.clear();
      onlineManager.setOnline(true);
    },
  };
}
function queueHarness() {
  return harness(() => ({
    read: useMarkNotificationsRead(),
    auth: useAuth(),
    me: useMe(),
  }));
}
type ReadRequest = { ids: string[]; bytes: number; authorization: string | null };
function recordReads(
  reply: (request: ReadRequest, index: number) => Response | Promise<Response>,
) {
  const requests: ReadRequest[] = [];
  server.use(
    http.post(rest.notificationsMarkRead, async ({ request }) => {
      const body = await request.text();
      const row = {
        ids: (JSON.parse(body) as { ids: string[] }).ids,
        bytes: new TextEncoder().encode(body).length,
        authorization: request.headers.get('authorization'),
      };
      requests.push(row);
      return reply(row, requests.length - 1);
    }),
  );
  return requests;
}
const success = () => new HttpResponse(null, { status: 204 });
const failure = () =>
  HttpResponse.json(
    { status: 500, code: 'INTERNAL', title: 'Internal error' },
    { status: 500 },
  );

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TOKEN_KEY, token('viewer-one'));
  onlineManager.setOnline(true);
});

describe('mark-read serial batches', () => {
  it('deduplicates by UUID identity and serializes 120 IDs into 100 and 20 without rerender resubmission', async () => {
    const all = ids(120);
    const gate = deferred();
    const requests = recordReads(async (_row, index) => {
      if (index === 0) await gate.promise;
      return success();
    });
    const h = queueHarness();
    try {
      await waitFor(() => expect(h.result.current.me.isSuccess).toBe(true));
      act(() => h.result.current.read.enqueue([all[0].toUpperCase(), ...all, all[0]]));
      await waitFor(() => expect(requests).toHaveLength(1));
      expect(requests[0].ids).toEqual(all.slice(0, 100));
      expect(requests[0].bytes).toBe(3909);
      h.rerender();
      act(() => h.result.current.read.enqueue(all));
      expect(requests).toHaveLength(1);
      await act(async () => gate.release());
      await waitFor(() => expect(requests).toHaveLength(2));
      await waitFor(() => expect(h.queryClient.isMutating()).toBe(0));
      expect(requests[1].ids).toEqual(all.slice(100));
      expect(requests.every((row) => row.ids.length <= 100 && row.bytes <= 8192)).toBe(
        true,
      );
      expect(h.result.current.read.failedIds).toEqual([]);
      await act(async () => {
        h.result.current.read.enqueue(all);
        h.result.current.read.retry();
      });
      expect(requests).toHaveLength(2);
    } finally {
      gate.release();
      h.dispose();
    }
  });

  it.each([0, 1])(
    'retries only failed batch %i after retaining the other batch success',
    async (failedBatch) => {
      const all = ids(120);
      let recovering = false;
      const requests = recordReads((_row, index) =>
        !recovering && index === failedBatch ? failure() : success(),
      );
      const h = queueHarness();
      const invalidate = vi.spyOn(h.queryClient, 'invalidateQueries');
      try {
        await waitFor(() => expect(h.result.current.me.isSuccess).toBe(true));
        const failed = failedBatch === 0 ? all.slice(0, 100) : all.slice(100);
        act(() => h.result.current.read.enqueue(all));
        await waitFor(() => expect(requests).toHaveLength(2));
        await waitFor(() => expect(h.result.current.read.failedIds).toEqual(failed));
        await waitFor(() => expect(h.queryClient.isMutating()).toBe(0));
        // One acknowledged batch refreshes the real list prefix and the count; failed batches do not.
        expect(invalidate).toHaveBeenCalledTimes(2);
        expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.notifications });
        expect(invalidate).toHaveBeenCalledWith({
          queryKey: queryKeys.notificationsUnread,
        });
        h.rerender();
        act(() => h.result.current.read.enqueue(all));
        expect(requests).toHaveLength(2);
        recovering = true;
        act(() => h.result.current.read.retry());
        await waitFor(() => expect(requests).toHaveLength(3));
        await waitFor(() => expect(h.result.current.read.failedIds).toEqual([]));
        await waitFor(() => expect(h.queryClient.isMutating()).toBe(0));
        expect(requests[2].ids).toEqual(failed);
        expect(invalidate).toHaveBeenCalledTimes(4);
      } finally {
        invalidate.mockRestore();
        h.dispose();
      }
    },
  );

  it('retains interrupted and unsent IDs for explicit retry without resending an earlier acknowledged batch', async () => {
    const all = ids(220);
    const gate = deferred();
    const requests = recordReads(async (_row, index) => {
      if (index === 1) await gate.promise;
      return success();
    });
    const h = queueHarness();
    try {
      await waitFor(() => expect(h.result.current.me.isSuccess).toBe(true));
      act(() => h.result.current.read.enqueue(all));
      await waitFor(() => expect(requests).toHaveLength(2));
      act(() => onlineManager.setOnline(false));
      await act(async () => gate.release());
      await waitFor(() =>
        expect(h.result.current.read.failedIds).toEqual(all.slice(100)),
      );
      await waitFor(() => expect(h.queryClient.isMutating()).toBe(0));
      expect(requests).toHaveLength(2);
      act(() => onlineManager.setOnline(true));
      expect(requests).toHaveLength(2);
      act(() => h.result.current.read.retry());
      await waitFor(() => expect(requests).toHaveLength(4));
      await waitFor(() => expect(h.result.current.read.failedIds).toEqual([]));
      expect(requests.slice(2).map((row) => row.ids)).toEqual([
        all.slice(100, 200),
        all.slice(200),
      ]);
    } finally {
      gate.release();
      h.dispose();
    }
  });
});

describe('mark-read viewer ownership', () => {
  it.each(['token', 'validated member'] as const)(
    'discards failures and queued work when the %s changes',
    async (transition) => {
      const all = ids(220);
      const gate = deferred();
      let switched = false;
      const switchedMemberId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      expect(switchedMemberId).not.toBe(goodMe.id);
      server.use(
        http.get(rest.membersMe, () =>
          HttpResponse.json({
            ...goodMe,
            id: switched ? switchedMemberId : goodMe.id,
          }),
        ),
      );
      const requests = recordReads(async (_row, index) => {
        if (index === 0) return failure();
        if (index === 1) await gate.promise;
        return success();
      });
      const h = queueHarness();
      try {
        await waitFor(() => expect(h.result.current.me.isSuccess).toBe(true));
        const oldToken = h.result.current.auth.token;
        const oldRetry = h.result.current.read.retry;
        const oldEnqueue = h.result.current.read.enqueue;
        act(() => h.result.current.read.enqueue(all));
        await waitFor(() => expect(requests).toHaveLength(2));
        expect(h.result.current.read.failedIds).toEqual(all.slice(0, 100));
        switched = true;
        if (transition === 'token') {
          act(() => h.result.current.auth.storeToken(token('viewer-two')));
        } else {
          await act(async () => {
            await h.queryClient.invalidateQueries({ queryKey: queryKeys.me });
          });
        }
        await waitFor(() =>
          expect(h.result.current.me.data?.id).toBe(switchedMemberId),
        );
        await act(async () => gate.release());
        expect(h.result.current.read.failedIds).toEqual([]);
        await act(async () => {
          oldRetry();
          oldEnqueue(all);
        });
        expect(requests).toHaveLength(2);
        const fresh = ids(1, 1000);
        act(() => h.result.current.read.enqueue(fresh));
        await waitFor(() => expect(requests).toHaveLength(3));
        expect(requests[0].authorization).toBe(`Bearer ${oldToken}`);
        expect(requests[1].authorization).toBe(`Bearer ${oldToken}`);
        expect(requests[2].ids).toEqual(fresh);
        expect(requests[2].authorization).toBe(`Bearer ${h.result.current.auth.token}`);
        expect(h.result.current.auth.isAuthenticated).toBe(true);
      } finally {
        gate.release();
        h.dispose();
      }
    },
  );

  it('aborts on unmount and never dispatches the remaining queued batch', async () => {
    const gate = deferred();
    const requests = recordReads(async () => {
      await gate.promise;
      return success();
    });
    const h = queueHarness();
    try {
      await waitFor(() => expect(h.result.current.me.isSuccess).toBe(true));
      act(() => h.result.current.read.enqueue(ids(120)));
      await waitFor(() => expect(requests).toHaveLength(1));
      h.unmount();
      await act(async () => gate.release());
      await waitFor(() => expect(h.queryClient.isMutating()).toBe(0));
      expect(requests).toHaveLength(1);
    } finally {
      gate.release();
      h.dispose();
    }
  });
});

describe('mark-read accumulated inbox pages', () => {
  it('loads six 20-row pages, retains 120 failures, retries as 100 and 20, and converges the unread count', async () => {
    const all = ids(120);
    const read = new Set<string>();
    let recovering = false;
    const requests = recordReads((row) => {
      if (!recovering) return failure();
      row.ids.forEach((id) => read.add(id));
      return success();
    });
    const cursors = Array.from(
      { length: 5 },
      (_, index) => `2026-10-01T00:00:0${index + 1}Z`,
    );
    server.use(
      http.get(rest.notificationsUnreadCount, () =>
        HttpResponse.json({ count: all.length - read.size }),
      ),
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const body = (await request.json()) as {
          variables: { before: string | null; limit: number };
        };
        const page = body.variables.before
          ? cursors.indexOf(body.variables.before) + 1
          : 0;
        return HttpResponse.json({
          data: {
            myNotifications: {
              items: all.slice(page * 20, (page + 1) * 20).map((id) => ({
                id,
                kind: 'quest_signup',
                label: `Notice ${id}`,
                readAt: read.has(id) ? READ_AT : null,
              })),
              hasMore: page < 5,
              nextBefore: cursors[page] ?? null,
            },
          },
        });
      }),
    );
    const h = harness(() => ({
      page: useNotificationsPage(),
      unread: useUnreadCount(true),
    }));
    try {
      for (let page = 0; page < 6; page += 1) {
        await waitFor(() => {
          expect(h.result.current.page.status).toBe('ready');
          if (h.result.current.page.status === 'ready') {
            expect(h.result.current.page.markReadFailureIds).toHaveLength(
              (page + 1) * 20,
            );
          }
        });
        if (page < 5)
          act(() => {
            if (h.result.current.page.status === 'ready')
              h.result.current.page.fetchNextPage();
          });
      }
      expect(requests.map((row) => row.ids.length)).toEqual([20, 20, 20, 20, 20, 20]);
      expect(h.result.current.unread.data).toBe(120);
      recovering = true;
      act(() => {
        if (h.result.current.page.status === 'ready')
          h.result.current.page.retryMarkRead();
      });
      await waitFor(() => expect(requests).toHaveLength(8));
      await waitFor(() => {
        expect(h.result.current.page.status).toBe('ready');
        if (h.result.current.page.status === 'ready')
          expect(h.result.current.page.markReadFailureIds).toEqual([]);
        expect(h.result.current.unread.data).toBe(0);
      });
      expect(requests.slice(6).map((row) => row.ids)).toEqual([
        all.slice(0, 100),
        all.slice(100),
      ]);
      expect(read.size).toBe(120);
    } finally {
      h.dispose();
    }
  });
});
