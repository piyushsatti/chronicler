import { graphql, http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { QuestDetailPage } from '../../../src/features/quest/pages/QuestDetailPage.js';
import { server } from '../../../src/mocks/server.js';
import detailGood from '../../fixtures/wire/quest/detail-good.json';
import { renderWithProviders } from '../../test-utils.js';

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

describe('QuestDetailPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders summary, roster, and terminal Discord status without gating the page', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/quests/:code" element={<QuestDetailPage />} />
      </Routes>,
      { route: '/quests/Q-101' },
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Siege of Kraghold' })).toBeInTheDocument();
    expect(screen.getByText('Q-101')).toBeInTheDocument();
    expect(screen.getByText('Discord · applied')).toBeInTheDocument();
    expect(document.querySelector('[data-el="quest.discordDelivery"]')).toHaveAttribute(
      'data-terminal',
      '1',
    );
    expect(screen.getByText('Sign in to claim a seat at this table.')).toBeInTheDocument();
    expect(document.querySelector('[data-page-region="summary"]')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Roster' })).toBeInTheDocument();
    expect(screen.getByText('Lyra Storm')).toBeInTheDocument();
  });

  it('surfaces pending Discord as async status while keeping signup available', async () => {
    seedToken();
    server.use(
      graphql.query('Quest', () =>
        HttpResponse.json({
          data: {
            quest: {
              ...detailGood,
              discordDelivery: {
                ...detailGood.discordDelivery,
                desiredRevision: 4,
                appliedRevision: 2,
                overallStatus: 'pending',
              },
            },
          },
        }),
      ),
    );
    renderWithProviders(
      <Routes>
        <Route path="/quests/:code" element={<QuestDetailPage />} />
      </Routes>,
      { route: '/quests/Q-101' },
    );
    expect(await screen.findByText(/Discord syncing · pending/)).toBeInTheDocument();
    const delivery = document.querySelector('[data-el="quest.discordDelivery"]');
    expect(delivery).toHaveAttribute('data-terminal', '0');
    expect(delivery).toHaveAttribute('role', 'status');
    expect(await screen.findByRole('button', { name: 'Sign up' })).toBeEnabled();
  });

  it('shows signup empty-state when authenticated with no characters', async () => {
    seedToken();
    server.use(
      graphql.query('MyCharacters', () =>
        HttpResponse.json({ data: { myCharacters: { items: [], total: 0 } } }),
      ),
    );
    renderWithProviders(
      <Routes>
        <Route path="/quests/:code" element={<QuestDetailPage />} />
      </Routes>,
      { route: '/quests/Q-101' },
    );
    expect(
      await screen.findByText('Create a character before you can sign up.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Your characters' })).toHaveAttribute(
      'href',
      '/characters',
    );
    expect(screen.queryByRole('button', { name: 'Sign up' })).not.toBeInTheDocument();
  });

  it('shows transition empty-state when the table cannot change status', async () => {
    seedToken();
    server.use(
      graphql.query('Quest', () =>
        HttpResponse.json({
          data: {
            quest: {
              ...detailGood,
              status: 'played',
              displayStatus: 'closed',
            },
          },
        }),
      ),
    );
    renderWithProviders(
      <Routes>
        <Route path="/quests/:code" element={<QuestDetailPage />} />
      </Routes>,
      { route: '/quests/Q-101' },
    );
    expect(await screen.findByText('No status changes on this table.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark played' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('keeps an empty roster as a controlled empty panel', async () => {
    server.use(
      graphql.query('Quest', () =>
        HttpResponse.json({
          data: {
            quest: {
              ...detailGood,
              participants: [],
              filledCount: 0,
            },
          },
        }),
      ),
    );
    renderWithProviders(
      <Routes>
        <Route path="/quests/:code" element={<QuestDetailPage />} />
      </Routes>,
      { route: '/quests/Q-101' },
    );
    await screen.findByRole('heading', { level: 1, name: 'Siege of Kraghold' });
    expect(within(screen.getByRole('tabpanel')).getByText('No participants yet.')).toBeInTheDocument();
  });

  it('shows controlled error', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          errors: [{ message: 'boom', extensions: { code: 'INTERNAL' } }],
        }),
      ),
    );
    renderWithProviders(
      <Routes>
        <Route path="/quests/:code" element={<QuestDetailPage />} />
      </Routes>,
      { route: '/quests/Q-101' },
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });
});
