import { graphql, http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { GRAPHQL_PATH } from '../../../src/api/endpoints.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { QuestDetailPage } from '../../../src/features/quest/pages/QuestDetailPage.js';
import { server } from '../../../src/mocks/server.js';
import detailGood from '../../fixtures/wire/quest/detail-good.json';
import goodMe from '../../fixtures/wire/me/good.json';
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

  it('uses the guest role from MemberMe to explain the signup requirement', async () => {
    seedToken();
    server.use(
      graphql.query('MemberMe', () =>
        HttpResponse.json({
          data: {
            memberMe: {
              ...goodMe,
              id: '11111111-1111-4111-8111-111111111111',
              roles: ['guest'],
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
      await screen.findByText(/first character approved to unlock quest signup/),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Sign up' })).not.toBeInTheDocument();
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
    expect(
      within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Q-101'),
    ).toBeInTheDocument();
    expect(await screen.findByText('The Marches')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit quest' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Cancel quest' }),
    ).not.toBeInTheDocument();
    // Discord delivery sync is an operator signal, hidden from guests and players.
    expect(screen.queryByText(/Discord/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Sign in to join this quest' }),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-page-region="summary"]')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Quest Details' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('region', { name: 'Quest description' })).toHaveTextContent(
      'A real projected quest brief.',
    );
    expect(screen.getByRole('region', { name: 'Dungeon Master' })).toHaveTextContent(
      'Mira',
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Cast' }));
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
    await userEvent.click(screen.getByRole('tab', { name: 'Cast' }));
    expect(screen.getByText('Played by Mira (@player1)')).toBeInTheDocument();
    expect(screen.getByText('Played by Mira (@player2)')).toBeInTheDocument();
  });

  it('surfaces pending Discord as async status while keeping signup available', async () => {
    seedToken();
    server.use(
      graphql.query('MemberMe', () =>
        HttpResponse.json({
          data: {
            memberMe: {
              ...goodMe,
              id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
              roles: ['player', 'admin'],
            },
          },
        }),
      ),
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
    expect(await screen.findByText('Updating the Discord post…')).toBeInTheDocument();
    const delivery = document.querySelector('[data-el="quest.discordDelivery"]');
    expect(delivery).toHaveAttribute('data-terminal', '0');
    expect(delivery).toHaveAttribute('role', 'status');
    expect(await screen.findByRole('button', { name: 'Join waitlist' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /^Your character/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Lyra Storm' }));
    expect(screen.getByRole('button', { name: 'Join waitlist' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Sign up' })).not.toBeInTheDocument();
  });

  it('lists linked places in quest details and omits the row when none are linked', async () => {
    const hex = '12121212-1212-4121-8121-121212121212';
    const stair = '34343434-3434-4343-8343-343434343434';
    server.use(
      graphql.query('Quest', () =>
        HttpResponse.json({
          data: {
            quest: {
              ...detailGood,
              pointcrawlLinks: [
                { pointcrawlNodeId: hex, role: 'expected', name: 'LFR7008' },
                { pointcrawlNodeId: stair, role: 'visited', name: 'Salt Stair' },
                { pointcrawlNodeId: hex, role: 'visited', name: 'LFR7008' },
                { pointcrawlNodeId: '56565656-5656-4565-8565-565656565656', role: 'expected', name: '   ' },
              ],
            },
          },
        }),
      ),
    );
    const listed = renderWithProviders(
      <Routes>
        <Route path="/quests/:code" element={<QuestDetailPage />} />
      </Routes>,
      { route: '/quests/Q-101' },
    );
    const details = await screen.findByRole('region', { name: 'Quest details' });
    expect(within(details).getByText('Places').nextElementSibling).toHaveTextContent(
      /^LFR7008, Salt Stair$/,
    );
    listed.unmount();

    server.use(
      graphql.query('Quest', () => HttpResponse.json({ data: { quest: detailGood } })),
    );
    renderWithProviders(
      <Routes>
        <Route path="/quests/:code" element={<QuestDetailPage />} />
      </Routes>,
      { route: '/quests/Q-101' },
    );
    const empty = await screen.findByRole('region', { name: 'Quest details' });
    expect(within(empty).queryByText('Place')).not.toBeInTheDocument();
    expect(within(empty).queryByText('Places')).not.toBeInTheDocument();
  });

  it('shows the quest kinds and signup type in the details', async () => {
    server.use(
      graphql.query('Quest', () =>
        HttpResponse.json({
          data: {
            quest: {
              ...detailGood,
              kinds: ['one_shot', 'event'],
              signupType: 'dm_pick',
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
    const details = await screen.findByRole('region', { name: 'Quest details' });
    const kinds = within(details).getByText('Kinds');
    expect(kinds.nextElementSibling).toHaveTextContent('One-shot, Event');
    const signup = within(details).getByText('Signup type');
    expect(signup.nextElementSibling).toHaveTextContent('DM pick');
  });

  it('shows the quest post extra information under Additional information', async () => {
    server.use(
      graphql.query('Quest', () =>
        HttpResponse.json({
          data: {
            quest: {
              ...detailGood,
              briefDocument: {
                ...detailGood.briefDocument,
                frontmatter: { additional_info: 'Bring a backup character.' },
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
    const extra = await screen.findByRole('region', { name: 'Additional information' });
    expect(within(extra).getByText('Bring a backup character.')).toBeInTheDocument();
    expect(within(extra).getByText('lightfall')).toBeInTheDocument();
  });

  it('shows the quest tags under Additional information', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/quests/:code" element={<QuestDetailPage />} />
      </Routes>,
      { route: '/quests/Q-101' },
    );
    const extra = await screen.findByRole('region', { name: 'Additional information' });
    expect(within(extra).getByText('lightfall')).toBeInTheDocument();
  });

  it('omits Additional information for an untagged quest', async () => {
    server.use(
      graphql.query('Quest', () =>
        HttpResponse.json({
          data: {
            quest: {
              ...detailGood,
              tags: [],
              briefDocument: {
                ...detailGood.briefDocument,
                frontmatter: { additional_info: '   ' },
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
    expect(
      await screen.findByRole('region', { name: 'Quest details' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Additional information' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('lightfall')).not.toBeInTheDocument();
  });

  it('shows signup empty-state when authenticated with no characters', async () => {
    seedToken();
    server.use(
      graphql.query('MemberMe', () =>
        HttpResponse.json({
          data: { memberMe: { ...goodMe, id: '11111111-1111-4111-8111-111111111111', roles: ['player'] } },
        }),
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
          : HttpResponse.json({
              data: {
                memberMe: {
                  ...goodMe,
                  id: '11111111-1111-4111-8111-111111111111',
                  roles: ['player'],
                },
              },
            }),
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
    await userEvent.click(screen.getByRole('tab', { name: 'Cast' }));
    expect(
      within(screen.getByRole('tabpanel')).getByText('No one has signed up yet.'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('tabpanel')).getByText('No one is waiting.'),
    ).toBeInTheDocument();
  });

  it('shows open seats when the only signups are waitlisted', async () => {
    server.use(
      graphql.query('Quest', () =>
        HttpResponse.json({
          data: {
            quest: {
              ...detailGood,
              filledCount: 0,
              participants: [{ ...detailGood.participants[0], status: 'waitlisted' }],
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
    await userEvent.click(await screen.findByRole('tab', { name: 'Cast' }));
    const roster = screen.getByRole('region', { name: 'Roster' });
    expect(within(roster).getByText('No one has a seat yet.')).toBeInTheDocument();
    expect(within(roster).getByText('4 open seats')).toBeInTheDocument();
    expect(within(roster).queryByText('No one has signed up yet.')).not.toBeInTheDocument();
    expect(within(roster).queryByText('Lyra Storm')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Waitlist' })).getByText('Lyra Storm'),
    ).toBeInTheDocument();
  });

  it('splits the cast into seated players and the waitlist', async () => {
    server.use(
      graphql.query('Quest', () =>
        HttpResponse.json({
          data: {
            quest: {
              ...detailGood,
              participants: [
                detailGood.participants[0],
                {
                  ...detailGood.participants[0],
                  characterId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
                  characterName: 'Rook Vale',
                  status: 'waitlisted',
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
    await userEvent.click(await screen.findByRole('tab', { name: 'Cast' }));
    expect(
      within(screen.getByRole('region', { name: 'Roster' })).getByText('Lyra Storm'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Waitlist' })).getByText('Rook Vale'),
    ).toBeInTheDocument();
    expect(screen.getByText('Waitlist · 1 waiting')).toBeInTheDocument();
  });

  it('omits withdrawn players from the signup list', async () => {
    server.use(
      graphql.query('Quest', () =>
        HttpResponse.json({
          data: {
            quest: {
              ...detailGood,
              participants: [
                detailGood.participants[0],
                {
                  ...detailGood.participants[0],
                  characterId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
                  characterName: 'Rook Vale',
                  status: 'withdrawn',
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
    await userEvent.click(await screen.findByRole('tab', { name: 'Cast' }));
    const roster = screen.getByRole('region', { name: 'Roster' });
    expect(within(roster).getByText('Lyra Storm')).toBeInTheDocument();
    expect(within(roster).queryByText('Rook Vale')).not.toBeInTheDocument();
    expect(within(roster).queryByText('Withdrawn')).not.toBeInTheDocument();
  });

  it.each([
    ['last_game_played', true],
    ['dm_pick', false],
  ])(
    'explains the waitlist order for signup type %s',
    async (signupType, explained) => {
      server.use(
        graphql.query('Quest', () =>
          HttpResponse.json({
            data: {
              quest: {
                ...detailGood,
                signupType,
                participants: [
                  {
                    ...detailGood.participants[0],
                    characterId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
                    characterName: 'Rook Vale',
                    status: 'waitlisted',
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
      await userEvent.click(await screen.findByRole('tab', { name: 'Cast' }));
      const waitlist = screen.getByRole('region', { name: 'Waitlist' });
      const note = within(waitlist).queryByText(/Ordered automatically/);
      if (explained) expect(note).toBeInTheDocument();
      else expect(note).not.toBeInTheDocument();
    },
  );

  it.each([
    ['last_game_played', true],
    ['dm_pick', false],
  ] as const)(
    'shows days since last played on the waitlist for %s',
    async (signupType, shown) => {
      const lastPlayedAt = new Date(Date.now() - (5 * 86_400_000 + 3_600_000)).toISOString();
      server.use(
        graphql.query('Quest', () =>
          HttpResponse.json({
            data: {
              quest: {
                ...detailGood,
                signupType,
                participants: [
                  { ...detailGood.participants[0], lastPlayedAt },
                  {
                    ...detailGood.participants[0],
                    characterId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
                    characterName: 'Rook Vale',
                    memberId: '22222222-2222-4222-8222-222222222222',
                    status: 'waitlisted',
                    lastPlayedAt: null,
                  },
                  {
                    ...detailGood.participants[0],
                    characterId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
                    characterName: 'Nyx Ash',
                    memberId: '33333333-3333-4333-8333-333333333333',
                    status: 'waitlisted',
                    lastPlayedAt,
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
      await userEvent.click(await screen.findByRole('tab', { name: 'Cast' }));
      const waitlist = screen.getByRole('region', { name: 'Waitlist' });
      const roster = screen.getByRole('region', { name: 'Roster' });
      for (const label of ['New', '5 days']) {
        if (shown) expect(within(waitlist).getByText(label)).toBeInTheDocument();
        else expect(within(waitlist).queryByText(label)).not.toBeInTheDocument();
        expect(within(roster).queryByText(label)).not.toBeInTheDocument();
      }
    },
  );

  it('shows the DM house rules from their profile in the Table Rules tab', async () => {
    server.use(
      graphql.query('MemberProfile', ({ variables }) =>
        HttpResponse.json({
          data: {
            memberProfile: {
              member: {
                id: detailGood.dmId,
                handle: variables.handle,
                displayName: 'Mira',
                avatarUrl: null,
                roles: ['dm'],
                status: 'active',
                joinedAt: '2026-01-01T00:00:00Z',
              },
              dmProfile: {
                memberId: detailGood.dmId,
                tagline: null,
                philosophy: null,
                houseRules: '1. No evil alignments.\n2. Phones away at the table.',
                tableInfo: null,
                acceptingPlayers: true,
                status: 'approved',
                reviewRevision: 1,
              },
              availability: [],
              activitySummary: { voiceMinutes: 0, messages: 0, reactions: 0 },
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
    await userEvent.click(await screen.findByRole('tab', { name: 'Table Rules' }));
    const rules = await screen.findByRole('region', { name: 'Table rules' });
    expect(await within(rules).findByText('No evil alignments.')).toBeInTheDocument();
    expect(within(rules).getByText('Phones away at the table.')).toBeInTheDocument();
    expect(within(rules).getByText('From @mira’s DM profile')).toBeInTheDocument();
  });

  it('shows an empty state when the DM has no house rules', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/quests/:code" element={<QuestDetailPage />} />
      </Routes>,
      { route: '/quests/Q-101' },
    );
    await userEvent.click(await screen.findByRole('tab', { name: 'Table Rules' }));
    const rules = await screen.findByRole('region', { name: 'Table rules' });
    expect(
      await within(rules).findByText(/hasn’t published any table rules/),
    ).toBeInTheDocument();
  });

  it('hides the signup panel from the DM who owns the quest', async () => {
    seedToken();
    renderWithProviders(
      <Routes>
        <Route path="/quests/:code" element={<QuestDetailPage />} />
      </Routes>,
      { route: '/quests/Q-101' },
    );
    expect(await screen.findByRole('link', { name: 'Edit quest' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Your participation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign up' })).not.toBeInTheDocument();
  });

  it('keeps withdraw for a DM who already holds seats and skips signup', async () => {
    seedToken();
    server.use(
      graphql.query('Quest', () =>
        HttpResponse.json({
          data: {
            quest: {
              ...detailGood,
              participants: [
                { ...detailGood.participants[0], memberId: detailGood.dmId },
                {
                  ...detailGood.participants[0],
                  memberId: detailGood.dmId,
                  characterId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
                  characterName: 'Rook Vale',
                },
              ],
            },
          },
        }),
      ),
      graphql.query('MyCharacters', () =>
        HttpResponse.json({
          data: {
            myCharacters: {
              total: 1,
              items: [
                {
                  id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
                  name: 'Spare',
                  shortCode: 'C-9',
                  status: 'active',
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
    const card = await screen.findByRole('region', { name: 'Your participation' });
    expect(card).toHaveAttribute('id', 'participation');
    expect(within(card).getByRole('button', { name: 'Withdraw Lyra Storm' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Withdraw Rook Vale' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign up' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Your character/ })).not.toBeInTheDocument();
  });

  it('renders no signup panel while the signed-in member is still loading', async () => {
    seedToken();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      graphql.query('MemberMe', async () => {
        await gate;
        return HttpResponse.json({ data: { memberMe: goodMe } });
      }),
    );
    renderWithProviders(
      <Routes>
        <Route path="/quests/:code" element={<QuestDetailPage />} />
      </Routes>,
      { route: '/quests/Q-101' },
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Siege of Kraghold' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Your participation' })).not.toBeInTheDocument();
    expect(screen.queryByText('Loading your characters…')).not.toBeInTheDocument();
    expect(screen.queryByText('Your sign-up')).not.toBeInTheDocument();
    release();
    expect(await screen.findByRole('link', { name: 'Edit quest' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Your participation' })).not.toBeInTheDocument();
  });

  it('offers Edit and Cancel quest to the owner and confirms cancellation', async () => {
    seedToken();
    const inputs: unknown[] = [];
    server.use(
      graphql.mutation('TransitionQuestStatus', ({ variables }) => {
        inputs.push(variables);
        return HttpResponse.json({
          data: { transitionQuestStatus: { id: detailGood.id, status: 'cancelled' } },
        });
      }),
    );
    renderWithProviders(
      <Routes>
        <Route path="/quests/:code" element={<QuestDetailPage />} />
      </Routes>,
      { route: '/quests/Q-101' },
    );
    expect(await screen.findByRole('link', { name: 'Edit quest' })).toHaveAttribute(
      'href',
      '/quests/Q-101/edit',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel quest' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }),
    );
    await waitFor(() => expect(inputs).toHaveLength(1));
    expect(inputs[0]).toMatchObject({ id: detailGood.id, to: 'cancelled' });
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
