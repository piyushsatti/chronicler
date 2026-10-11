import { http, HttpResponse } from 'msw';
import { rest } from '../../../src/api/endpoints.js';
import { LoginRoute } from '../../../src/chrome/LoginRoute.js';
import { server } from '../../../src/mocks/server.js';
import adminMe from '../../fixtures/wire/me/admin-good.json';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '../../../src/features/member/pages/LoginPage.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { OAUTH_STATE_KEY } from '../../../src/auth/oauthState.js';
import { renderWithProviders } from '../../test-utils.js';

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('LoginPage initiation failures', () => {
  it.each(['crypto', 'storage'])(
    'shows one controlled error for unavailable %s',
    async (failure) => {
      if (failure === 'crypto') {
        vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(() => {
          throw new Error('crypto unavailable');
        });
      } else {
        vi.spyOn(Object.getPrototypeOf(sessionStorage), 'setItem').mockImplementation(() => {
          throw new Error('storage unavailable');
        });
      }
      renderWithProviders(<LoginPage />);
      fireEvent.click(screen.getByRole('button', { name: 'Continue with Discord' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Sign-in could not start in this browser. Please try again.',
      );
      expect(screen.getAllByRole('alert')).toHaveLength(1);
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(sessionStorage.getItem(OAUTH_STATE_KEY)).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Continue with Discord' }),
      ).toBeEnabled();
    },
  );
});

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

describe('LoginRoute', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows Discord continue when signed out', () => {
    renderWithProviders(<LoginRoute />);
    expect(
      screen.getByRole('button', { name: 'Continue with Discord' }),
    ).toBeInTheDocument();
  });

  it('shows account links and notifications when signed in as admin', async () => {
    seedToken();
    server.use(
      http.get(rest.membersMe, () => HttpResponse.json(adminMe)),
    );
    renderWithProviders(<LoginRoute />);
    expect(
      await screen.findByRole('link', { name: 'Admin' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Verification' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Search' })).toBeInTheDocument();
    expect(await screen.findByText(/Unread: 2/)).toBeInTheDocument();
    expect(await screen.findByText('Quest signup')).toBeInTheDocument();
  });
});
