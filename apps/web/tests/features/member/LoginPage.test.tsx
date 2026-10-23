import { http, HttpResponse } from 'msw';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { LoginRoute } from '../../../src/chrome/LoginRoute.js';
import type { GraphqlRequestBody } from '../../../src/chrome/featureModule.js';
import { server } from '../../../src/mocks/server.js';
import adminMe from '../../fixtures/wire/me/admin-good.json';
import { fireEvent, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
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
        vi.spyOn(Object.getPrototypeOf(sessionStorage), 'setItem').mockImplementation(
          () => {
            throw new Error('storage unavailable');
          },
        );
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

  it('sends a signed-in member to /me instead of showing a second account hub', async () => {
    seedToken();
    server.use(
      http.post(GRAPHQL_PATH, async ({ request }) => {
        const body = (await request.json()) as GraphqlRequestBody;
        const q = body.query ?? '';
        if (/\bquery\s+MemberMe\b/.test(q)) {
          return HttpResponse.json({ data: { memberMe: adminMe } });
        }
        return HttpResponse.json({ data: {} });
      }),
    );
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/me" element={<p>my hub</p>} />
      </Routes>,
      { route: '/login' },
    );
    expect(await screen.findByText('my hub')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue with Discord' })).toBeNull();
  });
});
