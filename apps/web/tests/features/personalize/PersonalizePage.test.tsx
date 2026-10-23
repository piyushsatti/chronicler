import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { SettingsPage } from '../../../src/features/onboarding/pages/SettingsPage.js';
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
      await screen.findByRole('heading', { level: 1, name: 'Personalize' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /^Theme/ })).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: 'Color mode' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Theme/ }));
    expect(await screen.findByRole('menuitem', { name: 'Parchment' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: /^Background effect/ }));
    expect(await screen.findByRole('menuitem', { name: 'Starfield' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'starfield-twinkle' })).toBeNull();
  });

  it('groups settings without a browser fieldset and uses checkbox primitives', async () => {
    renderWithProviders(<SettingsPage />, { route: '/settings' });
    await screen.findByRole('checkbox', { name: 'Quest signups' });
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
