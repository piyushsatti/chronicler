import { graphql, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { HomePage } from '../../../src/features/home/pages/HomePage.js';
import { server } from '../../../src/mocks/server.js';
import lanesBad from '../../fixtures/wire/home/lanes-bad-board.json';
import recruitment from '../../fixtures/wire/home/lanes-recruitment.json';
import goodLanes from '../../fixtures/wire/home/lanes-good.json';
import member from '../../fixtures/wire/me/good.json';
import { renderWithProviders } from '../../test-utils.js';

describe('HomePage', () => {
  it('shows server totals and counts all51 scheduled quests while keeping preview cards capped', async () => {
    const scheduledAt = new Date(Date.now() + 3_600_000).toISOString();
    const quests = Array.from({ length: 51 }, (_, index) => ({
      ...goodLanes.questBoard.items[0],
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      shortCode: `Q-COUNT-${index}`,
      scheduledAt,
    }));
    const dms = Array.from({ length: 27 }, (_, index) => ({
      ...goodLanes.communityDirectory.entries[0],
      memberId: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
      handle: `dm-${index}`,
      displayName: `DM ${index}`,
    }));
    server.use(
      graphql.query('HomeWarRoom', () =>
        HttpResponse.json({
          data: {
            ...goodLanes,
            questBoard: { items: quests.slice(0, 12), total: 51 },
            quests: { items: quests.slice(0, 12), total: 51 },
            recentlyClosedQuests: { ...goodLanes.recentlyClosedQuests, total: 42 },
            communityDirectory: { entries: dms.slice(0, 12), total: 27 },
          },
        }),
      ),
      graphql.query('HomeUpcoming', () =>
        HttpResponse.json({ data: { quests: { items: quests.slice(12), total: 51 } } }),
      ),
      graphql.query('HomeAcceptingDms', () =>
        HttpResponse.json({
          data: { communityDirectory: { entries: dms.slice(12), total: 27 } },
        }),
      ),
    );
    renderWithProviders(<HomePage />);
    expect(await screen.findByText('51 scheduled')).toBeInTheDocument();
    expect(screen.getByText('27 DMs')).toBeInTheDocument();
    expect(screen.getByText('42 closed')).toBeInTheDocument();
    const week = screen.getByRole('list', { name: 'Next 7 days schedule' });
    expect(within(week).getAllByRole('listitem')).toHaveLength(7);
    expect(within(week).getByText('51')).toBeVisible();
    expect(screen.getAllByTestId('open-quest-card')).toHaveLength(12);
    expect(screen.getAllByTestId('sched-card')).toHaveLength(3);
    expect(
      within(screen.getByRole('region', { name: 'DMs accepting' })).getAllByRole(
        'link',
      ),
    ).toHaveLength(12);
  });

  it.each([false, true])(
    'uses qualified DM membership for Home readiness (later approved=%s)',
    async (approved) => {
      const dms = Array.from({ length: 13 }, (_, index) => ({
        ...goodLanes.communityDirectory.entries[0],
        memberId: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
        handle: `dm-${index}`,
        displayName: `DM ${index}`,
        isDm: approved && index === 12,
      }));
      server.use(
        graphql.query('HomeWarRoom', () =>
          HttpResponse.json({
            data: {
              ...goodLanes,
              questBoard: { items: [], total: 0 },
              quests: { items: [], total: 0 },
              recentlyClosedQuests: { items: [], total: 0 },
              communityDirectory: { entries: dms.slice(0, 12), total: 13 },
            },
          }),
        ),
        graphql.query('HomeAcceptingDms', () =>
          HttpResponse.json({
            data: {
              communityDirectory: { entries: dms.slice(12), total: 13 },
            },
          }),
        ),
      );
      renderWithProviders(<HomePage />);
      if (approved) {
        expect(
          await screen.findByRole('link', { name: 'DM 12 profile' }),
        ).toBeVisible();
        expect(screen.getByText('1 DM')).toBeInTheDocument();
        expect(screen.queryByText('13 DMs')).not.toBeInTheDocument();
      } else {
        expect(
          await screen.findByText('The war room is quiet for now.'),
        ).toBeInTheDocument();
        expect(
          screen.queryByRole('region', { name: 'DMs accepting' }),
        ).not.toBeInTheDocument();
      }
    },
  );

  it('does not present partial counts when a later upcoming page fails', async () => {
    server.use(
      graphql.query('HomeWarRoom', () =>
        HttpResponse.json({
          data: { ...goodLanes, quests: { ...goodLanes.quests, total: 51 } },
        }),
      ),
      graphql.query('HomeUpcoming', () =>
        HttpResponse.json({ errors: [{ extensions: { code: 'FORBIDDEN' } }] }),
      ),
    );
    renderWithProviders(<HomePage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Sign in to see this|You don’t have access to this/,
    );
    expect(screen.queryByText('51 scheduled')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: 'Next 7 days schedule' }),
    ).not.toBeInTheDocument();
  });

  it('cancels the old window on logout and cannot replace the guest result with its held page', async () => {
    const token = `${btoa('{}')}.${btoa(JSON.stringify({ member_id: member.id, exp: Date.now() / 1000 + 3600 }))}.test`;
    localStorage.setItem(TOKEN_KEY, token);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let oldSignal: AbortSignal | undefined;
    let pages = 0;
    server.use(
      graphql.query('HomeWarRoom', ({ request }) =>
        HttpResponse.json({
          data: request.headers.get('Authorization')
            ? { ...goodLanes, quests: { ...goodLanes.quests, total: 51 } }
            : {
                ...goodLanes,
                questBoard: { items: [], total: 0 },
                quests: { items: [], total: 0 },
                recentlyClosedQuests: { items: [], total: 0 },
                communityDirectory: { entries: [], total: 0 },
              },
        }),
      ),
      graphql.query('HomeUpcoming', async ({ request }) => {
        pages++;
        oldSignal = request.signal;
        await held;
        return HttpResponse.json({
          data: { quests: { items: [], total: 51 } },
        });
      }),
    );
    const { queryClient } = renderWithProviders(<HomePage />);
    await waitFor(() => expect(pages).toBe(1));
    expect(screen.queryByText('51 scheduled')).not.toBeInTheDocument();
    act(() => {
      localStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(
        new StorageEvent('storage', { key: TOKEN_KEY, newValue: null }),
      );
    });
    expect(
      await screen.findByText('The war room is quiet for now.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(oldSignal?.aborted).toBe(true));
    await act(async () => {
      release();
      await held;
    });
    expect(pages).toBe(1);
    expect(queryClient.getQueryData(['homeLanes'])).toMatchObject({
      totals: { upcoming: 0 },
    });
    expect(screen.queryByText('51 scheduled')).not.toBeInTheDocument();
  });

  it('renders the public greeting, campaign stats, and quest lanes without an archive read', async () => {
    renderWithProviders(<HomePage />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Welcome to Chronicler.' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('412 quests · 200 active characters'),
    ).toBeInTheDocument();
    expect(screen.getByText('Public board · anyone can browse')).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Recent from the archive' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Now — recruiting' }),
    ).toBeInTheDocument();
    const recruiting = screen.getByRole('region', { name: 'Now — recruiting' });
    expect(within(recruiting).getByTestId('open-quest-card')).toBeInTheDocument();
    expect(within(recruiting).getByTestId('quest-title')).toHaveTextContent(
      'Siege of Kraghold',
    );
    expect(
      screen.getByRole('heading', { name: 'Coming up — next two weeks' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vault Delve' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mira profile' })).toHaveAttribute(
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

  it('shows empty when quest lanes are empty', async () => {
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

  it('does not let retired archive buckets determine Home readiness', async () => {
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
      await screen.findByText('The war room is quiet for now.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Recent from the archive' }),
    ).not.toBeInTheDocument();
  });

  it('shows honest onboarding for guests and keeps dismissal across remounts', async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithProviders(<HomePage />);
    expect(await screen.findByTestId('new-here-shelf')).toHaveTextContent(
      'Pick a character',
    );
    expect(screen.queryByText(/No beginner-friendly quests/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dismiss new-here shelf' }));
    expect(screen.queryByTestId('new-here-shelf')).not.toBeInTheDocument();
    unmount();
    renderWithProviders(<HomePage />);
    await screen.findByRole('heading', { level: 1, name: 'Welcome to Chronicler.' });
    expect(screen.queryByTestId('new-here-shelf')).not.toBeInTheDocument();
  });

  it('offers count-free onboarding to a validated member', async () => {
    localStorage.setItem(
      TOKEN_KEY,
      `${btoa('{}')}.${btoa(JSON.stringify({ sub: 'discord-one', exp: Date.now() / 1000 + 3600 }))}.test`,
    );
    renderWithProviders(<HomePage />);
    expect(await screen.findByTestId('new-here-shelf')).toBeInTheDocument();
    expect(screen.getByText('Campaign board')).toBeInTheDocument();
    expect(screen.queryByText(/beginner-friendly/)).not.toBeInTheDocument();
  });
});
