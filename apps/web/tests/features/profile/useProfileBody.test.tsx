import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { AuthProvider } from '../../../src/auth/AuthContext.js';
import { useProfileBody } from '../../../src/features/profile/hooks/useProfileBody.js';
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

describe('useProfileBody', () => {
  it('surfaces AppError when memberProfile wire fails', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          errors: [{ message: 'boom', extensions: { code: 'INTERNAL' } }],
        }),
      ),
    );
    const { result } = renderHook(() => useProfileBody('mira'), {
      wrapper,
    });
    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    if (result.current.status === 'error') {
      expect(result.current.error.userMessage).toBe(
        'Something went wrong. Please try again.',
      );
    }
  });

  it('reaches ready for a known dm handle', async () => {
    const { result } = renderHook(() => useProfileBody('@mira'), {
      wrapper,
    });
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    if (result.current.status === 'ready') {
      expect(result.current.member.handle).toBe('mira');
      expect(result.current.member.acceptingPlayers).toBe(true);
    }
  });
});
