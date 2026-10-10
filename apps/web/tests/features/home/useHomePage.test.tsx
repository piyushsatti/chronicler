import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { AuthProvider } from '../../../src/auth/AuthContext.js';
import { useHomePage } from '../../../src/features/home/hooks/useHomePage.js';
import { createTestQueryClient } from '../../../src/providers.js';
import { createAppStore } from '../../../src/store/store.js';
import { server } from '../../../src/mocks/server.js';
import lanesBad from '../../fixtures/wire/home/lanes-bad-board.json';

function wrapper({ children }: { children: ReactNode }) {
  const store = createAppStore();
  const queryClient = createTestQueryClient();
  return (
    <ReduxProvider store={store}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthProvider>{children}</AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </ReduxProvider>
  );
}

describe('useHomePage', () => {
  it('surfaces controlled error when lanes wire fails', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          data: {
            questBoard: lanesBad.questBoard,
            quests: lanesBad.quests,
            recentlyClosedQuests: lanesBad.recentlyClosedQuests,
            communityDirectory: lanesBad.communityDirectory,
          },
        }),
      ),
    );
    const { result } = renderHook(() => useHomePage(), { wrapper });
    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    if (result.current.status === 'error') {
      expect(result.current.error.userMessage).toBe(
        'The server returned data this screen cannot use.',
      );
    }
  });

  it('reaches ready with fixture wire', async () => {
    const { result } = renderHook(() => useHomePage(), { wrapper });
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    if (result.current.status === 'ready') {
      expect(result.current.view.recruiting[0]?.title).toBe('Siege of Kraghold');
      expect(result.current.view.dmsAccepting[0]?.handle).toBe('mira');
    }
  });
});
