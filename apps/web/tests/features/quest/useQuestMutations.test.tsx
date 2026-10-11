import { act, renderHook } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { queryKeys } from '../../../src/api/queryKeys.js';
import { createTestQueryClient } from '../../../src/providers.js';
import { useQuestMutations } from '../../../src/features/quest/hooks/useQuestMutations.js';

const questID = '00000000-0000-4000-8000-000000000001';
const characterID = '00000000-0000-4000-8000-000000000002';

describe('quest membership mutation invalidation', () => {
  it.each(['signup', 'transition', 'close'] as const)('invalidates every generic list variant after %s', async (mutation) => {
    const client = createTestQueryClient();
    const invalidatedKeys = [
      queryKeys.quest('Q-1'),
      queryKeys.questBoard,
      queryKeys.questList({}, 50, 0),
      queryKeys.questList({ status: 'open' }, 100, 0),
      queryKeys.questList({ displayStatus: 'scheduled' }, 50, 0),
      queryKeys.questList({ displayStatus: 'live' }, 50, 50),
    ];
    for (const key of [...invalidatedKeys, queryKeys.home]) client.setQueryData(key, []);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, unmount } = renderHook(() => useQuestMutations('Q-1', questID), { wrapper });
    await act(async () => {
      if (mutation === 'signup') await result.current.signup.mutateAsync(characterID);
      else if (mutation === 'transition') await result.current.transition.mutateAsync('played');
      else await result.current.close.mutateAsync();
    });
    for (const key of invalidatedKeys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKeys.home)?.isInvalidated).toBe(false);
    unmount();
    client.clear();
  });
});
