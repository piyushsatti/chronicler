import { beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { PersonalizePage } from '../../../src/features/personalize/pages/PersonalizePage.js';
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

describe('PersonalizePage', () => {
  beforeEach(() => {
    localStorage.clear();
    seedToken();
  });

  it('renders personalize heading and look controls', async () => {
    renderWithProviders(<PersonalizePage />, { route: '/me/personalize' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Personalize' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Theme' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Color mode' })).toBeInTheDocument();
    expect(
      await screen.findByText(/Saved settings · parchment/),
    ).toBeInTheDocument();
  });

  it('shows controlled error on GraphQL failure', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          errors: [{ message: 'boom', extensions: { code: 'INTERNAL' } }],
        }),
      ),
    );
    renderWithProviders(<PersonalizePage />, { route: '/me/personalize' });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });

  it('does not import adapters from the page module', () => {
    const text = readFileSync(
      join(process.cwd(), 'src/features/personalize/pages/PersonalizePage.tsx'),
      'utf8',
    );
    expect(text).not.toMatch(/adapters\//);
  });
});
