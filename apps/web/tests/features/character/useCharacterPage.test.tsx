import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { AuthProvider } from '../../../src/auth/AuthContext.js';
import { useCharacterPage } from '../../../src/features/character/hooks/useCharacterPage.js';
import { createTestQueryClient } from '../../../src/providers.js';
import { createAppStore } from '../../../src/store/store.js';
import { server } from '../../../src/mocks/server.js';

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

describe('useCharacterPage', () => {
  it('surfaces AppError when character wire fails', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          errors: [{ message: 'boom', extensions: { code: 'INTERNAL' } }],
        }),
      ),
    );
    const { result } = renderHook(() => useCharacterPage('C-101'), { wrapper });
    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    if (result.current.status === 'error') {
      expect(result.current.error.userMessage).toBe(
        'Something went wrong. Please try again.',
      );
    }
  });

  it('maps missing character to empty', async () => {
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const body = (await request.json()) as { query?: string };
        const name = body.query?.match(/\b(query|mutation)\s+(\w+)/)?.[2];
        if (name === 'Character') {
          return HttpResponse.json({ data: { character: null } });
        }
        return HttpResponse.json({
          errors: [{ message: 'Unhandled', extensions: { code: 'UNHANDLED' } }],
        });
      }),
    );
    const { result } = renderHook(() => useCharacterPage('C-404'), { wrapper });
    await waitFor(() => {
      expect(result.current.status).toBe('empty');
    });
  });
});
