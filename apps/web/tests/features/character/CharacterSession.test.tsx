import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { graphql, HttpResponse } from 'msw';
import { AuthProvider, useAuth } from '../../../src/auth/AuthContext.js';
import { createTestQueryClient } from '../../../src/providers.js';
import { useCharacterCreation } from '../../../src/features/character/hooks/useCharacterCreation.js';
import { useCharacterActivity } from '../../../src/features/character/hooks/useCharacterActivity.js';
import { useOwnerActions } from '../../../src/features/character/hooks/useOwnerActions.js';
import { parseCharacter } from '../../../src/features/character/adapters/characterAdapter.js';
import { server } from '../../../src/mocks/server.js';
import wire from '../../fixtures/wire/character/good.json';
import { characterActor, characterToken, signInCharacter } from './characterAuth.js';
const parsed = parseCharacter(wire);
if (!parsed.ok) throw Error('Invalid Character fixture');
const character = parsed.data;
beforeEach(() => signInCharacter());
afterEach(() => vi.restoreAllMocks());
function setup() {
  const client = createTestQueryClient();
  let formCallbacks = 0;
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}><MemoryRouter initialEntries={['/original']}><AuthProvider>{children}</AuthProvider></MemoryRouter></QueryClientProvider>;
  }
  const hook = renderHook(() => {
    const auth = useAuth();
    const creation = useCharacterCreation();
    const activity = useCharacterActivity(character.id);
    const owner = useOwnerActions({ character });
    const location = useLocation();
    return {
      auth, creation, activity, owner, location,
      execute(kind: 'create' | 'activity' | 'owner') {
        if (kind === 'create') creation.create.mutate({ name: 'One owned PC' });
        else if (kind === 'activity') activity.write.mutate({ kind: 'log', body: 'One owned log' }, { onSuccess: () => { formCallbacks++; } });
        else owner.saveProfile();
      },
      feedback(kind: 'create' | 'activity' | 'owner') {
        if (kind === 'create') return { error: creation.create.error, success: creation.create.isSuccess };
        if (kind === 'activity') return { error: activity.write.error, success: activity.write.isSuccess };
        return { error: owner.error, success: owner.message !== null };
      },
    };
  }, { wrapper: Wrapper });
  return { ...hook, client, callbacks: () => formCallbacks };
}
async function ready(client: ReturnType<typeof createTestQueryClient>, id = characterActor.id) {
  await waitFor(() => expect(client.getQueryData(['me'])).toMatchObject({ id }));
}
for (const [kind, operation, field, receipt] of [
  ['create', 'CreateCharacter', 'createCharacter', { id: character.id, shortCode: 'C-CREATED' }],
  ['activity', 'LogCharacterEvent', 'logCharacterEvent', { id: character.id }],
  ['owner', 'UpdateCharacterProfile', 'updateCharacterProfile', { id: character.id }],
] as const) {
  describe(`${kind} Character session admission`, () => {
    it('rejects an old callback after switching to another validated account', async () => {
      let writes = 0;
      server.use(graphql.mutation(operation, () => { writes++; return HttpResponse.error(); }));
      const { result, client } = setup();
      await ready(client);
      const retained = result.current.execute;
      const other = { ...characterActor, id: '22222222-2222-4222-8222-222222222222' };
      server.use(graphql.query('MemberMe', () => HttpResponse.json({ data: { memberMe: other } })));
      act(() => { result.current.auth.storeToken(characterToken('character-second')); retained(kind); });
      await ready(client, other.id);
      expect(writes).toBe(0);
      expect(result.current.feedback(kind)).toEqual({ error: null, success: false });
    });
    it('rechecks the session in the mutation microtask before dispatch', async () => {
      let writes = 0;
      server.use(graphql.mutation(operation, () => { writes++; return HttpResponse.error(); }));
      const { result, client } = setup();
      await ready(client);
      await act(async () => { result.current.execute(kind); result.current.auth.storeToken(characterToken('character-second')); await Promise.resolve(); });
      await ready(client);
      expect(writes).toBe(0);
      expect(result.current.feedback(kind)).toEqual({ error: null, success: false });
    });
    it('rejects expired sessions before the timer renders logout', async () => {
      let writes = 0;
      server.use(graphql.mutation(operation, () => { writes++; return HttpResponse.error(); }));
      const { result, client } = setup();
      await ready(client);
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 7200000);
      await act(async () => { result.current.execute(kind); await Promise.resolve(); });
      expect(writes).toBe(0);
    });
    for (const outcome of ['success', 'failure'] as const) {
      it(`suppresses late ${outcome} feedback, navigation and form callbacks after logout`, async () => {
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        let dispatched = false;
        let completed = false;
        server.use(graphql.mutation(operation, async () => {
          dispatched = true;
          await gate;
          completed = true;
          return outcome === 'success'
            ? HttpResponse.json({ data: { [field]: receipt } })
            : HttpResponse.json({ errors: [{ message: 'old account failure', extensions: { code: 'FORBIDDEN' } }] });
        }));
        const { result, client, callbacks } = setup();
        await ready(client);
        act(() => result.current.execute(kind));
        await waitFor(() => expect(dispatched).toBe(true));
        act(() => result.current.auth.logout());
        client.setQueryData(['characters'], { marker: 'new boundary' });
        client.setQueryData(['characterActivity', character.id], { marker: 'new boundary' });
        client.setQueryData(['character', character.id], { marker: 'new boundary' });
        await act(async () => { release(); await gate; });
        await waitFor(() => expect(completed).toBe(true));
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
        expect(result.current.feedback(kind)).toEqual({ error: null, success: false });
        expect(result.current.location.pathname).toBe('/original');
        expect(callbacks()).toBe(0);
        expect(client.getQueryData(['me'])).toBeUndefined();
        for (const key of [['characters'], ['characterActivity', character.id], ['character', character.id]]) {
          expect(client.getQueryState(key)?.isInvalidated).toBe(false);
        }
      });
    }
    it('starts a new replay key after an account-session change', async () => {
      const keys: unknown[] = [];
      server.use(graphql.mutation(operation, ({ variables }) => { keys.push(variables.meta.idempotencyKey); return HttpResponse.error(); }));
      const { result, client } = setup();
      await ready(client);
      act(() => result.current.execute(kind));
      await waitFor(() => expect(result.current.feedback(kind).error).not.toBeNull());
      act(() => result.current.auth.storeToken(characterToken('character-second')));
      await ready(client);
      act(() => result.current.execute(kind));
      await waitFor(() => expect(keys).toHaveLength(2));
      expect(keys[0]).not.toBe(keys[1]);
    });
  });
}
