import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MePage } from '../../../src/features/member/pages/MePage.js';
import { signIn } from '../admin/authority-test-utils.js';
import { renderWithProviders } from '../../test-utils.js';

describe('MePage', () => {
  it('uses the profile layout: identity header, account cards and a session card', async () => {
    signIn(['player', 'dm']);
    renderWithProviders(<MePage />, { route: '/me' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ashwin' }),
    ).toBeVisible();
    expect(screen.getByText('@ashwin')).toBeVisible();
    expect(screen.getByText('Player and DM')).toBeVisible();
    const nav = screen.getByRole('navigation', { name: 'Your account' });
    expect(nav.querySelectorAll('a')).toHaveLength(3);
    expect(screen.getByRole('link', { name: /My profile/ })).toHaveAttribute(
      'href',
      '/dms/@ashwin',
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Session' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });
});
