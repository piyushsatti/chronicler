import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GRAPHQL_PATH } from '../../src/api/endpoints.js';
import { queryKeys } from '../../src/api/queryKeys.js';
import { AuthProvider, useAuth } from '../../src/auth/AuthContext.js';
import { TOKEN_KEY } from '../../src/auth/storage.js';
import { useAdminAuthority } from '../../src/features/admin/hooks/useAdminAuthority.js';
import { useMe } from '../../src/hooks/useMe.js';
import { server } from '../../src/mocks/server.js';
import { createTestQueryClient } from '../../src/providers.js';
import goodMe from '../fixtures/wire/me/good.json';
import {
  graphqlOperationName,
  mockMemberMe,
} from '../features/admin/authority-test-utils.js';

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

function trackMemberMeRequests() {
  let count = 0;
  const record = async ({ request }: { request: Request }) => {
    if (new URL(request.url).pathname !== GRAPHQL_PATH) return;
    try {
      const body = (await request.clone().json()) as { query?: string };
      if (graphqlOperationName(body.query) === 'MemberMe') count++;
    } catch {
      // ignore unreadable bodies
    }
  };
  server.events.on('request:start', record);
  return {
    get count() {
      return count;
    },
    stop: () => server.events.removeListener('request:start', record),
  };
}

