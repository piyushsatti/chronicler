import { http, HttpResponse } from 'msw';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AUTH_CALLBACK_PATH } from '../../../src/api/endpoints.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { storeIntendedPath } from '../../../src/auth/intendedPath.js';
import { beginOAuthState, OAUTH_STATE_KEY } from '../../../src/auth/oauthState.js';
import * as memberAdapter from '../../../src/features/member/adapters/memberAdapter.js';
import { AuthCallbackPage } from '../../../src/features/member/pages/AuthCallbackPage.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';

function LocationProbe(): React.JSX.Element {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function token(): string {
  return `${btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${btoa(
    JSON.stringify({ sub: 'discord-dev', exp: Math.floor(Date.now() / 1000) + 3600 }),
  )}.dev`;
}

function callbackRoute(query = 'code=oauth-code'): string {
  const state = beginOAuthState();
  expect(state).not.toBeNull();
  return `/auth/callback?${query}&state=${state}`;
}

afterEach(() => vi.restoreAllMocks());

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('stores the exchanged token and consumes a safe intended redirect', async () => {
    let requests = 0;
    let effectSetups = 0;
    let effectCleanups = 0;
    function StrictReplayProbe(): null {
      useEffect(() => {
        effectSetups += 1;
        return () => { effectCleanups += 1; };
      }, []);
      return null;
    }
    const route = callbackRoute();
    const state = new URL(route, 'http://localhost').searchParams.get('state');
    server.use(
      http.post(AUTH_CALLBACK_PATH, async ({ request }) => {
        requests += 1;
        expect(await request.json()).toEqual({ code: 'oauth-code', state });
        return HttpResponse.json({ token: token() });
      }),
    );
    storeIntendedPath('/quests');
    renderWithProviders(
      <>
        <AuthCallbackPage />
        <LocationProbe />
        <StrictReplayProbe />
      </>,
      { route, reactStrictMode: true },
    );

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/quests'),
    );
    expect(localStorage.getItem(TOKEN_KEY)).toMatch(/^.+\..+\..+$/);
    expect(sessionStorage.getItem('chronicler_auth_redirect')).toBeNull();
    expect(sessionStorage.getItem(OAUTH_STATE_KEY)).toBeNull();
    expect(effectSetups).toBeGreaterThanOrEqual(2);
    expect(effectCleanups).toBeGreaterThanOrEqual(1);
    expect(requests).toBe(1);
  });

  it('shows a controlled error when the callback response lacks a token', async () => {
    server.use(http.post(AUTH_CALLBACK_PATH, () => HttpResponse.json({ token: '' })));
    renderWithProviders(<AuthCallbackPage />, {
      route: callbackRoute(),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The server returned data this screen cannot use.',
    );
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('shows a controlled error when the callback code is missing', async () => {
    const exchange = vi.spyOn(memberAdapter, 'exchangeAuthCallback');
    renderWithProviders(<AuthCallbackPage />, { route: callbackRoute('') });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The server returned data this screen cannot use.',
    );
    expect(exchange).not.toHaveBeenCalled();
  });

  it.each(['missing', 'mismatched', 'expired', 'other-tab', 'ambiguous'])(
    'rejects %s state before exchanging or storing a token',
    async (scenario) => {
      let requests = 0;
      server.use(
        http.post(AUTH_CALLBACK_PATH, () => {
          requests++;
          return HttpResponse.json({ token: token() });
        }),
      );
      let route = callbackRoute();
      if (scenario === 'missing') route = '/auth/callback?code=oauth-code';
      if (scenario === 'mismatched')
        route = '/auth/callback?code=oauth-code&state=unrelated';
      if (scenario === 'expired') {
        const state = new URL(route, 'http://localhost').searchParams.get('state');
        sessionStorage.setItem(
          OAUTH_STATE_KEY,
          JSON.stringify({
            state,
            createdAt: Date.now() - 10 * 60 * 1000,
          }),
        );
      }
      if (scenario === 'other-tab') sessionStorage.clear();
      if (scenario === 'ambiguous') route += '&state=duplicate';
      renderWithProviders(<AuthCallbackPage />, { route });
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Sign-in could not be verified. Start again from Sign in.',
      );
      expect(requests).toBe(0);
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    },
  );

  it('rejects a consumed callback on remount without exchanging or replacing the accepted token', async () => {
    const acceptedToken = token();
    const exchange = vi
      .spyOn(memberAdapter, 'exchangeAuthCallback')
      .mockResolvedValue(acceptedToken);
    const route = callbackRoute();
    const { unmount } = renderWithProviders(
      <>
        <AuthCallbackPage />
        <LocationProbe />
      </>,
      { route },
    );
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
    unmount();
    renderWithProviders(<AuthCallbackPage />, { route });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sign-in could not be verified. Start again from Sign in.',
    );
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(TOKEN_KEY)).toBe(acceptedToken);
  });

  it('handles Discord denial without echoing provider details or exchanging a code', async () => {
    const exchange = vi.spyOn(memberAdapter, 'exchangeAuthCallback');
    renderWithProviders(<AuthCallbackPage />, {
      route: callbackRoute(
        'code=ignored&error=access_denied&error_description=untrusted-secret',
      ),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Discord sign-in was cancelled or denied. Try signing in again.',
    );
    expect(screen.queryByText(/untrusted-secret/)).not.toBeInTheDocument();
    expect(exchange).not.toHaveBeenCalled();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('shows a controlled error if storing the exchanged token fails', async () => {
    vi.spyOn(memberAdapter, 'exchangeAuthCallback').mockResolvedValue(token());
    const originalSet = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === TOKEN_KEY) throw new Error('storage unavailable');
      originalSet(key, value);
    });
    renderWithProviders(
      <>
        <AuthCallbackPage />
        <LocationProbe />
      </>,
      { route: callbackRoute() },
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
    expect(screen.getByTestId('location')).toHaveTextContent('/auth/callback');
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('does not store a late exchange after the callback unmounts', async () => {
    let finish!: (token: string) => void;
    const pending = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const exchange = vi
      .spyOn(memberAdapter, 'exchangeAuthCallback')
      .mockReturnValue(pending);
    const { unmount } = renderWithProviders(<AuthCallbackPage />, {
      route: callbackRoute(),
    });
    await waitFor(() => expect(exchange).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => {
      finish(token());
      await pending;
    });
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('does not let an old exchange store a token after the callback query changes', async () => {
    let finish!: (token: string) => void;
    const pending = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const exchange = vi
      .spyOn(memberAdapter, 'exchangeAuthCallback')
      .mockReturnValue(pending);
    function ChangeCallback() {
      const navigate = useNavigate();
      return (
        <button onClick={() => navigate('/auth/callback?code=other&state=unrelated')}>
          Change callback
        </button>
      );
    }
    renderWithProviders(
      <>
        <AuthCallbackPage />
        <ChangeCallback />
        <LocationProbe />
      </>,
      { route: callbackRoute() },
    );
    await waitFor(() => expect(exchange).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Change callback' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sign-in could not be verified.',
    );
    await act(async () => {
      finish(token());
      await pending;
    });
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('location')).toHaveTextContent('/auth/callback');
  });

  it('falls back to Home when the intended redirect is external', async () => {
    vi.spyOn(memberAdapter, 'exchangeAuthCallback').mockResolvedValue(token());
    sessionStorage.setItem(
      'chronicler_auth_redirect',
      JSON.stringify({
        path: 'https://other.example/redirect',
        storedAt: Date.now(),
      }),
    );
    renderWithProviders(
      <>
        <AuthCallbackPage />
        <LocationProbe />
      </>,
      { route: callbackRoute() },
    );
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
    expect(localStorage.getItem(TOKEN_KEY)).not.toBeNull();
  });
});
