import { beforeEach, describe, it, expect } from 'vitest';
import { graphql, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createTestQueryClient } from '../../../src/providers.js';
import { useProfileActions } from '../../../src/features/profile/hooks/useProfileActions.js';
import type { ProfileCommand } from '../../../src/features/profile/adapters/profileMutations.js';
import { server } from '../../../src/mocks/server.js';
import { AuthProvider } from '../../../src/auth/AuthContext.js';
import { signInProfile } from './profileAuth.js';
beforeEach(signInProfile);
const memberId = '11111111-1111-4111-8111-111111111111';
function wrapper() {
  const client = createTestQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  }
  return { client, Wrapper };
}
for (const [operation, command, field, receipt] of [
  [
    'ProfileUpdateMyProfile',
    { kind: 'profile', memberId, input: { displayName: 'One profile' } },
    'updateMyProfile',
    { id: memberId, displayName: 'One profile', avatarUrl: null },
  ],
  [
    'ProfileSetMyAvailability',
    { kind: 'availability', memberId, slots: [] },
    'setMyAvailability',
    [],
  ],
  [
    'ProfileUpdateMyDmProfile',
    { kind: 'dm', memberId, input: { acceptingPlayers: true, tagline: null } },
    'updateMyDmProfile',
    { memberId, status: 'draft', reviewRevision: 2 },
  ],
  [
    'ProfileSubmitDmProfile',
    { kind: 'submit', memberId, expectedRevision: 2 },
    'submitDmProfileForVerification',
    { memberId, status: 'pending', reviewRevision: 2 },
  ],
] satisfies [string, ProfileCommand, string, unknown][]) {
  describe(operation, () => {
    it('blocks a same-tick repeat and retains exact payload/key after a lost acknowledgement', async () => {
      const attempts: Record<string, unknown>[] = [];
      const receipts = new Set<unknown>();
      let effects = 0;
      server.use(
        graphql.mutation(operation, ({ variables }) => {
          attempts.push(variables);
          const key = variables.meta.idempotencyKey;
          if (!receipts.has(key)) {
            receipts.add(key);
            effects++;
            return HttpResponse.error();
          }
          return HttpResponse.json({ data: { [field]: receipt } });
        }),
      );
      const { client, Wrapper } = wrapper();
      const { result } = renderHook(() => useProfileActions('mira'), {
        wrapper: Wrapper,
      });
      await waitFor(() =>
        expect(client.getQueryData(['me'])).toMatchObject({ id: memberId }),
      );
      act(() => {
        result.current.execute(command);
        result.current.execute(command);
      });
      await waitFor(() => expect(result.current.error).not.toBeNull());
      expect(attempts).toHaveLength(1);
      act(() =>
        result.current.execute(
          command.kind === 'submit' ? { ...command, expectedRevision: 3 } : command,
        ),
      );
      await waitFor(() => expect(result.current.message).not.toBeNull());
      expect(attempts[1]).toEqual(attempts[0]);
      expect(effects).toBe(1);
      act(() => result.current.execute(command));
      await waitFor(() => expect(attempts).toHaveLength(3));
      expect(attempts[2]?.meta).not.toEqual(attempts[0]?.meta);
    });
  });
}
it('starts a new attempt when the edited payload changes', async () => {
  const attempts: Record<string, unknown>[] = [];
  server.use(
    graphql.mutation('ProfileUpdateMyProfile', ({ variables }) => {
      attempts.push(variables);
      return HttpResponse.error();
    }),
  );
  const { client, Wrapper } = wrapper();
  const { result } = renderHook(() => useProfileActions('mira'), {
    wrapper: Wrapper,
  });
  await waitFor(() =>
    expect(client.getQueryData(['me'])).toMatchObject({ id: memberId }),
  );
  act(() =>
    result.current.execute({
      kind: 'profile',
      memberId,
      input: { displayName: 'First' },
    }),
  );
  await waitFor(() => expect(result.current.error).not.toBeNull());
  act(() =>
    result.current.execute({
      kind: 'profile',
      memberId,
      input: { displayName: 'Second' },
    }),
  );
  await waitFor(() => expect(attempts).toHaveLength(2));
  expect(attempts[0]?.meta).not.toEqual(attempts[1]?.meta);
});