describe('useMe validated authority lifecycle', () => {
  it('does not query or expose cached roles to an anonymous session', async () => {
    const me = { ...goodMe, roles: ['admin'] };
    mockMemberMe(
      () => HttpResponse.json(me),
      () => me,
    );
    const tracker = trackMemberMeRequests();
    try {
      const { result } = setup(true);
      expect(result.current.me.data).toBeUndefined();
      expect(result.current.me.isSuccess).toBe(false);
      expect(result.current.authority.allowed).toBe(false);
      await act(async () => {
        await result.current.me.refetch();
      });
      expect(tracker.count).toBe(0);
      expect(result.current.authority.allowed).toBe(false);
    } finally {
      tracker.stop();
    }
  });

  it('does not approve stored cached admin roles before the current me request validates', async () => {
    signIn();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const me = { ...goodMe, roles: ['verifier'] };
    mockMemberMe(
      async () => {
        await pending;
        return HttpResponse.json(me);
      },
      async () => {
        await pending;
        return me;
      },
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
    const admin = { ...goodMe, roles: ['admin'] };
    mockMemberMe(
      () => HttpResponse.json(admin),
      () => admin,
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
    const verifier = { ...goodMe, roles: ['verifier'] };
    mockMemberMe(
      () => HttpResponse.json(verifier),
      () => verifier,
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
    const admin = { ...goodMe, roles: ['admin'] };
    mockMemberMe(
      () => HttpResponse.json(admin),
      () => admin,
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
    const verifier = { ...goodMe, roles: ['verifier'] };
    mockMemberMe(
      () => HttpResponse.json(verifier),
      () => verifier,
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
    const admin = { ...goodMe, roles: ['admin'] };
    mockMemberMe(
      () => HttpResponse.json(admin),
      () => admin,
    );
    const { result, queryClient } = setup();
    await waitFor(() => expect(result.current.me.isSuccess).toBe(true));
    queryClient.setQueryData(['private-directory'], 'old member data');
    const swapped = {
      ...goodMe,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      roles: ['admin'],
    };
    mockMemberMe(
      () => HttpResponse.json(swapped),
      () => swapped,
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
    const ordered = { ...goodMe, roles: ['admin', 'dm'] };
    mockMemberMe(
      () => HttpResponse.json(ordered),
      () => ordered,
    );
    const { result, queryClient } = setup();
    await waitFor(() => expect(result.current.me.isSuccess).toBe(true));
    queryClient.setQueryData(['private-directory'], 'still permitted');
    const reordered = { ...goodMe, roles: ['dm', 'admin'] };
    mockMemberMe(
      () => HttpResponse.json(reordered),
      () => reordered,
    );
    await act(async () => {
      await result.current.me.refetch();
    });
    expect(queryClient.getQueryData(['private-directory'])).toBe('still permitted');
  });

  it.each([
    [
      'invalid',
      () => HttpResponse.json({ ...goodMe, roles: [7] }),
      () => ({ ...goodMe, roles: [7] }),
      'invalid',
    ],
    [
      'upstream',
      () => HttpResponse.json({ title: 'private detail' }, { status: 500 }),
      null,
      'upstream',
    ],
  ] as const)(
    'masks prior authority and preserves private caches after a %s me response',
    async (_label, restResponse, graphqlData, kind) => {
      signIn();
      const admin = { ...goodMe, roles: ['admin'] };
      mockMemberMe(
        () => HttpResponse.json(admin),
        () => admin,
      );
      const { result, queryClient } = setup();
      await waitFor(() => expect(result.current.authority.allowed).toBe(true));
      queryClient.setQueryData(['private-directory'], 'secret');
      mockMemberMe(restResponse, graphqlData ?? undefined);
      await act(async () => {
        await result.current.me.refetch();
      });
      await waitFor(() => expect(result.current.me.isError).toBe(true));
      expect(result.current.me.error).toMatchObject({ kind });
      expect(result.current.me.data).toBeUndefined();
      expect(result.current.authority.allowed).toBe(false);
      expect(queryClient.getQueryData(['private-directory'])).toBe('secret');
      expect(result.current.auth.isAuthenticated).toBe(true);
    },
  );

  it('masks prior authority and clears private caches after a forbidden me response', async () => {
    signIn();
    const admin = { ...goodMe, roles: ['admin'] };
    mockMemberMe(
      () => HttpResponse.json(admin),
      () => admin,
    );
    const { result, queryClient } = setup();
    await waitFor(() => expect(result.current.authority.allowed).toBe(true));
    queryClient.setQueryData(['private-directory'], 'secret');
    // A banned or inactive member gets 403: access was revoked, so drop what it loaded.
    mockMemberMe(() => HttpResponse.json({ title: 'private detail' }, { status: 403 }));
    await act(async () => {
      await result.current.me.refetch();
    });
    await waitFor(() => expect(result.current.me.isError).toBe(true));
    expect(result.current.me.error).toMatchObject({ kind: 'forbidden' });
    expect(result.current.authority.allowed).toBe(false);
    expect(queryClient.getQueryData(['private-directory'])).toBeUndefined();
    expect(result.current.auth.isAuthenticated).toBe(true);
  });

  it('ends a 401 me session without retrying or exposing private data', async () => {
    signIn();
    const tracker = trackMemberMeRequests();
    try {
      mockMemberMe(() => HttpResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 }));
      const { result, queryClient } = setup();
      queryClient.setQueryData(['private-directory'], 'secret');
      await waitFor(() => expect(result.current.auth.isAuthenticated).toBe(false));
      expect(result.current.me.data).toBeUndefined();
      expect(result.current.authority.allowed).toBe(false);
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(queryClient.getQueryData(['private-directory'])).toBeUndefined();
      expect(tracker.count).toBe(1);
    } finally {
      tracker.stop();
    }
  });

  it('does not refetch a failed me query when another page mounts', async () => {
    signIn();
    const tracker = trackMemberMeRequests();
    try {
      mockMemberMe(
        () => HttpResponse.json({ title: 'private detail' }, { status: 403 }),
        undefined,
      );
      const queryClient = createTestQueryClient();
      function Page() {
        const me = useMe();
        return <p>{me.isError ? 'failed' : 'waiting'}</p>;
      }
      function App({ page }: { page: number }) {
        return (
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <Page key={page} />
            </AuthProvider>
          </QueryClientProvider>
        );
      }
      const view = render(<App page={1} />);
      await screen.findByText('failed');
      expect(tracker.count).toBe(1);
      view.rerender(<App page={2} />);
      await screen.findByText('failed');
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(tracker.count).toBe(1);
    } finally {
      tracker.stop();
    }
  });

  it('does not accept a late old-session me response after logout', async () => {
    signIn();
    const tracker = trackMemberMeRequests();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const admin = { ...goodMe, roles: ['admin'] };
    try {
      mockMemberMe(
        async () => {
          await pending;
          return HttpResponse.json(admin);
        },
        async () => {
          await pending;
          return admin;
        },
      );
      const { result, queryClient } = setup();
      await waitFor(() => expect(tracker.count).toBe(1));
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
      expect(tracker.count).toBe(1);
    } finally {
      tracker.stop();
    }
  });
});
