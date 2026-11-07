import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { graphql, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  AdminPeoplePage,
  DMDashboardPage,
  AdminContentPage,
} from '../src/features/admin/pages/AdminSectionPage.js';
import { renderWithProviders } from './test-utils.js';
import { signIn } from './features/admin/authority-test-utils.js';
import { server } from '../src/mocks/server.js';
import goodMe from './fixtures/wire/me/good.json';
import { useTheme } from '../src/context/ThemeContext.js';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function DashboardTimezoneControl() {
  const { setPreferences } = useTheme();
  return (
    <>
      <button onClick={() => setPreferences({ timezone: 'America/New_York' })}>
        Show New York time
      </button>
      <button onClick={() => setPreferences({ timezone: 'Asia/Kolkata' })}>
        Show Kolkata time
      </button>
    </>
  );
}

describe('Retained admin pagination and persisted readback', () => {
  it('uses server pages and role filters and starts a changed filter at its first page', async () => {
    signIn();
    const requests: Record<string, unknown>[] = [];
    server.use(
      graphql.query('AdminMembers', ({ variables }) => {
        requests.push(variables);
        const items =
          variables.role === 'dm'
            ? []
            : Array.from({ length: variables.offset === 0 ? 50 : 1 }, (_, n) => ({
                id: uuid(n + variables.offset),
                handle: `member${n + variables.offset}`,
                displayName: `Person ${n + variables.offset}`,
                roles: ['player'],
                status: 'active',
              }));
        return HttpResponse.json({
          data: { members: { total: variables.role === 'dm' ? 0 : 51, items } },
        });
      }),
    );
    renderWithProviders(<AdminPeoplePage />, { route: '/admin/people' });
    expect(await screen.findByRole('button', { name: /Person 0/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(
      await screen.findByRole('button', { name: /Person 50/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Person 0/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Role/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'DM' }));
    expect(
      await screen.findByText('No members match these filters.'),
    ).toBeInTheDocument();
    // A filter that fits on one page shows no pager at all.
    expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
    expect(requests).toContainEqual(expect.objectContaining({ offset: 50, limit: 50 }));
    expect(requests.at(-1)).toMatchObject({ offset: 0, role: 'dm' });
  });
  it('saves banner media through the existing command and reads the persisted values again', async () => {
    signIn();
    let reads = 0;
    let banner = {
      enabled: true,
      title: 'Welcome',
      body: null,
      ctaLabel: null,
      ctaHref: null,
      mediaKind: 'illustration',
      mediaUrl: 'https://example.test/old.webp',
      mediaLabel: 'Old image',
    };
    const writes: Record<string, unknown>[] = [];
    server.use(
      graphql.query('AdminHomeBanner', () => {
        reads++;
        return HttpResponse.json({ data: { homeBanner: banner } });
      }),
      graphql.mutation('UpdateHomeBanner', ({ variables }) => {
        writes.push(variables);
        banner = variables.input;
        return HttpResponse.json({ data: { updateHomeBanner: banner } });
      }),
    );
    renderWithProviders(<AdminContentPage />, { route: '/admin/content' });
    const label = await screen.findByLabelText('Media label');
    expect(screen.getByRole('button', { name: /^Media kind/ })).toHaveTextContent('illustration');
    await userEvent.clear(label);
    await userEvent.type(label, 'New image');
    await userEvent.click(screen.getByRole('button', { name: 'Save banner' }));
    expect(await screen.findByText('Home banner saved.')).toBeInTheDocument();
    await waitFor(() => expect(reads).toBeGreaterThan(1));
    expect(writes).toHaveLength(1);
    expect(writes[0].input).toMatchObject({
      mediaKind: 'illustration',
      mediaUrl: 'https://example.test/old.webp',
      mediaLabel: 'New image',
    });
    expect(screen.getByLabelText('Media label')).toHaveValue('New image');
  });
  it('keeps DM quest and table paging separate and navigates to canonical retained actions', async () => {
    signIn(['dm']);
    const calls: Record<string, unknown>[] = [];
    server.use(
      graphql.query('DmDashboard', ({ variables }) => {
        calls.push(variables);
        return HttpResponse.json({
          data: {
            dmStats: { sessionCount: 31 },
            questArcs: { total: 0, items: [] },
            quests: {
              total: 26,
              items: [
                {
                  id: uuid(1),
                  shortCode: variables.questOffset ? 'Q-26' : 'Q-1',
                  status: 'OPEN',
                  scheduledAt: null,
                  slotsMax: 5,
                  filledCount: 3,
                  briefDocument: {
                    title: variables.questOffset ? 'Later quest' : 'First quest',
                  },
                },
              ],
            },
            documents: {
              total: 26,
              items: [
                {
                  id: uuid(2),
                  slug: variables.tableOffset ? 'second-table' : 'first-table',
                  title: variables.tableOffset ? 'Second table' : 'First table',
                  status: 'published',
                  authorId: goodMe.id,
                  canEditBody: true,
                  canEditMetadata: variables.tableOffset === 0,
                },
              ],
            },
          },
        });
      }),
    );
    renderWithProviders(<DMDashboardPage />, { route: '/dm' });
    expect(await screen.findByRole('link', { name: 'First quest' })).toHaveAttribute(
      'href',
      '/quests/Q-1',
    );
    expect(await screen.findByRole('link', { name: 'Post a quest' })).toHaveAttribute(
      'href',
      '/quests/new',
    );
    expect(screen.queryByRole('link', { name: 'New DM table' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Your DM tables' })).not.toBeInTheDocument();
    const questCard = () => {
      const card = screen
        .getByRole('heading', { name: 'Your quests' })
        .closest('.card');
      if (!(card instanceof HTMLElement)) throw new Error('Expected quest card');
      return card;
    };
    await userEvent.click(within(questCard()).getByRole('button', { name: 'Next' }));
    expect(
      await screen.findByRole('link', { name: 'Later quest' }),
    ).toBeInTheDocument();
    expect(calls.at(-1)).toMatchObject({
      memberId: goodMe.id,
      questOffset: 25,
    });
    expect(calls.at(-1)).not.toHaveProperty('tableOffset');
    expect(
      within(questCard()).getByRole('link', {
        name: 'Manage participation, attendance and summary',
      }),
    ).toHaveAttribute('href', '/quests/Q-26');
    await userEvent.click(
      within(questCard()).getByRole('button', { name: 'Previous' }),
    );
    expect(await screen.findByRole('link', { name: 'First quest' })).toHaveAttribute(
      'href',
      '/quests/Q-1',
    );
    expect(calls.at(-1)).toMatchObject({
      memberId: goodMe.id,
      questOffset: 0,
    });
  });

  it('formats cached DM quest instants in the saved timezone and keeps null schedules unscheduled', async () => {
    signIn(['dm']);
    let reads = 0;
    server.use(
      graphql.query('DmDashboard', () => {
        reads++;
        return HttpResponse.json({
          data: {
            dmStats: null,
            questArcs: { total: 0, items: [] },
            quests: {
              total: 2,
              items: [
                {
                  id: uuid(1),
                  shortCode: 'Q-NIGHT',
                  status: 'OPEN',
                  scheduledAt: '2026-03-08T04:30:00Z',
                  slotsMax: 5,
                  filledCount: 3,
                  briefDocument: { title: 'Night quest' },
                },
                {
                  id: uuid(2),
                  shortCode: 'Q-LATER',
                  status: 'OPEN',
                  scheduledAt: null,
                  slotsMax: 4,
                  filledCount: 0,
                  briefDocument: { title: 'Unscheduled quest' },
                },
              ],
            },
            documents: { total: 0, items: [] },
          },
        });
      }),
    );
    renderWithProviders(
      <>
        <DMDashboardPage />
        <DashboardTimezoneControl />
      </>,
      { route: '/dm' },
    );
    expect(await screen.findByRole('link', { name: 'Night quest' })).toHaveAttribute(
      'href',
      '/quests/Q-NIGHT',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Show New York time' }));
    const scheduled = screen.getByText(/Sat 7 Mar 2026, 23:30/);
    expect(scheduled.tagName).toBe('TIME');
    expect(scheduled).toHaveAttribute('datetime', '2026-03-08T04:30:00Z');
    const unscheduled = screen.getByRole('row', { name: /Unscheduled quest/ });
    expect(within(unscheduled).getByText('Unscheduled', { exact: true })).toBeVisible();
    expect(unscheduled.querySelector('time')).toBeNull();
    const before = reads;
    await userEvent.click(screen.getByRole('button', { name: 'Show Kolkata time' }));
    expect(screen.getByText(/Sun 8 Mar 2026, 10:00/)).toHaveAttribute(
      'datetime',
      '2026-03-08T04:30:00Z',
    );
    expect(reads).toBe(before);
    expect(screen.queryByText(/Sat 7 Mar 2026, 23:30/)).not.toBeInTheDocument();
  });
  it('offers Create quest only once the DM profile is approved, as the API requires', async () => {
    signIn(['dm']);
    let profileReads = 0;
    server.use(
      graphql.query('DmDashboard', () =>
        HttpResponse.json({
          data: {
            dmStats: null,
            questArcs: { total: 0, items: [] },
            quests: { total: 0, items: [] },
            documents: { total: 0, items: [] },
          },
        }),
      ),
      graphql.query('QuestAuthoringAuthority', () => {
        profileReads++;
        return HttpResponse.json({
          data: {
            memberProfile: {
              member: { id: goodMe.id, roles: ['dm'], status: 'active' },
              dmProfile: { status: 'pending' },
            },
          },
        });
      }),
    );
    renderWithProviders(<DMDashboardPage />, { route: '/dm' });
    expect(await screen.findByText('You have no upcoming quests yet.')).toBeVisible();
    expect(screen.getByText('You have no past quests yet.')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'New DM table' })).not.toBeInTheDocument();
    await waitFor(() => expect(profileReads).toBeGreaterThan(0));
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Post a quest' })).toBeNull(),
    );
  });
});
