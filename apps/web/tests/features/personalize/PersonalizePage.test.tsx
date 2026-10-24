import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { graphql, http, HttpResponse } from 'msw';
import { screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { SettingsPage, SettingsRedirectPage } from '../../../src/features/onboarding/pages/SettingsPage.js';
import { PersonalizePage } from '../../../src/features/personalize/pages/PersonalizePage.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';

function seedToken(): void {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({
      member_id: 'discord-dev',
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
      await screen.findByRole('heading', { level: 2, name: 'Personalize' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Wren Ashdown/ })).toBeNull();
    expect(await screen.findByRole('button', { name: /^Theme/ })).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: 'Color mode' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Theme/ }));
    expect(await screen.findByRole('menuitem', { name: 'Parchment' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: /^Background effect/ }));
    expect(await screen.findByRole('menuitem', { name: 'Starfield' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'starfield-twinkle' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign up' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Details' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Button style samples' })).toBeVisible();
  });

  it('previews the first owned character as a real link with its status and initials', async () => {
    server.use(graphql.query('MemberRoster', () => HttpResponse.json({ data: {
      myCharacters: { total: 1, items: [{
        id: 'character-1', shortCode: 'C-WREN', name: 'Wren Ashdown', status: 'active', imageUrl: null, ddbMirror: null,
      }] },
    } })));
    renderWithProviders(<PersonalizePage />, { route: '/me/personalize' });
    const character = await screen.findByRole('link', { name: /Wren Ashdown/ });
    expect(character).toHaveAttribute('href', '/characters/C-WREN');
    expect(character).toHaveTextContent('Approved');
    expect(character.querySelector('[data-component="Avatar"]')).toHaveTextContent('WA');
  });

  it('groups settings without a browser fieldset and uses checkbox primitives', async () => {
    renderWithProviders(<SettingsPage />, { route: '/me/settings' });
    await screen.findByRole('checkbox', { name: 'Quest signups' });
    expect(screen.getAllByRole('button', { name: 'Save settings' })).toHaveLength(1);
    const index = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(index).toBeVisible();
    const destinations = within(index).getAllByRole('link');
    expect(destinations.map((link) => link.textContent)).toEqual([
      'Dates and times', 'Accessibility', 'Notifications',
    ]);
    for (const link of destinations) {
      expect(document.querySelector(link.getAttribute('href') ?? '')).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: /^Theme/ })).toBeNull();
    for (const group of screen.getAllByRole('group')) {
      expect(group).toHaveClass('field-group');
    }
    const box = screen.getByRole('checkbox', { name: 'Quest signups' });
    expect(box).toHaveClass('checkbox__box');
    expect(
      document.querySelector('input[type="checkbox"]:not([aria-hidden="true"])'),
    ).toBeNull();
  });


  it.each([
    ['overview', 'Overview target'],
    ['characters', 'Characters target'],
    ['notes', 'Notes target'],
    ['personalize', 'Personalize target'],
    ['settings', 'Settings target'],
    ['unknown', 'Settings target'],
  ])('redirects /settings?tab=%s to its matching account route', async (tab, target) => {
    renderWithProviders(
      <Routes>
        <Route path="/settings" element={<SettingsRedirectPage />} />
        <Route path="/me" element={<div>Overview target</div>} />
        <Route path="/me/characters" element={<div>Characters target</div>} />
        <Route path="/me/notes" element={<div>Notes target</div>} />
        <Route path="/me/personalize" element={<div>Personalize target</div>} />
        <Route path="/me/settings" element={<div>Settings target</div>} />
      </Routes>,
      { route: `/settings?tab=${tab}` },
    );
    expect(await screen.findByText(target)).toBeVisible();
  });

  it('redirects plain /settings to the account settings tab', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/settings" element={<SettingsRedirectPage />} />
        <Route path="/me/settings" element={<div>Settings target</div>} />
      </Routes>,
      { route: '/settings' },
    );
    expect(await screen.findByText('Settings target')).toBeVisible();
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
