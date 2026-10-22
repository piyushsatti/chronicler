import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Provider as ReduxProvider } from 'react-redux';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.js';
import { ThemeProvider } from './context/ThemeContext.js';
import { createAppStore } from './store/store.js';

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

const AppContent = createContext<ReactNode>(null);
function RoutedContent(): ReactNode {
  return useContext(AppContent);
}

export function AppProviders({ children }: { children: ReactNode }): React.JSX.Element {
  const [store] = useState(() => createAppStore());
  const [queryClient] = useState(() => createTestQueryClient());
  const [router, setRouter] = useState<ReturnType<typeof createBrowserRouter> | null>(
    null,
  );
  useEffect(() => {
    const next = createBrowserRouter([
      {
        path: '*',
        element: (
          <AuthProvider>
            <ThemeProvider>
              <RoutedContent />
            </ThemeProvider>
          </AuthProvider>
        ),
      },
    ]);
    setRouter(next);
    return () => next.dispose();
  }, []);
  return (
    <ReduxProvider store={store}>
      <QueryClientProvider client={queryClient}>
        <AppContent.Provider value={children}>
          {router ? <RouterProvider router={router} /> : null}
        </AppContent.Provider>
      </QueryClientProvider>
    </ReduxProvider>
  );
}
