import { graphql, HttpResponse } from 'msw';
import { beforeEach, describe, it, expect } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { createTestQueryClient } from '../../../src/providers.js';
import { useCharacterCreation } from '../../../src/features/character/hooks/useCharacterCreation.js';
import { useCharacterActivity } from '../../../src/features/character/hooks/useCharacterActivity.js';
import { useOwnerActions } from '../../../src/features/character/hooks/useOwnerActions.js';
import type { ActivityCommand } from '../../../src/features/character/adapters/characterActivityAdapter.js';
import { parseCharacter } from '../../../src/features/character/adapters/characterAdapter.js';
import { server } from '../../../src/mocks/server.js';
import wire from '../../fixtures/wire/character/good.json';
import { AuthProvider } from '../../../src/auth/AuthContext.js';
import { signInCharacter, characterActor } from './characterAuth.js';
beforeEach(() => signInCharacter());

function wrapper() {
  const client = createTestQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter><AuthProvider>{children}</AuthProvider></MemoryRouter>
      </QueryClientProvider>
    );
  }
  return { client, Wrapper };
}
async function ready(client: ReturnType<typeof createTestQueryClient>) {
  await waitFor(() => expect(client.getQueryData(['me'])).toMatchObject({ id: characterActor.id }));
}
function character() {
  const parsed = parseCharacter(wire);
  if (!parsed.ok) throw Error('Invalid retained fixture');
  return parsed.data;
}

describe('Character command retry identity', () => {
  it('creates once across same-tick duplicate invocation and a lost-response retry', async () => {
    const keys: unknown[] = [];
    let committed = 0;
    const receipts = new Set<unknown>();
    server.use(
      graphql.mutation('CreateCharacter', ({ variables }) => {
        const key = variables.meta.idempotencyKey;
        keys.push(key);
        if (!receipts.has(key)) {
          receipts.add(key);
          committed++;
          return HttpResponse.error();
        }
        return HttpResponse.json({
          data: { createCharacter: { id: wire.id, shortCode: 'C-CREATED' } },
        });
      }),
    );
    const { client, Wrapper } = wrapper();
    const { result } = renderHook(() => useCharacterCreation(), { wrapper: Wrapper });
    await ready(client);
    const input = { name: 'One PC' };
    act(() => {
      result.current.create.mutate(input);
      result.current.create.mutate(input);
    });
    await waitFor(() => expect(result.current.create.isError).toBe(true));
    expect(keys).toHaveLength(1);
    act(() => result.current.create.mutate(input));
    await waitFor(() => expect(result.current.create.isSuccess).toBe(true));
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(committed).toBe(1);
  });
  for (const [operation, command, field] of [
    ['AdjustPcxp', { kind: 'xp', amount: -2, note: 'Correction' }, 'adjustPcxp'],
    ['LogCharacterEvent', { kind: 'log', body: 'Once' }, 'logCharacterEvent'],
    [
      'UpsertDowntimeProject',
      { kind: 'downtime', input: { name: 'Study', progress: 1, status: 'active' } },
      'upsertDowntimeProject',
    ],
  ] satisfies [string, ActivityCommand, string][]) {
    it(`${operation} retains its exact signed payload and replay key after a lost acknowledgement`, async () => {
      const attempts: Record<string, unknown>[] = [];
      const receipts = new Set<unknown>();
      let effects = 0;
      server.use(
        graphql.mutation(operation, ({ variables }) => {
          attempts.push(variables);
          const key = variables.meta.idempotencyKey;
          if (!receipts.has(key)) {
            effects++;
            receipts.add(key);
            return HttpResponse.error();
          }
          return HttpResponse.json({ data: { [field]: { id: wire.id } } });
        }),
      );
      const { client, Wrapper } = wrapper();
      const { result } = renderHook(() => useCharacterActivity(wire.id), {
        wrapper: Wrapper,
      });
      await ready(client);
      act(() => {
        result.current.write.mutate(command);
        result.current.write.mutate(command);
      });
      await waitFor(() => expect(result.current.write.isError).toBe(true));
      expect(attempts).toHaveLength(1);
      act(() => result.current.write.mutate(command));
      await waitFor(() => expect(result.current.write.isSuccess).toBe(true));
      expect(attempts[1]).toEqual(attempts[0]);
      expect(effects).toBe(1);
      act(() => result.current.write.mutate(command));
      await waitFor(() => expect(attempts).toHaveLength(3));
      expect(attempts[2]?.meta).not.toEqual(attempts[0]?.meta);
    });
  }
  for (const [operation, action, field] of [
    ['UpdateCharacterProfile', 'saveProfile', 'updateCharacterProfile'],
    ['SyncCharacterDdb', 'syncDdb', 'syncCharacterDdb'],
    ['SubmitForVerification', 'submitForVerification', 'submitForVerification'],
    ['RetireCharacter', 'retire', 'retireCharacter'],
  ] satisfies [
    string,
    'saveProfile' | 'syncDdb' | 'submitForVerification' | 'retire',
    string,
  ][]) {
    it(`${operation} blocks a same-tick duplicate and retries the original loaded version`, async () => {
      const attempts: Record<string, unknown>[] = [];
      let effects = 0;
      server.use(
        graphql.mutation(operation, ({ variables }) => {
          attempts.push(variables);
          if (attempts.length === 1) {
            effects++;
            return HttpResponse.error();
          }
          return HttpResponse.json({
            data: {
              [field]:
                operation === 'SyncCharacterDdb'
                  ? {
                      succeeded: false,
                      safeError: 'TIMEOUT',
                      attemptedAt: wire.updatedAt,
                    }
                  : { id: wire.id },
            },
          });
        }),
      );
      const { client, Wrapper } = wrapper();
      const { result, rerender } = renderHook(
        ({ version }) =>
          useOwnerActions({ character: { ...character(), updatedAt: version } }),
        { wrapper: Wrapper, initialProps: { version: wire.updatedAt } },
      );
      await ready(client);
      act(() => {
        result.current[action]();
        result.current[action]();
      });
      await waitFor(() => expect(result.current.error).not.toBeNull());
      expect(attempts).toHaveLength(1);
      rerender({ version: '2026-10-20T01:00:00Z' });
      act(() => result.current[action]());
      await waitFor(() => expect(result.current.message).not.toBeNull());
      expect(attempts[1]).toEqual(attempts[0]);
      expect(effects).toBe(1);
      if (operation === 'SyncCharacterDdb') {
        act(() => result.current.syncDdb());
        await waitFor(() => expect(attempts).toHaveLength(3));
        expect(attempts[2]?.meta).not.toEqual(attempts[1]?.meta);
      }
    });
  }
  it('changes a pending creation key when the user deliberately changes its payload', async () => {
    const keys: unknown[] = [];
    server.use(
      graphql.mutation('CreateCharacter', ({ variables }) => {
        keys.push(variables.meta.idempotencyKey);
        return HttpResponse.error();
      }),
    );
    const { client, Wrapper } = wrapper();
    const { result } = renderHook(() => useCharacterCreation(), { wrapper: Wrapper });
    await ready(client);
    act(() => result.current.create.mutate({ name: 'First' }));
    await waitFor(() => expect(result.current.create.isError).toBe(true));
    act(() => result.current.create.mutate({ name: 'Second' }));
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[0]).not.toBe(keys[1]);
  });
});
