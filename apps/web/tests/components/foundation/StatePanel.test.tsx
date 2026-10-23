import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { StatePanel } from '../../../src/components/foundation/StatePanel.js';
import {
  ViewerAudienceContext,
  type ViewerAudience,
} from '../../../src/components/foundation/viewerAudience.js';
import { toAppError } from '../../../src/errors/toAppError.js';
import { TransportError } from '../../../src/errors/types.js';
import { AUTH_REDIRECT_KEY } from '../../../src/auth/intendedPath.js';
import { renderWithProviders } from '../../test-utils.js';

const forbidden = toAppError(new TransportError('FORBIDDEN', { status: 403 }), 'test');

function renderAs(audience: ViewerAudience, ui: React.ReactElement) {
  const rememberReturn = vi.fn();
  render(
    <MemoryRouter>
      <ViewerAudienceContext.Provider value={{ audience, rememberReturn }}>
        {ui}
      </ViewerAudienceContext.Provider>
    </MemoryRouter>,
  );
  return { rememberReturn };
}

describe('StatePanel denial', () => {
  it('asks a guest to sign in and remembers where they were', async () => {
    const { rememberReturn } = renderAs(
      'guest',
      <StatePanel status="error" error={forbidden} />,
    );
    const alert = screen.getByRole('alert');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Sign in to see this' }),
    ).toBeVisible();
    expect(alert).toHaveTextContent('Sign in with Discord to continue.');
    expect(alert).not.toHaveTextContent('Permissions may have changed');
    const signIn = screen.getByRole('link', { name: 'Sign in' });
    expect(signIn).toHaveAttribute('href', '/login');
    await userEvent.click(signIn);
    expect(rememberReturn).toHaveBeenCalledOnce();
  });

  it('tells a member they lack access and offers a way back and a reload, not sign-in', async () => {
    const reload = vi.fn();
    renderAs(
      'member',
      <StatePanel status="error" error={forbidden} onRetry={reload} />,
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'You don’t have access to this' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.queryByRole('link', { name: 'Sign in again' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reload account' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('lets the page name the member denial and its one way back', () => {
    renderAs(
      'member',
      <StatePanel
        status="denied"
        title="Staff only"
        action={<a href="/codex">Back to Codex</a>}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Staff only' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to Codex' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Back to home' })).not.toBeInTheDocument();
  });

  it('keeps the sign-in heading for guests even when the page names the denial', () => {
    renderAs('guest', <StatePanel status="denied" title="Staff only" />);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Sign in to see this' }),
    ).toBeVisible();
  });

  it('uses the caller’s explanation for members on an explicit denial', () => {
    renderAs(
      'member',
      <StatePanel
        status="denied"
        deniedMessage="This design surface requires staff access."
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This design surface requires staff access.',
    );
  });

  it('keeps plain error copy for failures that are not denials', () => {
    renderAs(
      'guest',
      <StatePanel
        status="error"
        error={toAppError(new TransportError('NETWORK'), 'test')}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the server.');
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('reads the audience from the auth provider', async () => {
    sessionStorage.removeItem(AUTH_REDIRECT_KEY);
    renderWithProviders(<StatePanel status="error" error={forbidden} />, {
      route: '/chronicles/private',
    });
    await userEvent.click(await screen.findByRole('link', { name: 'Sign in' }));
    expect(sessionStorage.getItem(AUTH_REDIRECT_KEY)).not.toBeNull();
  });
});

describe('StatePanel page states', () => {
  it('shows an empty state as one parchment card with a heading, a sentence and one action', () => {
    renderAs(
      'member',
      <StatePanel
        status="empty"
        title="No sign-ups yet"
        emptyMessage="You haven't signed up for a quest."
        action={<a href="/quests">Find a quest</a>}
      />,
    );
    const heading = screen.getByRole('heading', { level: 2, name: 'No sign-ups yet' });
    const panel = heading.closest('section');
    expect(panel).toHaveClass('card', 'state-panel');
    expect(panel).toHaveAttribute('data-state', 'empty');
    expect(panel).toHaveTextContent("You haven't signed up for a quest.");
    expect(screen.getByRole('link', { name: 'Find a quest' })).toBeVisible();
  });

  it('offers a retry on a page error', async () => {
    const retry = vi.fn();
    renderAs(
      'member',
      <StatePanel
        status="error"
        title="DM table not found"
        error={toAppError(new TransportError('NETWORK'), 'test')}
        onRetry={retry}
      />,
    );
    expect(screen.getByRole('heading', { name: 'DM table not found' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe('StatePanel inline variant', () => {
  it('keeps a sub-panel denial to one line and one action', async () => {
    const reload = vi.fn();
    renderAs(
      'member',
      <StatePanel variant="inline" status="error" error={forbidden} onRetry={reload} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You don’t have access to this.',
    );
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Back to home' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Reload account' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('asks a guest to sign in from a sub-panel', () => {
    renderAs('guest', <StatePanel variant="inline" status="error" error={forbidden} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Sign in to see this.');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('shows the error copy with a retry for other failures', async () => {
    const retry = vi.fn();
    renderAs(
      'member',
      <StatePanel
        variant="inline"
        status="error"
        error={toAppError(new TransportError('NETWORK'), 'test')}
        onRetry={retry}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the server.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('renders loading as a single caption line', () => {
    renderAs('member', <StatePanel variant="inline" status="loading" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });
});
