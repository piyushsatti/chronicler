import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { queryKeys } from '../../src/api/queryKeys.js';
import { AuthProvider, useAuth } from '../../src/context/AuthContext.js';
import { TOKEN_KEY } from '../../src/auth/storage.js';
import { useAdminAuthority } from '../../src/features/admin/hooks/useAdminAuthority.js';
import { useMe } from '../../src/hooks/useMe.js';
import { server } from '../../src/mocks/server.js';
import { createTestQueryClient } from '../../src/providers.js';
import goodMe from '../fixtures/wire/me/good.json';

function signIn() {
  localStorage.setItem(
    TOKEN_KEY,
    `${btoa('{}')}.${btoa(JSON.stringify({ sub: 'discord-one', exp: Date.now() / 1000 + 3600, roles: ['admin'] }))}.test`,
  );
}

function setup(seedMe = false) {
  const queryClient = createTestQueryClient();
  if (seedMe) queryClient.setQueryData(queryKeys.me, { ...goodMe, roles: ['admin'] });
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  }
  return {
    queryClient,
    ...renderHook(
      () => ({ me: useMe(), auth: useAuth(), authority: useAdminAuthority() }),
      { wrapper },
    ),
  };
}

describe('useMe validated authority lifecycle', () => {
  it('does not query or expose cached roles to an anonymous session', async () => {
    let requested = 0;
    server.use(
      http.get('/v1/members/me', () => {
        requested++;
        return HttpResponse.json(goodMe);
      }),
    );
    const { result } = setup(true);
    expect(result.current.me.data).toBeUndefined();
    expect(result.current.me.isSuccess).toBe(false);
    expect(result.current.authority.allowed).toBe(false);
    await act(async () => {
      await result.current.me.refetch();
    });
    expect(requested).toBe(0);
    expect(result.current.authority.allowed).toBe(false);
  });

  it('does not approve stored cached admin roles before the current me request validates', async () => {
    signIn();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get('/v1/members/me', async () => {
        await pending;
        return HttpResponse.json({ ...goodMe, roles: ['verifier'] });
      }),
    );
    const { result } = setup(true);
    expect(result.current.authority.allowed).toBe(false);
    expect(result.current.me.data).toBeUndefined();
    await act(async () => {
      release();
    });
    await waitFor(() => expect(result.current.me.isSuccess).toBe(true));
    expect(result.current.me.data?.roles).toEqual(['verifier']);
    expect(result.current.authority.allowed).toBe(false);
  });

  it('clears private caches on same-token role revocation and denies a retained callback', async () => {
    signIn();
    server.use(
      http.get('/v1/members/me', () =>
        HttpResponse.json({ ...goodMe, roles: ['admin'] }),
      ),
    );
    const { result, queryClient } = setup();
    await waitFor(() => expect(result.current.authority.allowed).toBe(true));
    const originalToken = result.current.auth.token;
    const operation = vi.fn(() => 'forbidden callback ran');
    const guarded = result.current.authority.guardMutation(operation);
    queryClient.setQueryData(['private-directory'], ['private member']);
    queryClient
      .getMutationCache()
      .build(queryClient, { mutationKey: ['private-write'] });
    server.use(
      http.get('/v1/members/me', () =>
        HttpResponse.json({ ...goodMe, roles: ['verifier'] }),
      ),
    );
    await act(async () => {
      await result.current.me.refetch();
    });
    await waitFor(() => expect(result.current.me.data?.roles).toEqual(['verifier']));
    expect(result.current.auth.token).toBe(originalToken);
    expect(queryClient.getQueryData(['private-directory'])).toBeUndefined();
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
    expect(guarded).toThrow();
    expect(operation).not.toHaveBeenCalled();
    expect(result.current.authority.allowed).toBe(false);
  });

  it('cancels an in-flight private query so its late response cannot restore revoked data', async () => {
    signIn();
    server.use(
      http.get('/v1/members/me', () =>
        HttpResponse.json({ ...goodMe, roles: ['admin'] }),
      ),
    );
    const { result, queryClient } = setup();
    await waitFor(() => expect(result.current.authority.allowed).toBe(true));
    let finish!: (data: string) => void;
    const pending = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const outcome = queryClient
      .fetchQuery({
        queryKey: ['private-pending'],
        queryFn: () => pending,
      })
      .catch((error: unknown) => error);
    server.use(
      http.get('/v1/members/me', () =>
        HttpResponse.json({ ...goodMe, roles: ['verifier'] }),
      ),
    );
    await act(async () => {
      await result.current.me.refetch();
    });
    await act(async () => {
      finish('late private data');
      await outcome;
    });
    expect(queryClient.getQueryData(['private-pending'])).toBeUndefined();
    await waitFor(() => expect(result.current.authority.allowed).toBe(false));
  });

  it('clears private caches when the server changes member identity with unchanged roles', async () => {
    signIn();
    server.use(
      http.get('/v1/members/me', () =>
        HttpResponse.json({ ...goodMe, roles: ['admin'] }),
      ),
    );
    const { result, queryClient } = setup();
    await waitFor(() => expect(result.current.me.isSuccess).toBe(true));
    queryClient.setQueryData(['private-directory'], 'old member data');
    server.use(
      http.get('/v1/members/me', () =>
        HttpResponse.json({
          ...goodMe,
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          roles: ['admin'],
        }),
      ),
    );
    await act(async () => {
      await result.current.me.refetch();
    });
    await waitFor(() =>
      expect(result.current.me.data?.id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );
    expect(queryClient.getQueryData(['private-directory'])).toBeUndefined();
  });

  it('keeps caches for an unchanged authority even if role order changes', async () => {
    signIn();
    server.use(
      http.get('/v1/members/me', () =>
        HttpResponse.json({ ...goodMe, roles: ['admin', 'dm'] }),
      ),
    );
    const { result, queryClient } = setup();
    await waitFor(() => expect(result.current.me.isSuccess).toBe(true));
    queryClient.setQueryData(['private-directory'], 'still permitted');
    server.use(
      http.get('/v1/members/me', () =>
        HttpResponse.json({ ...goodMe, roles: ['dm', 'admin'] }),
      ),
    );
    await act(async () => {
      await result.current.me.refetch();
    });
    expect(queryClient.getQueryData(['private-directory'])).toBe('still permitted');
  });

  it.each([
    ['invalid', () => HttpResponse.json({ ...goodMe, roles: [7] }), 'invalid'],
    [
      'upstream',
      () => HttpResponse.json({ title: 'private detail' }, { status: 500 }),
      'upstream',
    ],
    [
      'forbidden',
      () => HttpResponse.json({ title: 'private detail' }, { status: 403 }),
      'forbidden',
    ],
  ] as const)(
    'masks prior authority and private caches after a %s me response',
    async (_label, response, kind) => {
      signIn();
      server.use(
        http.get('/v1/members/me', () =>
          HttpResponse.json({ ...goodMe, roles: ['admin'] }),
        ),
      );
      const { result, queryClient } = setup();
      await waitFor(() => expect(result.current.authority.allowed).toBe(true));
      queryClient.setQueryData(['private-directory'], 'secret');
      server.use(http.get('/v1/members/me', response));
      await act(async () => {
        await result.current.me.refetch();
      });
      await waitFor(() => expect(result.current.me.isError).toBe(true));
      expect(result.current.me.error).toMatchObject({ kind });
      expect(result.current.me.data).toBeUndefined();
      expect(result.current.authority.allowed).toBe(false);
      expect(queryClient.getQueryData(['private-directory'])).toBeUndefined();
      expect(result.current.auth.isAuthenticated).toBe(true);
    },
  );

  it('ends a 401 me session without retrying or exposing private data', async () => {
    signIn();
    let requested = 0;
    server.use(
      http.get('/v1/members/me', () => {
        requested++;
        return HttpResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });
      }),
    );
    const { result, queryClient } = setup();
    queryClient.setQueryData(['private-directory'], 'secret');
    await waitFor(() => expect(result.current.auth.isAuthenticated).toBe(false));
    expect(result.current.me.data).toBeUndefined();
    expect(result.current.authority.allowed).toBe(false);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(queryClient.getQueryData(['private-directory'])).toBeUndefined();
    expect(requested).toBe(1);
  });

  it('does not accept a late old-session me response after logout', async () => {
    signIn();
    let requested = 0;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get('/v1/members/me', async () => {
        requested++;
        await pending;
        return HttpResponse.json({ ...goodMe, roles: ['admin'] });
      }),
    );
    const { result, queryClient } = setup();
    await waitFor(() => expect(requested).toBe(1));
    const retainedRefetch = result.current.me.refetch;
    act(() => result.current.auth.logout());
    await act(async () => {
      release();
      await retainedRefetch();
    });
    expect(result.current.auth.isAuthenticated).toBe(false);
    expect(result.current.me.data).toBeUndefined();
    expect(result.current.authority.allowed).toBe(false);
    expect(queryClient.getQueryData(queryKeys.me)).toBeUndefined();
    expect(requested).toBe(1);
  });
});
