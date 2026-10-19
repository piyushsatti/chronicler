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
  it('renders war-room welcome, archive buckets, and lane cards', async () => {
    renderWithProviders(<HomePage />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Welcome to Chronicler.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('War room')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('members on the server')).toBeInTheDocument();
    const archive = screen.getByRole('region', { name: 'Recent from the archive' });
    expect(
      within(archive).getByRole('link', { name: 'Siege of Kraghold' }),
    ).toHaveAttribute('href', '/chronicles/siege-of-kraghold');
    expect(screen.getByRole('heading', { name: 'Now recruiting' })).toBeInTheDocument();
    const recruiting = screen.getByRole('region', { name: 'Now recruiting' });
    expect(within(recruiting).getByRole('link', { name: 'Siege of Kraghold' })).toHaveAttribute(
      'href',
      '/quests/Q-101',
    );
    expect(screen.getByRole('link', { name: 'Festival Run' })).toBeInTheDocument();
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
    const lane = await screen.findByRole('region', { name: 'Now recruiting' });
    expect(
      within(lane)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/quests/Q-417', '/quests/Q-419', '/quests/Q-420']);
    for (const label of ['Q-417 · filling', 'Q-419 · filling', 'Q-420 · filling']) {
      expect(within(lane).getByText(label)).toBeInTheDocument();
    }
    const openQuestLinks = screen.getAllByRole('link', { name: 'Open quests' });
    expect(openQuestLinks).toHaveLength(2);
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
    const lane = await screen.findByRole('region', { name: 'Now recruiting' });
    expect(
      within(lane)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/quests/Q-417', '/quests/Q-420']);
    expect(within(lane).getByText('Q-417 · legacy-custom')).toBeInTheDocument();
    expect(within(lane).getByText('Q-420 · legacy-custom')).toBeInTheDocument();
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
      await screen.findByRole('region', { name: 'Now recruiting' }),
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
          },
        }),
      ),
    );
    renderWithProviders(<HomePage />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Welcome to Chronicler.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Recent from the archive' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('The war room is quiet for now.')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Now recruiting' })).not.toBeInTheDocument();
  });
});
