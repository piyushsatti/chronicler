import { beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { AuthProvider, useAuth } from '../../../src/auth/AuthContext.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { toAppError } from '../../../src/errors/toAppError.js';
import { usePersonalizePage } from '../../../src/features/personalize/hooks/usePersonalizePage.js';
import { createTestQueryClient } from '../../../src/providers.js';
import { createAppStore } from '../../../src/store/store.js';
import { server } from '../../../src/mocks/server.js';
import good from '../../fixtures/wire/personalize/good.json';

function seedToken(memberId = 'discord-dev'): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({
      member_id: memberId,
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    }),
  );
  const token = `${header}.${payload}.dev`;
  localStorage.setItem(TOKEN_KEY, token);
  return token;
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

describe('usePersonalizePage', () => {
  beforeEach(() => {
    localStorage.clear();
    seedToken();
  });

  it('surfaces AppError when personalization wire fails', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          errors: [{ message: 'boom', extensions: { code: 'INTERNAL' } }],
        }),
      ),
    );
    const { result } = renderHook(() => usePersonalizePage(), { wrapper });
    await waitFor(() => {
      expect(result.current.personalization.isError).toBe(true);
    });
    expect(
      toAppError(result.current.personalization.error, 'personalize:page').userMessage,
    ).toBe('Something went wrong. Please try again.');
  });

  it('shows no prior settings mutation state on the first render after a login switch', async () => {
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const body = (await request.json()) as { query?: string };
        if (body.query?.includes('UpdateMySettings')) {
          return HttpResponse.json({
            data: { updateMySettings: good.settings },
          });
        }
        if (body.query?.includes('MemberMe')) {
          return HttpResponse.json({
            data: { memberMe: { id: 'discord-dev', roles: ['player'] } },
          });
        }
        return HttpResponse.json({
          data: { myPersonalization: good },
        });
      }),
    );
    const { result } = renderHook(
      () => {
        const [local, setLocal] = useState('clean');
        return { page: usePersonalizePage(), auth: useAuth(), local, setLocal };
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.page.personalization.isSuccess).toBe(true));
    act(() => {
      result.current.page.settingsMutation.mutate({ timezone: 'America/New_York' });
    });
    await waitFor(() =>
      expect(result.current.page.settingsMutation.isSuccess).toBe(true),
    );
    act(() => result.current.setLocal('stale'));
    expect(result.current.local).toBe('stale');
    act(() => {
      result.current.auth.storeToken(seedToken('other-member'));
    });
    expect(result.current.local).toBe('clean');
    expect(result.current.page.settingsMutation.isSuccess).toBe(false);
    expect(result.current.page.settingsMutation.isError).toBe(false);
    expect(result.current.page.settingsMutation.data).toBeUndefined();
  });
});
