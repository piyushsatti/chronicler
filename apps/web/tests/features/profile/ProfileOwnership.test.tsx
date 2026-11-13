import { beforeEach, describe, it, expect, vi } from 'vitest';
import { graphql, HttpResponse } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import {
  DMProfilePage,
  DmTableDetailPage,
  PlayerProfilePage,
} from '../../../src/features/profile/pages/ProfilePages.js';
import { parseDmTableDocument } from '../../../src/features/profile/adapters/dmTableAdapter.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';
import table from '../../fixtures/wire/profile/dm-table-good.json';
import character from '../../fixtures/wire/character/good.json';
import { signInProfile } from './profileAuth.js';
const account = vi.hoisted(() => ({
  id: '22222222-2222-4222-8222-222222222222',
  roles: ['admin'],
}));
vi.mock('../../../src/hooks/useMe.js', () => ({ useMe: () => ({ data: account }) }));
beforeEach(() => {
  account.id = '22222222-2222-4222-8222-222222222222';
  account.roles = ['admin'];
});
describe('Profile ownership and table identity', () => {
  it.each([
    { role: 'player', characters: 2, played: 3, writings: 4, sessions: 7, labels: ['Characters', 'Quests played', 'Availability'] },
    { role: 'dm', characters: 2, played: 3, writings: 4, sessions: 7, labels: ['Characters', 'Sessions run', 'Availability'] },
    { role: 'dm', characters: 0, played: 0, writings: 0, sessions: 7, labels: ['Characters', 'Sessions run', 'Availability'] },
    { role: 'dm', characters: 0, played: 0, writings: 0, sessions: 0, labels: ['Characters', 'Sessions run', 'Availability'] },
    { role: 'player', characters: 0, played: 0, writings: 0, sessions: 7, labels: ['Characters', 'Quests played', 'Availability'] },
    { role: 'dm', characters: 2, played: 0, writings: 0, sessions: 0, labels: ['Characters', 'Sessions run', 'Availability'] },
  ])('shows all hero statistics, including real zeros, for $role with $characters characters and $sessions sessions', async ({ role, characters, played, writings, sessions, labels }) => {
    server.use(
      graphql.query('CharacterDirectory', () => HttpResponse.json({ data: { characters: { items: Array.from({ length: characters }, (_, index) => ({ ...character, id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` })), total: characters } } })),
      graphql.query('ProfileActivity', () => HttpResponse.json({ data: { memberActivityStats: { questsPlayed: played, summariesAuthored: writings }, documents: { items: [], total: 0 } } })),
      graphql.query('ProfileDmDetails', () => HttpResponse.json({ data: { questArcs: { items: [], total: 0 }, dmStats: { sessionCount: sessions }, documents: { items: [], total: 0 } } })),
    );
    const { queryClient } = renderWithProviders(
      <Routes>
        <Route path="/players/:shortCode" element={<PlayerProfilePage />} />
        <Route path="/dms/:shortCode" element={<DMProfilePage />} />
      </Routes>,
      { route: `/${role === 'dm' ? 'dms' : 'players'}/@mira` },
    );
    await screen.findByRole('heading', { name: 'Mira' });
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    const statistics = screen.getByLabelText('Profile statistics');
    expect(statistics).toBeVisible();
    const values: Record<string, number | string> = { Characters: characters, 'Quests played': played, 'Sessions run': sessions, Availability: 'Fridays' };
    for (const label of labels) {
      expect(within(statistics).getByText(label).closest('[data-component="StatTile"]')).toHaveTextContent(String(values[label]));
    }
    expect(document.querySelectorAll('[data-component="StatTile"]')).toHaveLength(labels.length);
    expect(within(screen.getByRole('tabpanel', { name: 'About' })).queryByText('Sessions run')).not.toBeInTheDocument();
  });
  it('denies owner controls to an admin viewing another member', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/dms/:shortCode" element={<DMProfilePage />} />
      </Routes>,
      { route: '/dms/@mira' },
    );
    await screen.findByRole('heading', { name: 'Mira' });
    expect(
      screen.queryByRole('heading', { name: 'Your profile' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'New DM table' }),
    ).not.toBeInTheDocument();
  });
  it('allows matching owner controls', async () => {
    account.id = '11111111-1111-4111-8111-111111111111';
    account.roles = ['dm', 'player'];
    renderWithProviders(
      <Routes>
        <Route path="/dms/:shortCode" element={<DMProfilePage />} />
      </Routes>,
      { route: '/dms/@mira' },
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
    expect(
      await screen.findByRole('heading', { name: 'Your profile' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'New DM table' })).not.toBeInTheDocument();
  });
  it('shows only real DM owner actions in the collapsed empty-work block', async () => {
    account.id = '11111111-1111-4111-8111-111111111111';
    account.roles = ['dm', 'player'];
    signInProfile();
    server.use(
      graphql.query('QuestAuthoringAuthority', () => HttpResponse.json({ data: { memberProfile: {
        member: { id: account.id, roles: account.roles, status: 'active' },
        dmProfile: { status: 'approved' },
      } } })),
      graphql.query('ProfileDmDetails', () => HttpResponse.json({ data: {
        dmStats: { sessionCount: 0 }, documents: { items: [], total: 0 },
        questArcs: { items: [], total: 0 },
      } })),
      graphql.query('DmTableSchedule', () => HttpResponse.json({ data: { quests: { items: [], total: 0 } } })),
    );
    renderWithProviders(<Routes><Route path="/dms/:shortCode" element={<DMProfilePage />} /></Routes>, { route: '/dms/@mira' });
    const panel = await screen.findByRole('tabpanel', { name: 'About' });
    expect(await within(panel).findByText('Nothing here yet.')).toBeVisible();
    expect(within(panel).queryByRole('link', { name: 'New DM table' })).not.toBeInTheDocument();
    // No dead /series/new link. useMe is mocked here, so the create button's DM check never runs.
    expect(within(panel).queryByRole('link', { name: 'Create a series' })).not.toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Post a quest' })).toHaveAttribute('href', '/quests/new');
    expect(within(panel).getAllByText('Nothing here yet.')).toHaveLength(1);
  });
  it('does not offer quest creation to an owner without an approved DM profile', async () => {
    account.id = '11111111-1111-4111-8111-111111111111';
    account.roles = ['dm', 'player'];
    signInProfile();
    server.use(
      graphql.query('QuestAuthoringAuthority', () => HttpResponse.json({ data: { memberProfile: {
        member: { id: account.id, roles: account.roles, status: 'active' },
        dmProfile: { status: 'pending' },
      } } })),
      graphql.query('ProfileDmDetails', () => HttpResponse.json({ data: {
        dmStats: { sessionCount: 0 }, documents: { items: [], total: 0 },
        questArcs: { items: [], total: 0 },
      } })),
      graphql.query('DmTableSchedule', () => HttpResponse.json({ data: { quests: { items: [], total: 0 } } })),
    );
    renderWithProviders(<Routes><Route path="/dms/:shortCode" element={<DMProfilePage />} /></Routes>, { route: '/dms/@mira' });
    const panel = await screen.findByRole('tabpanel', { name: 'About' });
    expect(await within(panel).findByText('Nothing here yet.')).toBeVisible();
    expect(within(panel).queryByRole('link', { name: 'New DM table' })).not.toBeInTheDocument();
    // No dead /series/new link. useMe is mocked here, so the create button's DM check never runs.
    expect(within(panel).queryByRole('link', { name: 'Create a series' })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('link', { name: 'Post a quest' })).not.toBeInTheDocument();
  });
  it('uses persisted author UUID for schedule and returned edit capability', async () => {
    let scheduleVariables: unknown;
    server.use(
      graphql.query('DmTableBySlug', () =>
        HttpResponse.json({
          data: {
            document: { ...table, slug: 'not-the-host-name', canEditBody: true },
          },
        }),
      ),
      graphql.query('DmTableSchedule', ({ variables }) => {
        scheduleVariables = variables;
        return HttpResponse.json({ data: { quests: { items: [], total: 0 } } });
      }),
    );
    renderWithProviders(
      <Routes>
        <Route path="/community/dm-table/:slug" element={<DmTableDetailPage />} />
      </Routes>,
      { route: '/community/dm-table/not-the-host-name' },
    );
    expect(await screen.findByRole('link', { name: 'Edit table' })).toHaveAttribute(
      'href',
      `/editor/dm-table/${table.id}/edit`,
    );
    await screen.findByText(/No sessions/i);
    expect(scheduleVariables).toMatchObject({ memberId: table.authorId, offset: 0 });
  });
  it('refuses to reinterpret another Document kind as a DM table', () => {
    expect(
      parseDmTableDocument({ ...table, kind: 'codex_entry', category: 'NPC' }),
    ).toEqual({ ok: true, data: null });
    expect(parseDmTableDocument({ ...table, authorId: 'bad' }).ok).toBe(false);
  });
  it('pages UUID-filtered sessions beyond the first page', async () => {
    const sessionCalls: Record<string, unknown>[] = [];
    server.use(
      graphql.query('ProfileDmDetails', () => HttpResponse.json({
        data: {
          questArcs: { items: [], total: 0 },
          dmStats: { sessionCount: 7 },
        },
      })),
      graphql.query('DmTableSchedule', ({ variables }) => {
        sessionCalls.push(variables);
        return HttpResponse.json({ data: { quests: { items: [], total: 21 } } });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/dms/:shortCode" element={<DMProfilePage />} />
      </Routes>,
      { route: '/dms/@mira' },
    );
    expect(await screen.findByText('Sessions run')).toBeVisible();
    await waitFor(() => expect(screen.getByText('Sessions run').closest('[data-component="StatTile"]')).toHaveTextContent('7'));
    expect(screen.queryByRole('button', { name: 'Next tables' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next sessions' }));
    await waitFor(() =>
      expect(sessionCalls.at(-1)).toMatchObject({
        memberId: table.authorId,
        limit: 20,
        offset: 20,
      }),
    );
  });
});
