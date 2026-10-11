import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@pi/react-imposition/styles.css';
import { App } from './App.js';
import { AppProviders } from './providers.js';
import './styles/index.css';

async function enableMocking(): Promise<void> {
  if (import.meta.env.VITE_API_MODE !== 'mock') return;
  const { worker } = await import('./mocks/browser.js');
  await worker.start({ onUnhandledRequest: 'bypass' });
}

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing #root');
}

void enableMocking()
  .catch((err: unknown) => {
    console.error('MSW worker failed to start; continuing without mocks', err);
  })
  .then(() => {
    createRoot(root).render(
      <StrictMode>
        <AppProviders>
          <App />
        </AppProviders>
      </StrictMode>,
    );
  });
