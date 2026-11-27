import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { graphql, HttpResponse } from 'msw';
import { AuthProvider, useAuth } from '../../../src/auth/AuthContext.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { usePrivateNotes } from '../../../src/features/member/hooks/usePrivateNotes.js';
import { createTestQueryClient } from '../../../src/providers.js';
import { server } from '../../../src/mocks/server.js';

const first = {
  id: '11111111-1111-4111-8111-111111111111',
  handle: 'mira',
  displayName: 'Mira',
  roles: ['player'],
};
const second = { ...first, id: '22222222-2222-4222-8222-222222222222', handle: 'other' };

function token(subject: string, memberId = first.id) {
  return `${btoa(JSON.stringify({ alg: 'none' }))}.${btoa(
    JSON.stringify({
      sub: subject,
      member_id: memberId,
      exp: Math.floor((Date.now() + 3600000) / 1000),
    }),
  )}.test`;
}

function signInAs(member: typeof first) {
  server.use(
    graphql.query('MemberMe', () => HttpResponse.json({ data: { memberMe: member } })),
  );
}

function setup(outcome: (keys: string[]) => Response) {
  const keys: string[] = [];
  server.use(
    graphql.query('MemberMyPrivateNotes', () =>
      HttpResponse.json({ data: { myPrivateNotes: { body: '', updatedAt: null } } }),
    ),
    graphql.mutation('MemberSetMyPrivateNotes', ({ variables }) => {
      keys.push(variables.meta.idempotencyKey);
      return outcome(keys);
    }),
  );
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
  const hook = renderHook(() => ({ notes: usePrivateNotes(), auth: useAuth() }), {
    wrapper,
  });
  return { ...hook, client, keys };
}

async function ready(client: ReturnType<typeof createTestQueryClient>, id = first.id) {
  await waitFor(() => expect(client.getQueryData(['me'])).toMatchObject({ id }));
}

const saved = (body: string) =>
  HttpResponse.json({
    data: { setMyPrivateNotes: { body, updatedAt: '2026-11-27T09:00:00Z' } },
  });

beforeEach(() => {
  localStorage.setItem(TOKEN_KEY, token('notes-first'));
  signInAs(first);
});

describe('usePrivateNotes save key', () => {
  it('reuses the key when the same text is retried after a lost response', async () => {
    const { result, client, keys } = setup((seen) =>
      seen.length === 1 ? HttpResponse.error() : saved('Draft'),
    );
    await ready(client);
    await waitFor(() => expect(result.current.notes.status).toBe('empty'));
    act(() => result.current.notes.setText('Draft'));
    act(() => result.current.notes.save());
    await waitFor(() => expect(result.current.notes.saveError).not.toBeNull());
    act(() => result.current.notes.save());
    await waitFor(() => expect(result.current.notes.justSaved).toBe(true));
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it('uses a new key for different text', async () => {
    const { result, client, keys } = setup(() => HttpResponse.error());
    await ready(client);
    await waitFor(() => expect(result.current.notes.status).toBe('empty'));
    act(() => result.current.notes.setText('One'));
    act(() => result.current.notes.save());
    await waitFor(() => expect(keys).toHaveLength(1));
    await waitFor(() => expect(result.current.notes.saving).toBe(false));
    act(() => result.current.notes.setText('Two'));
    act(() => result.current.notes.save());
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).not.toBe(keys[0]);
  });

  it('keeps the key when the same member refreshes the token (D52)', async () => {
    const { result, client, keys } = setup(() => HttpResponse.error());
    await ready(client);
    await waitFor(() => expect(result.current.notes.status).toBe('empty'));
    act(() => result.current.notes.setText('Draft'));
    act(() => result.current.notes.save());
    await waitFor(() => expect(result.current.notes.saveError).not.toBeNull());
    act(() => result.current.auth.storeToken(token('notes-refreshed')));
    await ready(client);
    act(() => result.current.notes.save());
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).toBe(keys[0]);
  });

  it('drops the key when another member signs in (D52)', async () => {
    const { result, client, keys } = setup(() => HttpResponse.error());
    await ready(client);
    await waitFor(() => expect(result.current.notes.status).toBe('empty'));
    act(() => result.current.notes.setText('Draft'));
    act(() => result.current.notes.save());
    await waitFor(() => expect(result.current.notes.saveError).not.toBeNull());
    signInAs(second);
    act(() => result.current.auth.storeToken(token('notes-second', second.id)));
    await ready(client, second.id);
    await waitFor(() => expect(result.current.notes.status).toBe('empty'));
    act(() => result.current.notes.setText('Draft'));
    act(() => result.current.notes.save());
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).not.toBe(keys[0]);
  });
});
