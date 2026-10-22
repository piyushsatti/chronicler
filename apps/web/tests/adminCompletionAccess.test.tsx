import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { graphql, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../src/auth/AuthContext.js';
import { useCurrentAccess } from '../src/auth/useCurrentAccess.js';
import { useAdminAuthority } from '../src/features/admin/hooks/useAdminAuthority.js';
import { setMemberRoles } from '../src/features/admin/adapters/adminAdapter.js';
import { createTestQueryClient } from '../src/providers.js';
import { server } from '../src/mocks/server.js';
import { mockGraphqlOps, signIn } from './features/admin/authority-test-utils.js';
import goodMe from './fixtures/wire/me/good.json';
import { useMembersPanel } from '../src/features/admin/hooks/useMembersPanel.js';
import members from './fixtures/wire/admin/members-good.json';

function setup() {
  const client = createTestQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  }
  return {
    client,
    ...renderHook(
      () => ({
        access: useCurrentAccess('admin'),
        auth: useAuth(),
        authority: useAdminAuthority(),
      }),
      { wrapper: Wrapper },
    ),
  };
}
const admitted = () =>
  HttpResponse.json<{ data: { adminOperations: { activeAlertCount: number } } }>({
    data: { adminOperations: { activeAlertCount: 0 } },
  });
const denied = () =>
  HttpResponse.json({
    errors: [{ message: 'Not permitted', extensions: { code: 'FORBIDDEN' } }],
  });

