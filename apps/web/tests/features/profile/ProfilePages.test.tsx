import { describe, expect, it } from 'vitest';
import { graphql, http, HttpResponse } from 'msw';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import profile from '../../fixtures/wire/profile/member-profile-good.json';
import character from '../../fixtures/wire/character/good.json';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Link, Route, Routes } from 'react-router-dom';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { DMProfilePage, PlayerProfilePage } from '../../../src/features/profile/pages/ProfilePages.js';
import { loadMemberProfile } from '../../../src/features/profile/adapters/memberProfileAdapter.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';

describe('DMProfilePage', () => {
  it('renders dm handle and accepting status', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/dms/:shortCode" element={<DMProfilePage />} />
      </Routes>,
      { route: '/dms/@mira' },
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mira' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('@mira')).toBeInTheDocument();
    expect(screen.getByText('Horror & heists')).toBeInTheDocument();
    expect(screen.getByText('Accepting players')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'DMs' })).toHaveAttribute('href', '/dms');
  });

  it('lists the DM’s series and separates played future quests from upcoming quests', async () => {
    const quest = (id: string, title: string, status: string) => ({ id, shortCode: id, status, scheduledAt: '2098-01-01T12:00:00Z', slotsMax: 4, filledCount: 2, briefDocument: { title } });
    server.use(
      graphql.query('ProfileDmDetails', () => HttpResponse.json({ data: {
        dmStats: { sessionCount: 4 }, documents: { items: [], total: 0 },
        questArcs: { total: 2, items: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Mira’s campaign', createdBy: profile.member.id, questCount: 8 }, { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Another DM’s campaign', createdBy: '22222222-2222-4222-8222-222222222222', questCount: 1 }] },
      } })),
      graphql.query('DmTableSchedule', () => HttpResponse.json({ data: { quests: { total: 3, items: [quest('open', 'Next adventure', 'announced'), quest('played', 'Finished adventure', 'played'), quest('cancelled', 'Cancelled adventure', 'cancelled')] } } })),
    );
    renderWithProviders(<Routes><Route path="/dms/:shortCode" element={<DMProfilePage />} /></Routes>, { route: '/dms/@mira' });
    expect(await screen.findByRole('link', { name: /Mira’s campaign/ })).toHaveAttribute('href', '/series/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(screen.queryByText('Another DM’s campaign')).not.toBeInTheDocument();
    const upcoming = await screen.findByRole('region', { name: 'Upcoming quests' });
    expect(within(upcoming).getByRole('link', { name: 'Next adventure' })).toBeVisible();
    expect(within(upcoming).queryByText('Finished adventure')).not.toBeInTheDocument();
    const past = screen.getByRole('region', { name: 'Past quests' });
    expect(within(past).getByRole('link', { name: 'Finished adventure' })).toBeVisible();
    expect(within(past).getByRole('link', { name: 'Cancelled adventure' })).toBeVisible();
  });

  it('resets the character page and active tab when navigating to another member', async () => {
    const otherId = '22222222-2222-4222-8222-222222222222';
    const calls: Record<string, unknown>[] = [];
    server.use(
      graphql.query('MemberProfile', ({ variables }) => HttpResponse.json({ data: { memberProfile: variables.handle === 'other' ? { ...profile, member: { ...profile.member, id: otherId, handle: 'other', displayName: 'Other player', roles: ['player'] }, dmProfile: null } : profile } })),
      graphql.query('CharacterDirectory', ({ variables }) => {
        calls.push(variables);
        const other = variables.filters?.ownerId === otherId;
        return HttpResponse.json({ data: { characters: { items: [{ ...character, name: other ? 'Other member hero' : 'Mira hero' }], total: other ? 1 : 25 } } });
      }),
    );
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<><Link to="/players/@other">Other profile</Link><Routes><Route path="/players/:shortCode" element={<PlayerProfilePage />} /></Routes></>, { route: '/players/@mira' });
    await screen.findByRole('heading', { level: 1, name: 'Mira' });
    await queryClient.prefetchQuery({ queryKey: ['memberProfile', 'other'], queryFn: () => loadMemberProfile('other') });
    await user.click(screen.getByRole('tab', { name: 'Characters' }));
    await user.click(await screen.findByRole('button', { name: 'Next characters' }));
    await waitFor(() => expect(calls.at(-1)).toMatchObject({ offset: 24 }));
    await user.click(screen.getByRole('link', { name: 'Other profile' }));
    await screen.findByRole('heading', { level: 1, name: 'Other player' });
    expect(screen.getByRole('tab', { name: 'About' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Characters' }));
    expect(await screen.findByRole('link', { name: /Other member hero/ })).toBeVisible();
    expect(calls.at(-1)).toMatchObject({ filters: { ownerId: otherId }, offset: 0 });
  });

  it('uses a truthful empty About tab when a player has no bio field or activity', async () => {
    server.use(graphql.query('MemberProfile', () => HttpResponse.json({ data: { memberProfile: { ...profile, dmProfile: null, member: { ...profile.member, roles: ['player'] }, activitySummary: { messages: 0, reactions: 0, voiceMinutes: 0 } } } })));
    renderWithProviders(<Routes><Route path="/players/:shortCode" element={<PlayerProfilePage />} /></Routes>, { route: '/players/@mira' });
    expect(await screen.findByText('No Discord activity has been recorded yet.')).toBeVisible();
    expect(screen.queryByText(/written a bio/)).not.toBeInTheDocument();
  });

  it('shows controlled error on GraphQL failure', async () => {
    server.use(
      http.post(GRAPHQL_PATH, () =>
        HttpResponse.json({
          errors: [{ message: 'boom', extensions: { code: 'INTERNAL' } }],
        }),
      ),
    );
    renderWithProviders(
      <Routes>
        <Route path="/dms/:shortCode" element={<DMProfilePage />} />
      </Routes>,
      { route: '/dms/@mira' },
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });

  it('does not import adapters from the page module', () => {
    const text = readFileSync(
      join(process.cwd(), 'src/features/profile/pages/ProfilePages.tsx'),
      'utf8',
    );
    expect(text).not.toMatch(/adapters\//);
  });
});
