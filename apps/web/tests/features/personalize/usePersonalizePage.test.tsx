import { beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { queryKeys } from '../../../src/api/queryKeys.js';
import { AuthProvider, useAuth } from '../../../src/auth/AuthContext.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { toAppError } from '../../../src/errors/toAppError.js';
import { usePersonalizePage } from '../../../src/features/personalize/hooks/usePersonalizePage.js';
import { createTestQueryClient } from '../../../src/providers.js';
import { createAppStore } from '../../../src/store/store.js';
import { server } from '../../../src/mocks/server.js';
import good from '../../fixtures/wire/personalize/good.json';

function seedToken(memberId = 'discord-dev', expOffset = 3600): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({
      member_id: memberId,
      exp: Math.floor(Date.now() / 1000) + expOffset,
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

  function holdSave(): { release: () => void } {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const body = (await request.json()) as { query?: string };
        if (body.query?.includes('UpdateMySettings')) {
          await held;
          return HttpResponse.json({
            data: {
              updateMySettings: { ...good.settings, timezone: 'America/New_York' },
            },
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
    return { release };
  }

  it('keeps isPending across a same-member token refresh during save', async () => {
    const { release } = holdSave();
    const { result } = renderHook(
      () => ({ page: usePersonalizePage(), auth: useAuth() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.page.personalization.isSuccess).toBe(true));
    act(() => {
      result.current.page.settingsMutation.mutate({ timezone: 'America/New_York' });
    });
    await waitFor(() => expect(result.current.page.settingsMutation.isPending).toBe(true));
    act(() => {
      result.current.auth.storeToken(seedToken('discord-dev', 7200));
    });
    expect(result.current.page.settingsMutation.isPending).toBe(true);
    await waitFor(() => expect(result.current.page.personalization.isSuccess).toBe(true));
    expect(result.current.page.personalization.data?.timezone).toBeNull();
    await act(async () => {
      release();
    });
    await waitFor(() => expect(result.current.page.settingsMutation.isSuccess).toBe(true));
    expect(result.current.page.personalization.data?.timezone).toBe('America/New_York');
  });

  it('discards a save that resolves after a member switch', async () => {
    const { release } = holdSave();
    const { result } = renderHook(
      () => ({ page: usePersonalizePage(), auth: useAuth(), client: useQueryClient() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.page.personalization.isSuccess).toBe(true));
    act(() => {
      result.current.page.settingsMutation.mutate({ timezone: 'America/New_York' });
    });
    await waitFor(() => expect(result.current.page.settingsMutation.isPending).toBe(true));
    act(() => {
      result.current.auth.storeToken(seedToken('other-member'));
    });
    expect(result.current.page.settingsMutation.isPending).toBe(false);
    await waitFor(() => expect(result.current.page.personalization.isSuccess).toBe(true));
    const mutations = result.current.client.getMutationCache();
    await act(async () => {
      release();
    });
    await waitFor(() =>
      expect(mutations.getAll().every((m) => m.state.status === 'success')).toBe(true),
    );
    expect(result.current.page.settingsMutation.isSuccess).toBe(false);
    expect(result.current.page.personalization.data?.timezone).toBeNull();
    expect(
      result.current.client.getQueryData([...queryKeys.personalization, 'discord-dev']),
    ).toBeUndefined();
  });
  function failSaves(keys: string[]): void {
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const body = (await request.json()) as {
          query?: string;
          variables?: { meta?: { idempotencyKey?: string } };
        };
        if (body.query?.includes('UpdateMySettings')) {
          keys.push(body.variables?.meta?.idempotencyKey ?? '');
          return HttpResponse.error();
        }
        return HttpResponse.json({ data: { myPersonalization: good } });
      }),
    );
  }

  it('reuses the save key for a retried patch, also across a same-member token refresh (D52)', async () => {
    const keys: string[] = [];
    failSaves(keys);
    const { result } = renderHook(
      () => ({ page: usePersonalizePage(), auth: useAuth() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.page.personalization.isSuccess).toBe(true));
    act(() => result.current.page.settingsMutation.mutate({ timezone: 'America/New_York' }));
    await waitFor(() => expect(result.current.page.settingsMutation.isError).toBe(true));
    act(() => result.current.page.settingsMutation.mutate({ timezone: 'America/New_York' }));
    await waitFor(() => expect(keys).toHaveLength(2));
    act(() => result.current.auth.storeToken(seedToken('discord-dev', 7200)));
    await waitFor(() => expect(result.current.page.personalization.isSuccess).toBe(true));
    act(() => result.current.page.settingsMutation.mutate({ timezone: 'America/New_York' }));
    await waitFor(() => expect(keys).toHaveLength(3));
    expect(new Set(keys).size).toBe(1);
    act(() => result.current.page.settingsMutation.mutate({ timezone: 'Europe/London' }));
    await waitFor(() => expect(keys).toHaveLength(4));
    expect(keys[3]).not.toBe(keys[0]);
  });

  it('never reuses a save key for another member (D52)', async () => {
    const keys: string[] = [];
    failSaves(keys);
    const { result } = renderHook(
      () => ({ page: usePersonalizePage(), auth: useAuth() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.page.personalization.isSuccess).toBe(true));
    act(() => result.current.page.settingsMutation.mutate({ timezone: 'America/New_York' }));
    await waitFor(() => expect(keys).toHaveLength(1));
    act(() => result.current.auth.storeToken(seedToken('other-member')));
    await waitFor(() => expect(result.current.page.personalization.isSuccess).toBe(true));
    act(() => result.current.page.settingsMutation.mutate({ timezone: 'America/New_York' }));
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).not.toBe(keys[0]);
  });
});
