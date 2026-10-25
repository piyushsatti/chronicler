import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { graphql, HttpResponse } from 'msw';
import { MePage } from '../../../src/features/member/pages/MePage.js';
import { server } from '../../../src/mocks/server.js';
import { signIn } from '../admin/authority-test-utils.js';
import { renderWithProviders } from '../../test-utils.js';
import character from '../../fixtures/wire/character/good.json';

async function notesHeading(): Promise<HTMLElement> {
  return screen.findByRole('heading', { level: 2, name: 'Notes' });
}

describe('MePage', () => {
  it('is the personal hub: identity, account actions, real stats, tabs', async () => {
    signIn(['player', 'dm']);
    renderWithProviders(<MePage />, { route: '/me' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ashwin' }),
    ).toBeVisible();
    expect(screen.queryByText(/@ashwin/)).toBeNull();
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
    const stats = await screen.findByLabelText('Your stats');
    const cards = within(stats).getAllByRole('listitem');
    expect(
      cards.map((card) => card.querySelector('.type-caption')?.textContent),
    ).toEqual(['Voice hours', 'Quests played', 'Messages', 'Characters', 'Member for']);
    expect(cards[0]).toHaveTextContent('0m');
    expect(cards[1]).toHaveTextContent('3');
    const tabs = screen.getByRole('navigation', { name: 'Your account sections' });
    expect(
      Array.from(tabs.querySelectorAll('a')).map((tab) => tab.textContent),
    ).toEqual([
      'Overview',
      'Characters',
      'Quest history',
      'Summaries',
      'Notes',
      'Settings',
    ]);
    expect(within(tabs).getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(tabs).getByRole('link', { name: 'Characters' })).toHaveAttribute(
      'href',
      '/me/characters',
    );
    expect(within(tabs).getByRole('link', { name: 'Quest history' })).toHaveAttribute(
      'href',
      '/me/history',
    );
    expect(within(tabs).getByRole('link', { name: 'Summaries' })).toHaveAttribute(
      'href',
      '/me/summaries',
    );
    expect(within(tabs).getByRole('link', { name: 'Notes' })).toHaveAttribute(
      'href',
      '/me/notes',
    );
    expect(within(tabs).getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/me/settings',
    );
    expect(screen.getByRole('link', { name: 'Personalize' })).toHaveAttribute(
      'href',
      '/me/personalize',
    );
    const since = screen.getByRole('region', { name: 'Since you joined' });
    expect(since).toHaveTextContent('1Summaries written');
    expect(since).toHaveTextContent('Joined');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();
    expect(await screen.findByRole('link', { name: 'DM dashboard' })).toBeVisible();
  });

  it('omits Since you joined when there is nothing beyond the join date', async () => {
    signIn(['player']);
    server.use(
      graphql.query('MemberHub', () =>
        HttpResponse.json({
          data: {
            member: {
              id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              joinedAt: '2026-01-05T10:00:00Z',
              avatarUrl: null,
            },
            memberActivityStats: {
              questsPlayed: 0,
              summariesAuthored: 0,
              messages: 0,
              voiceMinutes: 0,
              longestSessionHours: null,
              recentSessions: [],
            },
          },
        }),
      ),
    );
    renderWithProviders(<MePage />, { route: '/me' });
    await screen.findByLabelText('Your stats');
    expect(screen.queryByRole('heading', { name: 'Since you joined' })).toBeNull();
  });

  it("lists the member's summaries as recent activity, newest first, linking to each", async () => {
    signIn(['player']);
    const day = 24 * 60 * 60 * 1000;
    const item = (id: string, slug: string, title: string, ago: number) => ({
      id,
      slug,
      title,
      publishedAt: new Date(Date.now() - ago * day).toISOString(),
    });
    server.use(
      graphql.query('ProfileActivity', () =>
        HttpResponse.json({
          data: {
            memberActivityStats: { questsPlayed: 2, summariesAuthored: 2 },
            documents: {
              total: 2,
              items: [
                item(
                  '11111111-1111-4111-8111-111111111111',
                  'old-tale',
                  'Old tale',
                  40,
                ),
                item(
                  '22222222-2222-4222-8222-222222222222',
                  'hound-of-culann',
                  'The Hound of Culann',
                  2,
                ),
              ],
            },
          },
        }),
      ),
    );
    renderWithProviders(<MePage />, { route: '/me' });
    const link = await screen.findByRole('link', {
      name: /The Hound of Culann — Summary/,
    });
    expect(link).toHaveAttribute('href', '/summaries/hound-of-culann');
    expect(link).toHaveTextContent('Written 2 days ago');
    const links = within(
      screen.getByRole('region', { name: 'Recent activity' }),
    ).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/summaries/hound-of-culann',
      '/summaries/old-tale',
    ]);
  });

  it('opens the tab named in the URL and keeps it there', async () => {
    signIn(['player']);
    renderWithProviders(<MePage />, { route: '/me/notes' });
    expect(await notesHeading()).toBeVisible();
    expect(screen.getAllByRole('heading', { level: 2, name: 'Notes' })).toHaveLength(1);
    const sections = screen.getByRole('navigation', { name: 'Your account sections' });
    expect(within(sections).getByRole('link', { current: 'page' })).toHaveTextContent(
      'Notes',
    );
    expect(screen.queryByRole('link', { name: 'DM dashboard' })).toBeNull();
    await userEvent.click(within(sections).getByRole('link', { name: 'Overview' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Nothing here yet' }),
    ).toBeVisible();
  });

  it('preserves recent activity from member hub reads', async () => {
    signIn(['player']);
    server.use(
      graphql.query('MemberHub', () =>
        HttpResponse.json({
          data: {
            member: {
              id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              joinedAt: '2026-01-05T10:00:00Z',
              avatarUrl: null,
            },
            memberActivityStats: {
              questsPlayed: 1,
              summariesAuthored: 0,
              messages: 0,
              voiceMinutes: 0,
              longestSessionHours: null,
              recentSessions: [
                {
                  kind: 'The Salt Stair',
                  occurredAt: '2026-10-22T18:00:00Z',
                  amount: 1,
                },
              ],
            },
          },
        }),
      ),
    );
    renderWithProviders(<MePage />, { route: '/me' });
    expect(
      await screen.findByRole('heading', { name: 'Recent activity' }),
    ).toBeVisible();
    expect(await screen.findByText('The Salt Stair')).toBeVisible();
  });

  it('shows DM tables, series and upcoming quests from the shared dashboard query', async () => {
    signIn(['dm']);
    server.use(
      graphql.query('DmDashboard', () =>
        HttpResponse.json({
          data: {
            dmStats: { sessionCount: 2 },
            questArcs: {
              total: 1,
              items: [
                {
                  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                  name: 'Harbor tales',
                  createdBy: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                  questCount: 2,
                },
              ],
            },
            quests: {
              total: 1,
              items: [
                {
                  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                  shortCode: 'Q-91',
                  status: 'open',
                  scheduledAt: '2098-01-01T19:00:00Z',
                  slotsMax: 5,
                  filledCount: 0,
                  briefDocument: { title: 'The next voyage' },
                },
              ],
            },
            documents: {
              total: 1,
              items: [
                {
                  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
                  slug: 'harbor-guide',
                  title: 'Harbor guide',
                  status: 'published',
                  authorId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                  canEditMetadata: true,
                  canEditBody: true,
                },
              ],
            },
          },
        }),
      ),
    );
    renderWithProviders(<MePage />, { route: '/me' });
    expect(await screen.findByRole('link', { name: 'Harbor guide' })).toHaveAttribute(
      'href',
      '/community/dm-table/harbor-guide',
    );
    expect(screen.getByRole('link', { name: 'Harbor tales' })).toHaveAttribute(
      'href',
      '/series/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    expect(screen.getByRole('link', { name: 'The next voyage' })).toHaveAttribute(
      'href',
      '/quests/Q-91',
    );
    expect(screen.getByRole('link', { name: 'DM dashboard' })).toHaveAttribute(
      'href',
      '/dm',
    );
  });

  it.each([1, 27])(
    'discovers and counts all %i runnable DM quests after 25 closed quests',
    async (runnableCount) => {
      signIn(['dm']);
      const quests = Array.from({ length: 25 + runnableCount }, (_, index) => ({
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        shortCode: `Q-${index}`,
        status: index < 25 ? 'closed' : 'open',
        scheduledAt: '2098-01-01T19:00:00Z',
        slotsMax: 5,
        filledCount: 0,
        briefDocument: {
          title: index < 25 ? `Closed ${index}` : `Runnable ${index - 24}`,
        },
      }));
      const offsets: number[] = [];
      server.use(
        graphql.query('DmDashboard', ({ variables }) => {
          const offset = Number(variables.questOffset);
          offsets.push(offset);
          return HttpResponse.json({
            data: {
              dmStats: { sessionCount: 0 },
              questArcs: { total: 0, items: [] },
              quests: {
                total: quests.length,
                items: quests.slice(offset, offset + Number(variables.questLimit)),
              },
              documents: { total: 0, items: [] },
            },
          });
        }),
      );
      renderWithProviders(<MePage />, { route: '/me' });
      expect(await screen.findByRole('link', { name: 'Runnable 1' })).toHaveAttribute(
        'href',
        '/quests/Q-25',
      );
      const card = screen.getByRole('heading', { name: 'Quests to run' })
        .parentElement as HTMLElement;
      expect(
        within(card).getByText(
          `${runnableCount} ${runnableCount === 1 ? 'quest' : 'quests'}`,
        ),
      ).toBeVisible();
      expect(screen.queryByText('Closed 0')).toBeNull();
      expect(offsets).toEqual(runnableCount === 1 ? [0, 25] : [0, 25, 50]);
    },
  );

  it.each([['player'], ['dm']])(
    'explains a failed member-hub read and retries stats for %s',
    async (...roles) => {
      signIn(roles);
      let hubReads = 0;
      server.use(
        graphql.query('MemberHub', () => {
          hubReads += 1;
          return hubReads === 1
            ? HttpResponse.error()
            : HttpResponse.json({
                data: {
                  member: {
                    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                    joinedAt: '2026-01-05T10:00:00Z',
                    avatarUrl: null,
                  },
                  memberActivityStats: {
                    questsPlayed: 7,
                    summariesAuthored: 0,
                    messages: 0,
                    voiceMinutes: 0,
                    longestSessionHours: null,
                    recentSessions: [],
                  },
                },
              });
        }),
      );
      renderWithProviders(<MePage />, { route: '/me' });
      const retry = await screen.findByRole('button', { name: 'Retry your stats' });
      expect(retry.closest('[role="alert"]')).toHaveTextContent(
        /could|connect|wrong|network|reach/i,
      );
      expect(screen.queryByLabelText('Your stats')).toBeNull();
      await userEvent.click(retry);
      expect(await screen.findByLabelText('Your stats')).toHaveTextContent(
        '7Quests played',
      );
      expect(screen.queryByRole('button', { name: 'Retry your stats' })).toBeNull();
      expect(hubReads).toBe(2);
    },
  );

  it('keeps DM creation actions and owned characters visible when hosted work is empty', async () => {
    signIn(['dm']);
    server.use(
      graphql.query('DmDashboard', () =>
        HttpResponse.json({
          data: {
            dmStats: { sessionCount: 0 },
            questArcs: { total: 0, items: [] },
            quests: { total: 0, items: [] },
            documents: { total: 0, items: [] },
          },
        }),
      ),
      graphql.query('MemberRoster', () =>
        HttpResponse.json({
          data: {
            myCharacters: {
              total: 1,
              items: [
                {
                  id: 'owned',
                  shortCode: 'C-OWN',
                  name: 'Wren Ashdown',
                  status: 'active',
                  imageUrl: null,
                  ddbMirror: null,
                },
              ],
            },
          },
        }),
      ),
      graphql.query('MemberMyPrivateNotes', () =>
        HttpResponse.json({
          data: {
            myPrivateNotes: {
              body: '## Lighthouse clue\n\n**Keep the keeper’s secret.**',
              updatedAt: '2026-10-22T09:00:00Z',
            },
          },
        }),
      ),
    );
    renderWithProviders(<MePage />, { route: '/me' });
    expect(
      await screen.findByRole('heading', { name: 'Your tables, series and quests' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'New DM table' })).toHaveAttribute(
      'href',
      '/editor/dm-table',
    );
    expect(screen.getByRole('link', { name: 'Create a series' })).toHaveAttribute(
      'href',
      '/series/new',
    );
    const character = await screen.findByRole('link', { name: /Wren Ashdown/ });
    expect(character).toHaveAttribute('href', '/characters/C-OWN');
    expect(character.querySelector('[data-component="Avatar"]')).toHaveTextContent(
      'WA',
    );
    expect(screen.getByRole('heading', { name: 'Lighthouse clue' })).toBeVisible();
    expect(screen.getByText('Keep the keeper’s secret.').tagName).toBe('STRONG');
    expect(screen.queryByRole('heading', { name: 'Nothing here yet' })).toBeNull();
  });

  it('redirects legacy /me tab query variants to their matching route', async () => {
    signIn(['player']);
    renderWithProviders(<MePage />, { route: '/me?tab=characters' });
    expect(await screen.findByRole('heading', { name: 'Characters' })).toBeVisible();
    expect(
      within(
        screen.getByRole('navigation', { name: 'Your account sections' }),
      ).getByRole('link', { name: 'Characters' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('collapses empty player sections into one dashboard prompt with relevant actions', async () => {
    signIn(['player']);
    renderWithProviders(<MePage />, { route: '/me' });
    expect(
      await screen.findByRole('heading', { name: 'Nothing here yet' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Find a quest' })).toHaveAttribute(
      'href',
      '/quests',
    );
    expect(screen.getByRole('link', { name: 'Create a character' })).toHaveAttribute(
      'href',
      '/characters?new=1',
    );
    expect(screen.getByRole('link', { name: 'Add private notes' })).toHaveAttribute(
      'href',
      '/me/notes',
    );
    expect(screen.queryByRole('link', { name: 'DM dashboard' })).toBeNull();
    expect(screen.queryByText('No upcoming sign-ups.')).toBeNull();
    expect(screen.queryByText('You have no characters yet.')).toBeNull();
  });

  it('renders an empty sign-up row with its action beside the message', async () => {
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
                  ddbMirror: null,
                },
              ],
            },
          },
        }),
      ),
    );
    renderWithProviders(<MePage />, { route: '/me' });
    const section = await screen.findByRole('region', { name: 'Upcoming sign-ups' });
    const message = await within(section).findByText('No upcoming sign-ups.');
    const row = message.parentElement as HTMLElement;
    expect(row.className).toContain('signupEmpty');
    expect(within(row).getByRole('link', { name: 'Find a quest' })).toHaveAttribute(
      'href',
      '/quests',
    );
    expect(section.querySelector('[data-component="EmptyState"]')).toBeNull();
    expect(screen.getByLabelText('Your stats')).toHaveTextContent('1Characters');
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
    renderWithProviders(<MePage />, { route: '/me/characters' });
    await screen.findByRole('heading', { level: 1, name: 'Ashwin' });
    expect(screen.queryByRole('banner')).toBeNull();
    const card = await screen.findByRole('link', { name: /Wren Ashdown/ });
    expect(card).toHaveAttribute('href', '/characters/C-1');
    expect(card).toHaveTextContent('Rogue 3 · Elf');
    expect(card.querySelector('h3')?.nextElementSibling).toHaveTextContent('Approved');
    expect(card.querySelector('[data-component="Avatar"]')).toHaveTextContent('WA');
    const toolbar = screen.getByRole('region', { name: 'Your account' });
    expect(within(toolbar).getByText('1 character')).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Characters' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '1 character' })).toBeNull();
    expect(screen.queryByText('The characters linked to your account.')).toBeNull();
    expect(
      within(toolbar).getByRole('link', { name: 'Create a character' }),
    ).toHaveAttribute('href', '/characters?new=1');
  });

  it("lists the member's quest history inside the Quest history tab", async () => {
    signIn(['player']);
    const characterId = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';
    const questId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const owners: unknown[] = [];
    server.use(
      graphql.query('CharacterDirectory', ({ variables }) => {
        owners.push((variables.filters as { ownerId?: string } | undefined)?.ownerId);
        return HttpResponse.json({
          data: {
            characters: { items: [{ ...character, id: characterId }], total: 1 },
          },
        });
      }),
      graphql.query('ParticipationsByCharacter', () =>
        HttpResponse.json({
          data: {
            participationsByCharacter: {
              items: [{ questId, status: 'accepted' }],
              total: 1,
            },
          },
        }),
      ),
      graphql.query('CharacterHistoryQuest', () =>
        HttpResponse.json({
          data: {
            quest: {
              shortCode: 'Q-7',
              briefDocument: { title: 'The Salt Stair' },
              scheduledAt: null,
            },
          },
        }),
      ),
    );
    renderWithProviders(<MePage />, { route: '/me/history' });
    const quests = await screen.findByRole('list', { name: 'Your quests' });
    expect(
      within(quests).getByRole('link', { name: /The Salt Stair/ }),
    ).toHaveAttribute('href', '/quests/Q-7');
    expect(
      owners.every((owner) => owner === 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
    ).toBe(true);
    const sections = screen.getByRole('navigation', { name: 'Your account sections' });
    expect(within(sections).getByRole('link', { current: 'page' })).toHaveTextContent(
      'Quest history',
    );
    const toolbar = screen.getByRole('region', { name: 'Your account' });
    expect(within(toolbar).getByText('1 quest')).toBeVisible();
    expect(within(toolbar).getByRole('link', { name: 'Find a quest' })).toHaveAttribute(
      'href',
      '/quests',
    );
  });

  it("lists only the member's own summaries inside the Summaries tab", async () => {
    signIn(['player']);
    const authors: unknown[] = [];
    server.use(
      graphql.query('ProfileActivity', ({ variables }) => {
        authors.push(variables.memberId ?? variables.authorId);
        return HttpResponse.json({
          data: {
            memberActivityStats: { questsPlayed: 1, summariesAuthored: 1 },
            documents: {
              total: 1,
              items: [
                {
                  id: '22222222-2222-4222-8222-222222222222',
                  slug: 'hound-of-culann',
                  title: 'The Hound of Culann',
                  publishedAt: '2026-10-20T10:00:00Z',
                },
              ],
            },
          },
        });
      }),
    );
    renderWithProviders(<MePage />, { route: '/me/summaries' });
    const grid = await screen.findByRole('list', { name: 'Your summaries' });
    expect(
      within(grid).getByRole('link', { name: /The Hound of Culann/ }),
    ).toHaveAttribute('href', '/summaries/hound-of-culann');
    expect(authors).toContain('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    const toolbar = screen.getByRole('region', { name: 'Your account' });
    expect(within(toolbar).getByText('1 summary')).toBeVisible();
    expect(
      within(toolbar).getByRole('link', { name: 'Write a summary' }),
    ).toHaveAttribute('href', '/summaries/new');
  });

  it('omits character detail copy when no mirror details are available', async () => {
    signIn(['player']);
    server.use(
      graphql.query('MemberRoster', () =>
        HttpResponse.json({
          data: {
            myCharacters: {
              total: 1,
              items: [
                {
                  id: 'c2',
                  shortCode: 'C-2',
                  name: 'Moss Willow',
                  status: 'active',
                  imageUrl: null,
                  ddbMirror: null,
                },
              ],
            },
          },
        }),
      ),
    );
    renderWithProviders(<MePage />, { route: '/me/characters' });
    const card = await screen.findByRole('link', { name: /Moss Willow/ });
    expect(card.querySelector('.type-caption')).toBeNull();
    expect(card).not.toHaveTextContent('Character');
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