describe('Canonical staff read admission', () => {
  it('admits a configured owner without stored roles, and keys proofs by validated account without a bearer', async () => {
    signIn([]);
    mockGraphqlOps({ CurrentAdminAccess: admitted }, { ...goodMe, roles: [] });
    const { result, client } = setup();
    await waitFor(() => expect(result.current.authority.allowed).toBe(true));
    expect(result.current.access.isCurrentProof()).toBe(true);
    const proofs = client
      .getQueryCache()
      .getAll()
      .filter((q) => q.queryKey[0] === 'currentAccess');
    expect(JSON.stringify(proofs.map((q) => q.queryKey))).not.toContain(
      result.current.auth.token,
    );
  });
  it('keeps an ordinary member signed in after an expected private FORBIDDEN', async () => {
    signIn(['player']);
    const { result } = setup();
    await waitFor(() => expect(result.current.access.status).toBe('forbidden'));
    expect(result.current.authority.allowed).toBe(false);
    expect(result.current.auth.isAuthenticated).toBe(true);
  });
  it('exposes unexpected failures and retries the protected read', async () => {
    signIn();
    let attempts = 0;
    server.use(
      graphql.query('CurrentAdminAccess', () =>
        ++attempts === 1 ? HttpResponse.error() : admitted(),
      ),
    );
    const { result } = setup();
    await waitFor(() => expect(result.current.access.status).toBe('error'));
    expect(result.current.auth.isAuthenticated).toBe(true);
    act(() => result.current.access.reload());
    await waitFor(() => expect(result.current.access.status).toBe('allowed'));
    expect(attempts).toBe(2);
  });
  it('does not restore a late old-account admission after logout', async () => {
    signIn();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = false;
    server.use(
      graphql.query('CurrentAdminAccess', async () => {
        started = true;
        await gate;
        return admitted();
      }),
    );
    const { result, client } = setup();
    await waitFor(() => expect(started).toBe(true));
    const retained = result.current.access.isCurrentProof;
    act(() => result.current.auth.logout());
    await act(async () => {
      release();
      await gate;
    });
    expect(retained()).toBe(false);
    expect(result.current.authority.allowed).toBe(false);
    expect(
      client
        .getQueryCache()
        .getAll()
        .some((q) => q.queryKey[0] === 'currentAccess' && q.state.data === true),
    ).toBe(false);
  });
  it('uses exact-payload retry keys, blocks duplicate dispatch, and retires successful keys', async () => {
    signIn();
    const attempts: {
      variables: Record<string, unknown>;
      authorization: string | null;
    }[] = [];
    let release!: () => void;
    let delayed = false;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      graphql.mutation('SetMemberRoles', async ({ variables, request }) => {
        attempts.push({
          variables,
          authorization: request.headers.get('Authorization'),
        });
        if (attempts.length === 1) return HttpResponse.error();
        if (delayed) await gate;
        return HttpResponse.json({
          data: { setMemberRoles: { id: goodMe.id, roles: ['player'] } },
        });
      }),
    );
    const { result } = setup();
    await waitFor(() => expect(result.current.authority.allowed).toBe(true));
    const execute = () =>
      result.current.authority.guardMutation((command) =>
        setMemberRoles(goodMe.id, ['player'], command),
      )();
    await expect(execute()).rejects.toBeDefined();
    delayed = true;
    const second = execute();
    expect(execute).toThrow();
    await waitFor(() => expect(attempts).toHaveLength(2));
    await act(async () => {
      release();
      await second;
    });
    delayed = false;
    await execute();
    expect(attempts[0].variables.meta).toEqual(attempts[1].variables.meta);
    expect(attempts[2].variables.meta).not.toEqual(attempts[1].variables.meta);
    expect(
      attempts.every((a) => a.authorization === `Bearer ${result.current.auth.token}`),
    ).toBe(true);
  });
  it('rejects retained callbacks after role loss and after token expiry before any command dispatch', async () => {
    signIn();
    const { result } = setup();
    await waitFor(() => expect(result.current.authority.allowed).toBe(true));
    const action = vi.fn();
    const retained = result.current.authority.guardMutation(action);
    const future = Date.now() + 7200000;
    const now = vi.spyOn(Date, 'now').mockReturnValue(future);
    expect(retained).toThrow();
    now.mockRestore();
    mockGraphqlOps({ CurrentAdminAccess: denied }, { ...goodMe, roles: ['player'] });
    act(() => result.current.authority.reload());
    await waitFor(() => expect(result.current.access.status).toBe('forbidden'));
    expect(retained).toThrow();
    expect(action).not.toHaveBeenCalled();
  });
  it.each(['success', 'failure'] as const)(
    'suppresses a late %s command reply after logout',
    async (outcome) => {
      signIn();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let dispatched = false;
      server.use(
        graphql.mutation('SetMemberRoles', async ({ variables }) => {
          dispatched = true;
          await gate;
          return outcome === 'success'
            ? HttpResponse.json({
                data: { setMemberRoles: { id: variables.memberId, roles: ['player'] } },
              })
            : HttpResponse.json({
                errors: [
                  {
                    message: 'old account private detail',
                    extensions: { code: 'FORBIDDEN' },
                  },
                ],
              });
        }),
      );
      const client = createTestQueryClient();
      function Wrapper({ children }: { children: ReactNode }) {
        return (
          <QueryClientProvider client={client}>
            <AuthProvider>{children}</AuthProvider>
          </QueryClientProvider>
        );
      }
      const { result } = renderHook(
        () => ({ auth: useAuth(), panel: useMembersPanel() }),
        { wrapper: Wrapper },
      );
      await waitFor(() => expect(result.current.panel.directory.data).toBeDefined());
      act(() => {
        result.current.panel.setSelected(members.items[0]);
        result.current.panel.setDraftRoles(['player']);
      });
      let pending!: Promise<unknown>;
      act(() => {
        pending = result.current.panel.saveRoles.mutateAsync().catch((error) => error);
      });
      await waitFor(() => expect(dispatched).toBe(true));
      act(() => result.current.auth.logout());
      client.setQueryData(['adminMembers', 'new-boundary'], { marker: 'untouched' });
      await act(async () => {
        release();
        await pending;
      });
      expect(result.current.panel.saveRoles.error).toBeUndefined();
      expect(result.current.panel.saveRoles.data).toBeUndefined();
      expect(client.getQueryData(['me'])).toBeUndefined();
      expect(
        client.getQueryState(['adminMembers', 'new-boundary'])?.isInvalidated,
      ).toBe(false);
    },
  );
});
