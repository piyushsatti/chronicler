import { QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { Provider as ReduxProvider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../src/auth/AuthContext.js';
import { createTestQueryClient } from '../src/providers.js';
import { createAppStore } from '../src/store/store.js';

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> & { route?: string },
) {
  const store = createAppStore();
  const queryClient = createTestQueryClient();
  const route = options?.route ?? '/';

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ReduxProvider store={store}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[route]}>
            <AuthProvider>{children}</AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </ReduxProvider>
    );
  }

  return {
    store,
    queryClient,
    ...render(ui, { wrapper: Wrapper, ...options }),
  };
}
