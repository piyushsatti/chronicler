import { beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { AuthProvider } from '../../../src/auth/AuthContext.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { toAppError } from '../../../src/errors/toAppError.js';
import { usePersonalizePage } from '../../../src/features/personalize/hooks/usePersonalizePage.js';
import { createTestQueryClient } from '../../../src/providers.js';
import { createAppStore } from '../../../src/store/store.js';
import { server } from '../../../src/mocks/server.js';

function seedToken(): void {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({
      member_id: 'discord-dev',
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    }),
  );
  localStorage.setItem(TOKEN_KEY, `${header}.${payload}.dev`);
}

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

describe('usePersonalizePage', () => {
  beforeEach(() => {
    localStorage.clear();
    seedToken();
  });

  it('surfaces AppError when personalization wire fails', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          errors: [{ message: 'boom', extensions: { code: 'INTERNAL' } }],
        }),
      ),
    );
    const { result } = renderHook(() => usePersonalizePage(), { wrapper });
    await waitFor(() => {
      expect(result.current.personalization.isError).toBe(true);
    });
    expect(
      toAppError(result.current.personalization.error, 'personalize:page').userMessage,
    ).toBe('Something went wrong. Please try again.');
  });
});
