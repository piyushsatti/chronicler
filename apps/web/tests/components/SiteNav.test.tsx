import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { App } from '../../src/App.js';
import { renderWithProviders } from '../test-utils.js';

const LIVE_LINKS = ['Home', 'Quests', 'Chronicles', 'Codex', 'Rules', 'Community'];

describe('SiteChrome', () => {
  it('renders the six live destinations, with search and log in outside that list', () => {
    renderWithProviders(<App />);
    const nav = screen
      .getAllByRole('navigation', { name: 'Primary' })
      .find((element) => element.hasAttribute('data-site-links'));
    expect(nav).toBeTruthy();
    expect(nav).toHaveAttribute('data-site-links');
    for (const name of LIVE_LINKS) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole('link', { name: 'Characters' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Map' })).not.toBeInTheDocument();
    expect(nav?.querySelectorAll('[data-nav-item]')).toHaveLength(6);
    expect(nav?.querySelector('[aria-label="Search the chronicle"]')).toBeNull();
    expect(nav?.querySelector('[href="/login"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Search the chronicle' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
    expect(document.querySelector('[data-shell-nav]')?.querySelectorAll('[data-nav-item]')).toHaveLength(0);
  });
});
