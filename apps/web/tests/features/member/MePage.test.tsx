import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { graphql, HttpResponse } from 'msw';
import { MePage } from '../../../src/features/member/pages/MePage.js';
import { server } from '../../../src/mocks/server.js';
import { signIn } from '../admin/authority-test-utils.js';
import { renderWithProviders } from '../../test-utils.js';

describe('MePage', () => {
  it('is the personal hub: identity, account actions, real stats, tabs', async () => {
    signIn(['player', 'dm']);
    renderWithProviders(<MePage />, { route: '/me' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ashwin' }),
    ).toBeVisible();
    expect(screen.getByText('@ashwin')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Personalize' })).toHaveAttribute(
      'href',
      '/me/personalize',
    );
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/settings',
    );
    expect(screen.getByRole('link', { name: 'DM dashboard' })).toHaveAttribute(
      'href',
      '/dm',
    );
    expect(screen.getByRole('link', { name: 'View public profile' })).toHaveAttribute(
      'href',
      '/dms/@ashwin',
    );
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();
    // The old bounce-only link cards are gone.
    expect(screen.queryByRole('navigation', { name: 'Your account' })).toBeNull();
    const stats = await screen.findByRole('list', { name: 'Your stats' });
    expect(stats).toHaveTextContent('Quests played');
    expect(stats).toHaveTextContent('3');
    expect(stats).not.toHaveTextContent('—');
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Overview',
      'Characters',
      'Notes',
    ]);
    expect(screen.getByRole('link', { name: 'Open DM dashboard' })).toBeVisible();
  });

  it('opens the tab named in the URL and keeps it there', async () => {
    signIn(['player']);
    renderWithProviders(<MePage />, { route: '/me?tab=notes' });
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Private notes' }),
    ).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Notes' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.queryByRole('link', { name: 'DM dashboard' })).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Upcoming sign-ups' }),
    ).toBeVisible();
  });

  it('says so when there are no upcoming sign-ups', async () => {
    signIn(['player']);
    renderWithProviders(<MePage />, { route: '/me' });
    expect(await screen.findByText('No upcoming sign-ups.')).toBeVisible();
  });

  it('lists the roster with a create action on the Characters tab', async () => {
    signIn(['player']);
    server.use(
      graphql.query('MemberRoster', () =>
        HttpResponse.json({
          data: {
            myCharacters: {
              total: 1,
              items: [
                {
                  id: 'c1',
                  shortCode: 'C-1',
                  name: 'Wren Ashdown',
                  status: 'active',
                  imageUrl: null,
                  ddbMirror: { classes: 'Rogue 3', species: 'Elf' },
                },
              ],
            },
          },
        }),
      ),
    );
    renderWithProviders(<MePage />, { route: '/me?tab=characters' });
    const card = await screen.findByRole('link', { name: /Wren Ashdown/ });
    expect(card).toHaveAttribute('href', '/characters/C-1');
    expect(card).toHaveTextContent('Rogue 3 · Elf');
    expect(screen.getByRole('link', { name: 'Create a character' })).toBeVisible();
  });

  it('lists upcoming sign-ups that link to the quest', async () => {
    signIn(['player']);
    server.use(
      graphql.query('MemberUpcoming', () =>
        HttpResponse.json({
          data: {
            quests: {
              total: 2,
              items: [
                {
                  id: 'q1',
                  shortCode: 'Q-417',
                  status: 'open',
                  scheduledAt: '2099-06-20T20:00:00Z',
                  briefDocument: { title: 'The Hound of Culann' },
                  participants: [
                    {
                      memberId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                      characterName: 'Wren',
                      status: 'signed_up',
                    },
                  ],
                },
                {
                  id: 'q2',
                  shortCode: 'Q-418',
                  status: 'open',
                  scheduledAt: '2099-06-21T20:00:00Z',
                  briefDocument: { title: 'Someone else' },
                  participants: [
                    { memberId: 'other', characterName: 'X', status: 'signed_up' },
                  ],
                },
              ],
            },
          },
        }),
      ),
    );
    renderWithProviders(<MePage />, { route: '/me' });
    const link = await screen.findByRole('link', { name: /The Hound of Culann/ });
    expect(link).toHaveAttribute('href', '/quests/Q-417');
    expect(screen.queryByText('Someone else')).toBeNull();
  });

  it('pages past the first 100 quests and skips cancelled ones', async () => {
    signIn(['player']);
    const me = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const seat = { memberId: me, characterName: 'Wren', status: 'signed_up' };
    const filler = Array.from({ length: 100 }, (_, i) => ({
      id: `f${i}`,
      shortCode: `F-${i}`,
      status: 'open',
      scheduledAt: '2099-06-01T20:00:00Z',
      briefDocument: { title: `Filler ${i}` },
      participants: [],
    }));
    const offsets: number[] = [];
    server.use(
      graphql.query('MemberUpcoming', ({ variables }) => {
        const offset = Number(variables.offset ?? 0);
        offsets.push(offset);
        const items =
          offset === 0
            ? filler
            : [
                {
                  id: 'late',
                  shortCode: 'Q-900',
                  status: 'open',
                  scheduledAt: '2099-07-01T20:00:00Z',
                  briefDocument: { title: 'Late table' },
                  participants: [seat],
                },
                {
                  id: 'gone',
                  shortCode: 'Q-901',
                  status: 'cancelled',
                  scheduledAt: '2099-07-02T20:00:00Z',
                  briefDocument: { title: 'Cancelled table' },
                  participants: [seat],
                },
              ];
        return HttpResponse.json({ data: { quests: { total: 102, items } } });
      }),
    );
    renderWithProviders(<MePage />, { route: '/me' });
    expect(await screen.findByRole('link', { name: /Late table/ })).toBeVisible();
    expect(screen.queryByText('Cancelled table')).toBeNull();
    expect(offsets).toEqual([0, 100]);
  });
});
