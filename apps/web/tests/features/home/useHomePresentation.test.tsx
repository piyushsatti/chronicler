import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { graphql, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AuthProvider, useAuth } from '../../../src/auth/AuthContext.js';
import { ThemeProvider } from '../../../src/context/ThemeContext.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { parseHomeLanesWire } from '../../../src/features/home/adapters/homeLanesAdapter.js';
import { useHomePresentation } from '../../../src/features/home/hooks/useHomePresentation.js';
import type { HomeQuestView } from '../../../src/features/home/adapters/homeLanesAdapter.js';
import { server } from '../../../src/mocks/server.js';
import { createTestQueryClient } from '../../../src/providers.js';
import { createAppStore } from '../../../src/store/store.js';
import good from '../../fixtures/wire/home/lanes-good.json';
import me from '../../fixtures/wire/me/good.json';

const CHARACTER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function setup(status = 'signed_up') {
  localStorage.setItem(
    TOKEN_KEY,
    `${btoa('{}')}.${btoa(JSON.stringify({ sub: 'unit-home', exp: Date.now() / 1000 + 3600 }))}.test`,
  );
  const parsed = parseHomeLanesWire({
    ...good,
    questBoard: {
      ...good.questBoard,
      items: [
        {
          ...good.questBoard.items[0],
          participants: [
            {
              memberId: me.id,
              characterId: CHARACTER,
              characterName: 'Own character',
              memberHandle: me.handle,
              status,
            },
          ],
        },
      ],
    },
  });
  if (!parsed.ok) throw new Error(parsed.detail);
  const store = createAppStore();
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AuthProvider>
            <ThemeProvider>{children}</ThemeProvider>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>
  );
  return {
    store,
    client,
    ...renderHook(
      ({ quests }: { quests: HomeQuestView[] }) => ({
        view: useHomePresentation(quests),
        auth: useAuth(),
      }),
      { wrapper, initialProps: { quests: parsed.data.recruiting } },
    ),
    quests: parsed.data.recruiting,
  };
}
const attemptSchema = z.object({
  questId: z.string(),
  characterId: z.string(),
  meta: z.object({ idempotencyKey: z.string() }),
});

describe('Home participation', () => {
  it('uses current member ownership, guards duplicate submissions and retains an exact-payload retry key', async () => {
    const attempts: z.infer<typeof attemptSchema>[] = [];
    let fail = true;
    let release: () => void = () => undefined;
    const response = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      graphql.mutation('HomeWithdrawFromQuest', async ({ variables }) => {
        const attempt = attemptSchema.parse(variables);
        attempts.push(attempt);
        if (fail) {
          await response;
          return HttpResponse.json({
            errors: [{ message: 'temporary', extensions: { code: 'INTERNAL' } }],
          });
        }
        return HttpResponse.json({
          data: {
            withdrawFromQuest: {
              questId: attempt.questId,
              characterId: attempt.characterId,
              status: 'withdrawn',
            },
          },
        });
      }),
    );
    const state = setup('waitlisted');
    await waitFor(() =>
      expect(state.result.current.view.cards[0]?.onWithdrawConfirm).toBeTypeOf(
        'function',
      ),
    );
    expect(state.result.current.view.cards[0]).toMatchObject({
      mine: true,
      waitlisted: true,
    });
    const action = state.result.current.view.cards[0]?.onWithdrawConfirm;
    act(() => {
      action?.();
      action?.();
    });
    await waitFor(() => expect(attempts).toHaveLength(1));
    act(release);
    await waitFor(() => expect(state.store.getState().toasts.items).toHaveLength(1));
    await waitFor(() =>
      expect(state.result.current.view.cards[0]?.isMutating).toBe(false),
    );
    const keys = [
      ['homeLanes'],
      ['quest', 'Q1'],
      ['questSummary', 'Q1'],
      ['quests'],
      ['notifications'],
      ['notificationsUnread'],
    ];
    for (const key of keys) state.client.setQueryData(key, { retained: true });
    fail = false;
    act(() => {
      state.result.current.view.cards[0]?.onWithdrawConfirm?.();
    });
    await waitFor(() =>
      expect(state.store.getState().toasts.items.at(-1)?.tone).toBe('success'),
    );
    expect(attempts).toHaveLength(2);
    expect(attempts[0]?.characterId).toBe(CHARACTER);
    expect(attempts[0]?.meta.idempotencyKey).toBe(attempts[1]?.meta.idempotencyKey);
    expect(state.store.getState().toasts.items.at(-1)?.message).toBe(
      'Your character has withdrawn.',
    );
    for (const key of keys)
      expect(state.client.getQueryState(key)?.isInvalidated).toBe(true);
    await waitFor(() =>
      expect(state.result.current.view.cards[0]?.isMutating).toBe(false),
    );
    const nextCharacter = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    state.rerender({
      quests: state.quests.map((quest) => ({
        ...quest,
        participants: quest.participants.map((participant) => ({
          ...participant,
          characterId: nextCharacter,
        })),
      })),
    });
    act(() => state.result.current.view.cards[0]?.onWithdrawConfirm?.());
    await waitFor(() => expect(attempts).toHaveLength(3));
    expect(attempts[2]?.characterId).toBe(nextCharacter);
    expect(attempts[2]?.meta.idempotencyKey).not.toBe(attempts[1]?.meta.idempotencyKey);
  });

  it('rejects a retained callback after logout and ignores late success feedback', async () => {
    let calls = 0;
    let release: () => void = () => undefined;
    const response = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      graphql.mutation('HomeWithdrawFromQuest', async ({ variables }) => {
        calls++;
        const attempt = attemptSchema.parse(variables);
        await response;
        return HttpResponse.json({
          data: {
            withdrawFromQuest: {
              questId: attempt.questId,
              characterId: attempt.characterId,
              status: 'withdrawn',
            },
          },
        });
      }),
    );
    const state = setup();
    await waitFor(() =>
      expect(state.result.current.view.cards[0]?.onWithdrawConfirm).toBeTypeOf(
        'function',
      ),
    );
    const action = state.result.current.view.cards[0]?.onWithdrawConfirm;
    act(() => {
      action?.();
    });
    await waitFor(() => expect(calls).toBe(1));
    act(() => state.result.current.auth.logout());
    act(() => {
      action?.();
      release();
    });
    await waitFor(() =>
      expect(state.result.current.view.cards[0]?.isMutating).toBe(false),
    );
    expect(calls).toBe(1);
    expect(state.result.current.view.cards[0]?.mine).toBe(false);
    expect(state.store.getState().toasts.items).toHaveLength(0);
  });
});
