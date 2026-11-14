import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { queryKeys } from '../../../src/api/queryKeys.js';
import { AuthProvider } from '../../../src/auth/AuthContext.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import type { GraphqlRequestBody } from '../../../src/chrome/featureModule.js';
import { useNotificationsPage } from '../../../src/features/notifications/hooks/useNotificationsPage.js';
import { createTestQueryClient } from '../../../src/providers.js';
import { createAppStore } from '../../../src/store/store.js';
import { server } from '../../../src/mocks/server.js';
import goodNotifications from '../../fixtures/wire/notifications/list-good.json';
import { dispatchFeatureGraphql, graphqlOperationName } from './graphql-test-utils.js';

function seedToken(): void {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({
      sub: 'discord-dev',
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    }),
  );
  localStorage.setItem(TOKEN_KEY, `${header}.${payload}.dev`);
}

function wrapper({ children }: { children: ReactNode }) {
  const store = createAppStore();
  const queryClient = createTestQueryClient();
  return (
    <ReduxProvider store={store}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthProvider>{children}</AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </ReduxProvider>
  );
}

describe('useNotificationsPage', () => {
  beforeEach(() => {
    localStorage.clear();
    seedToken();
  });

  it('surfaces AppError when notifications wire fails', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          errors: [{ message: 'boom', extensions: { code: 'INTERNAL' } }],
        }),
      ),
    );
    const { result } = renderHook(() => useNotificationsPage(), { wrapper });
    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    if (result.current.status === 'error') {
      expect(result.current.error.userMessage).toBe(
        'Something went wrong. Please try again.',
      );
    }
  });

  it('reaches ready with fixture wire', async () => {
    const { result } = renderHook(() => useNotificationsPage(), { wrapper });
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    if (result.current.status === 'ready') {
      expect(result.current.items[0]?.label).toBe('Quest signup');
    }
  });

  it('owns automatic mark-read once per unread notification', async () => {
    const readRequests: unknown[] = [];
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const body = (await request.json()) as GraphqlRequestBody & {
          variables?: { ids?: string[] };
        };
        const name = graphqlOperationName(body.query);
        if (name === 'MarkNotificationsRead') {
          readRequests.push({ ids: body.variables?.ids ?? [] });
          return HttpResponse.json({
            data: {
              markNotificationsRead: { replayed: false, affectedCount: 1 },
            },
          });
        }
        if (name === 'MyNotifications') {
          return HttpResponse.json({
            data: { myNotifications: goodNotifications },
          });
        }
        return dispatchFeatureGraphql(body);
      }),
    );
    const { result } = renderHook(() => useNotificationsPage(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    await waitFor(() => expect(readRequests).toHaveLength(1));
    expect(readRequests[0]).toEqual({
      ids: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
    });
  });

  it('refreshes the unread count once when the list refetches', async () => {
    let queryClient!: QueryClient;
    function localWrapper({ children }: { children: ReactNode }) {
      const store = createAppStore();
      queryClient = createTestQueryClient();
      return (
        <ReduxProvider store={store}>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter>
              <AuthProvider>{children}</AuthProvider>
            </MemoryRouter>
          </QueryClientProvider>
        </ReduxProvider>
      );
    }
    const { result } = renderHook(
      () => useNotificationsPage({ markOnView: false }),
      { wrapper: localWrapper },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    try {
      await act(async () => {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.notifications,
        });
      });
      await waitFor(() => {
        expect(
          invalidate.mock.calls.filter(
            ([options]) =>
              options &&
              typeof options === 'object' &&
              'queryKey' in options &&
              Array.isArray(options.queryKey) &&
              options.queryKey[0] === 'notificationsUnread',
          ),
        ).toHaveLength(1);
      });
    } finally {
      invalidate.mockRestore();
    }
  });
});
