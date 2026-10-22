import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Provider as ReduxProvider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from '../../../src/auth/AuthContext.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { createTestQueryClient } from '../../../src/providers.js';
import { ThemeProvider } from '../../../src/context/ThemeContext.js';
import { createAppStore } from '../../../src/store/store.js';

export function seedEditorSession(): void {
  const payload = btoa(
    JSON.stringify({
      member_id: 'discord-editor',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  localStorage.setItem(TOKEN_KEY, `${btoa('{}')}.${payload}.test`);
}

export function editorHarness(route = '/quests/Q-1/edit', path = '/quests/:code/edit') {
  const queryClient = createTestQueryClient();
  const store = createAppStore();
  function wrapper({ children }: { children: ReactNode }) {
    const router = createMemoryRouter(
      [
        {
          path,
          element: (
            <AuthProvider>
              <ThemeProvider>{children}</ThemeProvider>
            </AuthProvider>
          ),
        },
      ],
      { initialEntries: [route] },
    );
    return (
      <ReduxProvider store={store}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ReduxProvider>
    );
  }
  return { wrapper, queryClient, store };
}
