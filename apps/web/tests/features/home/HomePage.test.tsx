import { graphql, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { HomePage } from '../../../src/features/home/pages/HomePage.js';
import { server } from '../../../src/mocks/server.js';
import lanesBad from '../../fixtures/wire/home/lanes-bad-board.json';
import recruitment from '../../fixtures/wire/home/lanes-recruitment.json';
import { renderWithProviders } from '../../test-utils.js';

describe('HomePage', () => {
  it('renders war-room greeting, demoted archive, and OpenQuestCard lanes', async () => {
    renderWithProviders(<HomePage />);
    expect(
      await screen.findByRole('heading', { level: 1, name: /Good (morning|afternoon|evening|night), Mortal\./ }),
    ).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('members on the server')).toBeInTheDocument();
    const archive = screen.getByRole('region', { name: 'Recent from the archive' });
    expect(
      within(archive).getByRole('link', { name: 'Siege of Kraghold' }),
    ).toHaveAttribute('href', '/chronicles/siege-of-kraghold');
    expect(screen.getByRole('heading', { name: 'Now — recruiting' })).toBeInTheDocument();
    const recruiting = screen.getByRole('region', { name: 'Now — recruiting' });
    expect(within(recruiting).getByTestId('open-quest-card')).toBeInTheDocument();
    expect(within(recruiting).getByTestId('quest-title')).toHaveTextContent('Siege of Kraghold');
    expect(screen.getByRole('heading', { name: 'Coming up — next two weeks' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vault Delve' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mira' })).toHaveAttribute(
      'href',
      '/dms/@mira',
    );
  });

  it('shows all three filling quests in recruiting and follows a quest link', async () => {
    const user = userEvent.setup();
    server.use(
      graphql.query('HomeWarRoom', () => HttpResponse.json({ data: recruitment })),
    );
    renderWithProviders(
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/quests/Q-419" element={<p>Quest detail destination</p>} />
      </Routes>,
    );
    const lane = await screen.findByRole('region', { name: 'Now — recruiting' });
    const cards = within(lane).getAllByTestId('open-quest-card');
    expect(cards).toHaveLength(3);
    expect(within(lane).getByText('Q-417')).toBeInTheDocument();
    expect(within(lane).getByText('Q-419')).toBeInTheDocument();
    expect(within(lane).getByText('Q-420')).toBeInTheDocument();
    expect(within(lane).getAllByText('Filling')).toHaveLength(3);
    const openQuestLinks = screen.getAllByRole('link', { name: 'Open quests' });
    expect(openQuestLinks.length).toBeGreaterThanOrEqual(1);
    for (const link of openQuestLinks) {
      expect(link).toHaveAttribute('href', '/quests');
    }
    await user.click(within(lane).getByRole('link', { name: "Lily's Nightmares" }));
    expect(await screen.findByText('Quest detail destination')).toBeInTheDocument();
  });

  it('does not show a non-open quest even when its display label is open', async () => {
    const mixed = {
      ...recruitment,
      questBoard: {
        ...recruitment.questBoard,
        items: recruitment.questBoard.items.map((item, index) => ({
          ...item,
          status: index === 1 ? 'closed' : 'open',
          displayStatus: index === 1 ? 'open' : 'legacy-custom',
        })),
      },
    };
    server.use(graphql.query('HomeWarRoom', () => HttpResponse.json({ data: mixed })));
    renderWithProviders(<HomePage />);
    const lane = await screen.findByRole('region', { name: 'Now — recruiting' });
    expect(within(lane).getAllByTestId('open-quest-card')).toHaveLength(2);
    expect(within(lane).getByText('Q-417')).toBeInTheDocument();
    expect(within(lane).getByText('Q-420')).toBeInTheDocument();
    expect(within(lane).queryByText('Q-419')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: "Lily's Nightmares" }),
    ).not.toBeInTheDocument();
  });

  it('shows loading while recruitment is pending and becomes ready', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      graphql.query('HomeWarRoom', async () => {
        await pending;
        return HttpResponse.json({ data: recruitment });
      }),
    );
    renderWithProviders(<HomePage />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    release();
    expect(
      await screen.findByRole('region', { name: 'Now — recruiting' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows controlled error when lanes wire fails', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          data: {
            home: { recentByCategory: [] },
            questBoard: lanesBad.questBoard,
            quests: lanesBad.quests,
            recentlyClosedQuests: lanesBad.recentlyClosedQuests,
            communityDirectory: lanesBad.communityDirectory,
            siteStats: { totalMembers: 42 },
            homeBanner: { enabled: false },
          },
        }),
      ),
    );
    renderWithProviders(<HomePage />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'The server returned data this screen cannot use.',
      );
    });
  });

  it('shows empty when buckets and lanes are empty', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          data: {
            home: { recentByCategory: [] },
            questBoard: { items: [], total: 0 },
            quests: { items: [], total: 0 },
            recentlyClosedQuests: { items: [], total: 0 },
            communityDirectory: { entries: [], total: 0 },
            regions: [],
            siteStats: { totalMembers: 0 },
            homeBanner: { enabled: false },
          },
        }),
      ),
    );
    renderWithProviders(<HomePage />);
    expect(
      await screen.findByText('The war room is quiet for now.'),
    ).toBeInTheDocument();
  });

  it('stays ready when lanes are empty but archive buckets have documents', async () => {
    server.use(
      graphql.query('HomeWarRoom', () =>
        HttpResponse.json({
          data: {
            questBoard: { items: [], total: 0 },
            quests: { items: [], total: 0 },
            recentlyClosedQuests: { items: [], total: 0 },
            communityDirectory: { entries: [], total: 0 },
            regions: [],
          },
        }),
      ),
    );
    renderWithProviders(<HomePage />);
    expect(
      await screen.findByRole('heading', { level: 1, name: /Good (morning|afternoon|evening|night), Mortal\./ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Recent from the archive' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('The war room is quiet for now.')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Now — recruiting' })).toBeInTheDocument();
    expect(screen.getByText('No open quests right now.')).toBeInTheDocument();
  });
});
