import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../../src/auth/AuthContext.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { createTestQueryClient } from '../../../src/providers.js';

export function seedEditorSession(): void {
  const payload = btoa(
    JSON.stringify({
      sub: 'discord-editor',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  localStorage.setItem(TOKEN_KEY, `${btoa('{}')}.${payload}.test`);
}

export function editorHarness(route = '/quests/Q-1/edit', path = '/quests/:code/edit') {
  const queryClient = createTestQueryClient();
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>
          <AuthProvider>
            <Routes>
              <Route path={path} element={children} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }
  return { wrapper, queryClient };
}
