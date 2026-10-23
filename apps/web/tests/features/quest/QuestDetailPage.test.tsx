import { graphql, http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('renders summary and roster for a guest without operator delivery status', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/quests/:code" element={<QuestDetailPage />} />
      </Routes>,
      { route: '/quests/Q-101' },
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Siege of Kraghold' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Q-101')).not.toBeInTheDocument();
    // Discord delivery sync is an operator signal, hidden from guests and players.
    expect(screen.queryByText(/Discord/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Sign in to join this quest' }),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-page-region="summary"]')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Roster' })).toBeInTheDocument();
    expect(screen.getByText('Lyra Storm')).toBeInTheDocument();
    expect(screen.getByText(/Played by/)).toHaveTextContent(
      'Played by Member (@player1)',
    );
  });

  it('disambiguates the quest DM and roster owners as one visible group', async () => {
    server.use(
      graphql.query('Quest', () =>
        HttpResponse.json({
          data: {
            quest: {
              ...detailGood,
              dm: { handle: 'gm', displayName: 'Mira' },
              participants: [
                {
                  memberId: '11111111-1111-4111-8111-111111111111',
                  characterId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                  characterName: 'Lyra Storm',
                  memberHandle: 'player1',
                  memberDisplayName: 'Mira',
                  status: 'signed_up',
                },
                {
                  memberId: '22222222-2222-4222-8222-222222222222',
                  characterId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
                  characterName: 'Rook Vale',
                  memberHandle: 'player2',
                  memberDisplayName: 'Mira',
                  status: 'signed_up',
                },
              ],
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

    expect(await screen.findByText('Mira (@gm)')).toBeInTheDocument();
    expect(screen.getByText('Played by Mira (@player1)')).toBeInTheDocument();
    expect(screen.getByText('Played by Mira (@player2)')).toBeInTheDocument();
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
    expect(await screen.findByText(/Discord post pending/)).toBeInTheDocument();
    const delivery = document.querySelector('[data-el="quest.discordDelivery"]');
    expect(delivery).toHaveAttribute('data-terminal', '0');
    expect(delivery).toHaveAttribute('role', 'status');
    expect(await screen.findByRole('button', { name: 'Sign up' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /^Your character/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Lyra Storm' }));
    expect(screen.getByRole('button', { name: 'Sign up' })).toBeEnabled();
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
      await screen.findByText(/No eligible active characters to add/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Your characters' })).toHaveAttribute(
      'href',
      '/characters',
    );
    expect(screen.queryByRole('button', { name: 'Sign up' })).not.toBeInTheDocument();
  });

  it('offers a retry instead of loading forever when the member lookup fails', async () => {
    seedToken();
    let failMe = true;
    server.use(
      // Falls through to the default handler once the lookup recovers.
      graphql.query('MemberMe', () =>
        failMe
          ? HttpResponse.json({ errors: [{ message: 'boom' }] }, { status: 500 })
          : undefined,
      ),
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
    const retry = await screen.findByRole('button', { name: 'Retry characters' });
    expect(screen.queryByText('Loading your characters…')).not.toBeInTheDocument();
    failMe = false;
    await userEvent.click(retry);
    expect(
      await screen.findByText(/No eligible active characters to add/),
    ).toBeInTheDocument();
  });

  it('makes attendance and closure available only after the session is played', async () => {
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
    expect(
      await screen.findByRole('button', { name: 'Save attendance' }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Mark played' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review closure' })).toBeDisabled();
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
    expect(
      within(screen.getByRole('tabpanel')).getByText('No one has signed up yet.'),
    ).toBeInTheDocument();
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
