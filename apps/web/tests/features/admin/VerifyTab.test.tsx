import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../../../src/App.js';
import { destinationsForAuth } from '../../../src/chrome/destinations.js';
import { renderWithProviders } from '../../test-utils.js';
import { signIn } from './authority-test-utils.js';

const PRIMARY = [
  'Home',
  'Quests',
  'Chronicles',
  'Codex',
  'Map',
  'Rules',
  'Community',
];

describe('Verify tab', () => {
  it('lists Verify only for the verifier role', () => {
    expect(
      destinationsForAuth({
        isAuthenticated: true,
        isAdmin: false,
        isVerifier: true,
      }).map((destination) => destination.label),
    ).toEqual([...PRIMARY, 'Verify']);
    expect(
      destinationsForAuth({ isAuthenticated: true, isAdmin: true }).map(
        (destination) => destination.label,
      ),
    ).not.toContain('Verify');
    expect(
      destinationsForAuth({ isAuthenticated: true, isAdmin: false, isDm: true }).map(
        (destination) => destination.label,
      ),
    ).not.toContain('Verify');
    expect(
      destinationsForAuth({
        isAuthenticated: true,
        isAdmin: true,
        isDm: true,
        isVerifier: true,
      }).map((destination) => destination.label),
    ).toEqual([...PRIMARY, 'DM', 'Verify', 'Admin']);
  });

  it('shows the review queue and no other admin section', async () => {
    signIn(['verifier']);
    renderWithProviders(<App />, { route: '/verify' });
    expect(await screen.findByRole('link', { name: 'Verify' })).toHaveAttribute(
      'href',
      '/verify',
    );
    expect(await screen.findByRole('heading', { name: 'Verify' })).toBeVisible();
    expect(await screen.findByText('Pending Hero')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^DM profiles/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Admin sections' }),
    ).not.toBeInTheDocument();
    for (const label of ['Today', 'People', 'Review', 'World', 'Delivery']) {
      expect(screen.queryByRole('link', { name: label })).not.toBeInTheDocument();
    }
  });

  it.each(['admin', 'player', 'dm'] as const)(
    'hides the tab and refuses a direct visit from %s',
    async (role) => {
      signIn([role]);
      renderWithProviders(<App />, { route: '/verify' });
      expect(await screen.findByRole('heading', { name: 'Verify', level: 1 })).toBeVisible();
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Only verifiers can open this page.',
      );
      expect(screen.queryByRole('link', { name: 'Verify' })).not.toBeInTheDocument();
      expect(screen.queryByText('Pending Hero')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('navigation', { name: 'Admin sections' }),
      ).not.toBeInTheDocument();
      if (role === 'admin') {
        expect(await screen.findByRole('link', { name: 'Admin' })).toHaveAttribute(
          'href',
          '/admin',
        );
      } else {
        expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
      }
    },
  );
});
