import { beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { NotificationsPage } from '../../../src/features/notifications/pages/NotificationsPage.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';

function seedToken(): void {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({
      sub: 'discord-dev',
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    }),
  );
  localStorage.setItem(TOKEN_KEY, `${header}.${payload}.dev`);
}

describe('NotificationsPage', () => {
  beforeEach(() => {
    localStorage.clear();
    seedToken();
  });

  it('renders inbox heading and notification rows', async () => {
    renderWithProviders(<NotificationsPage />, { route: '/notifications' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Notifications' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Quest signup')).toBeInTheDocument();
    expect(screen.getByText('Seat confirmed')).toBeInTheDocument();
  });

  it('shows controlled error on GraphQL failure', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          errors: [{ message: 'boom', extensions: { code: 'INTERNAL' } }],
        }),
      ),
    );
    renderWithProviders(<NotificationsPage />, { route: '/notifications' });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });

  it('does not import adapters from the page module', () => {
    const text = readFileSync(
      join(process.cwd(), 'src/features/notifications/pages/NotificationsPage.tsx'),
      'utf8',
    );
    expect(text).not.toMatch(/adapters\//);
  });
});
