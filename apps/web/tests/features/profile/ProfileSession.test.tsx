import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { graphql, HttpResponse } from 'msw';
import { AuthProvider, useAuth } from '../../../src/auth/AuthContext.js';
import { createTestQueryClient } from '../../../src/providers.js';
import { useProfileActions } from '../../../src/features/profile/hooks/useProfileActions.js';
import { server } from '../../../src/mocks/server.js';
import { profileActor, profileToken, signInProfile } from './profileAuth.js';
const other = {
  ...profileActor,
  id: '22222222-2222-4222-8222-222222222222',
  handle: 'other',
};
const command = {
  kind: 'profile' as const,
  memberId: profileActor.id,
  input: { displayName: 'Old form fields' },
};
beforeEach(signInProfile);
afterEach(() => vi.restoreAllMocks());
function setup() {
  const client = createTestQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  }
  const hook = renderHook(
    () => ({ auth: useAuth(), actions: useProfileActions('mira') }),
    { wrapper: Wrapper },
  );
  return { ...hook, client };
}
async function ready(
  client: ReturnType<typeof createTestQueryClient>,
  id = profileActor.id,
) {
  await waitFor(() => expect(client.getQueryData(['me'])).toMatchObject({ id }));
}
describe('Profile session admission', () => {
  it('rejects a retained old-account callback and mismatched member UUID after account switching', async () => {
    const attempts: Record<string, unknown>[] = [];
    server.use(
      graphql.query('MemberMe', () => HttpResponse.json({ data: { memberMe: other } })),
      graphql.mutation('ProfileUpdateMyProfile', ({ variables }) => {
        attempts.push(variables);
        return HttpResponse.json({
          data: {
            updateMyProfile: {
              id: other.id,
              displayName: 'Current account',
              avatarUrl: null,
            },
          },
        });
      }),
    );
    // The first validated identity is independent of the next account's response.
    server.use(
      graphql.query(
        'MemberMe',
        () => HttpResponse.json({ data: { memberMe: profileActor } }),
        { once: true },
      ),
    );
    const { result, client } = setup();
    await ready(client);
    const retained = result.current.actions.execute;
    act(() => {
      result.current.auth.storeToken(profileToken('profile-second'));
      retained(command);
    });
    await ready(client, other.id);
    act(() => result.current.actions.execute(command));
    expect(attempts).toHaveLength(0);
    act(() =>
      result.current.actions.execute({
        ...command,
        memberId: other.id,
        input: { displayName: 'Current account' },
      }),
    );
    await waitFor(() => expect(result.current.actions.message).toBe('Profile saved.'));
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.input).toEqual({ displayName: 'Current account' });
  });
  it('rechecks the captured session at the mutation microtask before dispatch', async () => {
    let writes = 0;
    server.use(
      graphql.mutation('ProfileUpdateMyProfile', () => {
        writes++;
        return HttpResponse.error();
      }),
    );
    const { result, client } = setup();
    await ready(client);
    await act(async () => {
      result.current.actions.execute(command);
      result.current.auth.storeToken(profileToken('profile-second'));
      await Promise.resolve();
    });
    await ready(client);
    expect(writes).toBe(0);
    expect(result.current.actions.error).toBeNull();
    expect(result.current.actions.message).toBeNull();
  });
  it('rejects expired-session dispatch even before the expiry timer renders logout', async () => {
    let writes = 0;
    server.use(
      graphql.mutation('ProfileUpdateMyProfile', () => {
        writes++;
        return HttpResponse.error();
      }),
    );
    const { result, client } = setup();
    await ready(client);
    const future = Date.now() + 7200000;
    vi.spyOn(Date, 'now').mockReturnValue(future);
    await act(async () => {
      result.current.actions.execute(command);
      await Promise.resolve();
    });
    expect(writes).toBe(0);
    expect(result.current.actions.message).toBeNull();
  });
  for (const outcome of ['success', 'failure'] as const) {
    it(`suppresses late ${outcome} feedback and cache refresh after logout`, async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let dispatched = false;
      let completed = false;
      server.use(
        graphql.mutation('ProfileUpdateMyProfile', async () => {
          dispatched = true;
          await gate;
          completed = true;
          return outcome === 'success'
            ? HttpResponse.json({
                data: {
                  updateMyProfile: {
                    id: profileActor.id,
                    displayName: 'Old form fields',
                    avatarUrl: null,
                  },
                },
              })
            : HttpResponse.json({
                errors: [
                  { message: 'old account failure', extensions: { code: 'FORBIDDEN' } },
                ],
              });
        }),
      );
      const { result, client } = setup();
      await ready(client);
      act(() => result.current.actions.execute(command));
      await waitFor(() => expect(dispatched).toBe(true));
      act(() => result.current.auth.logout());
      client.setQueryData(['memberProfile', 'mira'], { marker: 'new cache boundary' });
      await act(async () => {
        release();
        await gate;
      });
      await waitFor(() => expect(completed).toBe(true));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(result.current.actions.message).toBeNull();
      expect(result.current.actions.error).toBeNull();
      expect(client.getQueryData(['me'])).toBeUndefined();
      expect(client.getQueryState(['memberProfile', 'mira'])?.isInvalidated).toBe(
        false,
      );
      expect(client.getQueryData(['memberProfile', 'mira'])).toEqual({
        marker: 'new cache boundary',
      });
    });
  }
  it('does not reuse an ambiguous retry key in another account session', async () => {
    const attempts: Record<string, unknown>[] = [];
    server.use(
      graphql.mutation('ProfileUpdateMyProfile', ({ variables }) => {
        attempts.push(variables);
        return HttpResponse.error();
      }),
    );
    const { result, client } = setup();
    await ready(client);
    act(() => result.current.actions.execute(command));
    await waitFor(() => expect(result.current.actions.error).not.toBeNull());
    act(() => result.current.auth.storeToken(profileToken('profile-second')));
    await ready(client);
    act(() => result.current.actions.execute(command));
    await waitFor(() => expect(attempts).toHaveLength(2));
    expect(attempts[0]?.meta).not.toEqual(attempts[1]?.meta);
  });
});
