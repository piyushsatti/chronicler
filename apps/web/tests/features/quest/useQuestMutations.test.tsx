import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { graphql, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { queryKeys } from '../../../src/api/queryKeys.js';
import { createTestQueryClient } from '../../../src/providers.js';
import { AuthProvider } from '../../../src/auth/AuthContext.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { server } from '../../../src/mocks/server.js';
import { useQuestMutations } from '../../../src/features/quest/hooks/useQuestMutations.js';

const questId = '00000000-0000-4000-8000-000000000001';
const characterId = '00000000-0000-4000-8000-000000000002';
function setup() {
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthProvider>{children}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return {
    client,
    ...renderHook(() => useQuestMutations('Q-1', questId), { wrapper }),
  };
}
function token() {
  return `${btoa('{}')}.${btoa(JSON.stringify({ sub: 'discord-dev', exp: Math.floor(Date.now() / 1000) + 3600 }))}.dev`;
}
beforeEach(() => {
  localStorage.setItem(TOKEN_KEY, token());
});
describe('Quest command replay guard', () => {
  it('reuses the same payload key after a lost response and rejects synchronous duplicate dispatch', async () => {
    const keys: string[] = [];
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      graphql.mutation('SignupForQuest', async ({ variables }) => {
        keys.push(variables.meta.idempotencyKey);
        if (keys.length === 1) {
          await held;
          return HttpResponse.error();
        }
        return HttpResponse.json({
          data: { signupForQuest: { characterId, status: 'waitlisted' } },
        });
      }),
    );
    const { result, unmount, client } = setup();
    let first: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      first = result.current.execute({ kind: 'signup', questId, characterId });
      expect(
        await result.current.execute({ kind: 'signup', questId, characterId }),
      ).toBe(false);
    });
    await waitFor(() => expect(keys).toHaveLength(1));
    await act(async () => {
      release();
      expect(await first).toBe(false);
    });
    await act(async () => {
      expect(
        await result.current.execute({ kind: 'signup', questId, characterId }),
      ).toBe(true);
    });
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    expect(result.current.message).toBe('You joined the waitlist.');
    unmount();
    client.clear();
  });
  it('invalidates every retained list and summary after closure while preserving unrelated cache', async () => {
    const { client, result, unmount } = setup();
    const keys = [
      queryKeys.quest('Q-1'),
      queryKeys.questSummary('Q-1'),
      queryKeys.questList({}, 50, 0),
      ['quests', 'pages', {}],
      queryKeys.homeLanes,
      queryKeys.notifications,
      queryKeys.notificationsUnread,
    ];
    const unrelated = ['characterCatalog'];
    for (const key of [...keys, unrelated]) client.setQueryData(key, []);
    await act(async () => {
      expect(
        await result.current.execute({
          kind: 'close',
          questId,
          attendance: [],
          rewards: [],
        }),
      ).toBe(true);
    });
    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(unrelated)?.isInvalidated).toBe(false);
    unmount();
    client.clear();
  });
});
