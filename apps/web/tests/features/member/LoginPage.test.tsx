import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { rest } from '../../../src/api/endpoints.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { LoginPage } from '../../../src/features/member/pages/LoginPage.js';
import { server } from '../../../src/mocks/server.js';
import adminMe from '../../fixtures/wire/me/admin-good.json';
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

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows Discord continue when signed out', () => {
    renderWithProviders(<LoginPage />);
    expect(
      screen.getByRole('button', { name: 'Continue with Discord' }),
    ).toBeInTheDocument();
  });

  it('shows account links and notifications when signed in as admin', async () => {
    seedToken();
    server.use(
      http.get(rest.membersMe, () => HttpResponse.json(adminMe)),
    );
    renderWithProviders(<LoginPage />);
    expect(
      await screen.findByRole('link', { name: 'Admin' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Verification' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Search' })).toBeInTheDocument();
    expect(await screen.findByText(/Unread: 2/)).toBeInTheDocument();
    expect(await screen.findByText('Quest signup')).toBeInTheDocument();
  });
});
