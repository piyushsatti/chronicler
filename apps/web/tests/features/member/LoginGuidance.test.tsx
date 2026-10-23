import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProtectedRoute } from '../../../src/auth/ProtectedRoute.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { LoginPage } from '../../../src/features/member/pages/LoginPage.js';
import { WelcomePage } from '../../../src/features/onboarding/pages/WelcomePage.js';
import { renderWithProviders } from '../../test-utils.js';

function seedToken(): void {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({ sub: 'discord-dev', exp: Math.floor(Date.now() / 1000) + 3600 }),
  );
  localStorage.setItem(TOKEN_KEY, `${header}.${payload}.dev`);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('sign-in guidance', () => {
  it('tells a guest sent from a members-only page why, with a primary Discord button', async () => {
    renderWithProviders(
      <Routes>
        <Route
          path="/codex/new"
          element={
            <ProtectedRoute>
              <p>editor</p>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<LoginPage />} />
      </Routes>,
      { route: '/codex/new' },
    );
    expect(
      await screen.findByText(/Sign in to continue\. You’ll come back to the page/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Discord' })).toHaveClass(
      'btn--primary',
    );
    expect(screen.getByRole('link', { name: 'Browse as guest' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('does not claim a redirect when the guest opened sign-in directly', () => {
    renderWithProviders(<LoginPage />, { route: '/login' });
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.queryByText(/Sign in to continue/)).toBeNull();
  });

  it('welcomes a signed-in member back instead of asking them to sign in', () => {
    seedToken();
    renderWithProviders(<WelcomePage />, { route: '/welcome' });
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Continue with Discord' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Find a quest' })).toHaveAttribute(
      'href',
      '/quests',
    );
  });
});
