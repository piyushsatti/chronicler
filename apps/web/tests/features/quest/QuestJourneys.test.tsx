import { beforeEach, describe, expect, it } from 'vitest';
import { graphql, HttpResponse } from 'msw';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { server } from '../../../src/mocks/server.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { QuestDetailPage } from '../../../src/features/quest/pages/QuestDetailPage.js';
import { QuestSummaryPage } from '../../../src/features/quest/pages/QuestSummaryPage.js';
import { closeInput } from '../../../src/features/quest/components/QuestDmActions.js';
import {
  loadMyCharacters,
  loadQuest,
} from '../../../src/features/quest/adapters/questAdapter.js';
import { loadQuestSummaryPage } from '../../../src/features/quest/adapters/questSummaryAdapter.js';
import detail from '../../fixtures/wire/quest/detail-good.json';
import summaries from '../../fixtures/wire/quest/summary-documents-good.json';
import { renderWithProviders } from '../../test-utils.js';

const actorId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const characterId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const otherId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
function login() {
  localStorage.setItem(
    TOKEN_KEY,
    `${btoa('{}')}.${btoa(JSON.stringify({ sub: 'discord-dev', exp: Math.floor(Date.now() / 1000) + 3600 }))}.dev`,
  );
}
function renderDetail() {
  return renderWithProviders(
    <Routes>
      <Route path="/quests/:code" element={<QuestDetailPage />} />
    </Routes>,
    { route: '/quests/Q-101' },
  );
}
beforeEach(() => {
  localStorage.clear();
});
describe('retained Quest journeys', () => {
  it('requires actual character choice, excludes pending PCs and submits the chosen identity', async () => {
    login();
    const user = userEvent.setup();
    const inputs: unknown[] = [];
    server.use(
      graphql.query('Quest', () =>
        HttpResponse.json({
          data: { quest: { ...detail, dmId: '11111111-1111-4111-8111-111111111111' } },
        }),
      ),
      graphql.query('MyCharacters', () =>
        HttpResponse.json({
          data: {
            myCharacters: {
              total: 3,
              items: [
                { id: characterId, name: 'Lyra', shortCode: 'C1', status: 'active' },
                { id: otherId, name: 'Rook', shortCode: 'C2', status: 'active' },
                {
                  id: actorId,
                  name: 'Pending',
                  shortCode: 'C3',
                  status: 'pending_approval',
                },
              ],
            },
          },
        }),
      ),
      graphql.mutation('SignupForQuest', ({ variables }) => {
        inputs.push(variables);
        return HttpResponse.json({
          data: { signupForQuest: { characterId: otherId, status: 'waitlisted' } },
        });
      }),
    );
    renderDetail();
    await user.click(await screen.findByRole('button', { name: /^Your character/ }));
    const rook = await screen.findByRole('menuitem', { name: 'Rook' });
    expect(screen.queryByRole('menuitem', { name: /Pending/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign up' })).toBeDisabled();
    await user.click(rook);
    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(await screen.findByText('You joined the waitlist.')).toBeInTheDocument();
    expect(inputs).toEqual([
      expect.objectContaining({
        questId: detail.id,
        characterId: otherId,
        meta: { idempotencyKey: expect.any(String) },
      }),
    ]);
  });
  it('hides DM controls for an unrelated held DM and withdraws a selected own waitlist row', async () => {
    login();
    const user = userEvent.setup();
    const inputs: unknown[] = [];
    server.use(
      graphql.query('Quest', () =>
        HttpResponse.json({
          data: {
            quest: {
              ...detail,
              dmId: otherId,
              participants: [
                { ...detail.participants[0], memberId: actorId, status: 'waitlisted' },
              ],
            },
          },
        }),
      ),
      graphql.mutation('WithdrawFromQuest', ({ variables }) => {
        inputs.push(variables);
        return HttpResponse.json({
          data: { withdrawFromQuest: { characterId, status: 'withdrawn' } },
        });
      }),
    );
    renderDetail();
    await screen.findByRole('button', { name: 'Withdraw Lyra Storm' });
    expect(
      screen.queryByRole('heading', { name: 'DM controls' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Withdraw Lyra Storm' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Confirm withdrawal',
      }),
    );
    await waitFor(() => expect(inputs).toHaveLength(1));
    expect(inputs[0]).toMatchObject({ characterId, questId: detail.id });
  });
  it('moves played sessions through explicit final attendance and positive or zero PCXP closure', async () => {
    login();
    const user = userEvent.setup();
    const inputs: unknown[] = [];
    server.use(
      graphql.query('Quest', () =>
        HttpResponse.json({ data: { quest: { ...detail, status: 'played' } } }),
      ),
      graphql.mutation('CloseQuest', ({ variables }) => {
        inputs.push(variables);
        return HttpResponse.json({
          data: { closeQuest: { id: detail.id, status: 'closed' } },
        });
      }),
    );
    renderDetail();
    await screen.findByRole('button', { name: 'Review closure' });
    expect(
      screen.getByRole('group', { name: /Lyra Storm/ }),
    ).toHaveTextContent('Member (@player1)');
    expect(
      screen.queryByRole('button', { name: 'Mark played' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Attendance/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Played' }));
    await user.clear(screen.getByLabelText('PCXP award'));
    await user.type(screen.getByLabelText('PCXP award'), '3');
    await user.type(
      screen.getByLabelText('Award note (optional)'),
      'For the expedition',
    );
    await user.click(screen.getByRole('button', { name: 'Review closure' }));
    expect(
      within(screen.getByRole('dialog')).getByText(/3 PCXP awarded/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close and award PCXP' }));
    await waitFor(() => expect(inputs).toHaveLength(1));
    expect(inputs[0]).toMatchObject({
      id: detail.id,
      input: {
        attendance: [{ characterId, status: 'played' }],
        rewards: [{ characterId, pcxp: 3, note: 'For the expedition' }],
      },
    });
  });
  it('validates final attendance and awards only positive integers to played characters', () => {
    expect(closeInput([{ characterId, status: '', pcxp: '0', note: '' }])).toBeNull();
    for (const pcxp of ['-1', '1.5', '2147483648'])
      expect(
        closeInput([{ characterId, status: 'played', pcxp, note: '' }]),
      ).toBeNull();
    expect(
      closeInput([{ characterId, status: 'no_show', pcxp: '1', note: '' }]),
    ).toBeNull();
    expect(
      closeInput([{ characterId, status: 'no_show', pcxp: '0', note: '' }]),
    ).toEqual({ attendance: [{ characterId, status: 'no_show' }], rewards: [] });
    expect(closeInput([])).toEqual({ attendance: [], rewards: [] });
  });
  it('requests every owned Character page and every roster page before presenting choices/counts', async () => {
    const characterOffsets: unknown[] = [];
    const rosterOffsets: unknown[] = [];
    const chars = Array.from({ length: 51 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      name: `PC ${i}`,
      shortCode: `C${i}`,
      status: i === 50 ? 'active' : 'pending_approval',
    }));
    server.use(
      graphql.query('MyCharacters', ({ variables }) => {
        characterOffsets.push(variables.offset);
        return HttpResponse.json({
          data: {
            myCharacters: {
              items: chars.slice(variables.offset, variables.offset + variables.limit),
              total: 51,
            },
          },
        });
      }),
      graphql.query('Quest', () =>
        HttpResponse.json({
          data: {
            quest: {
              ...detail,
              participants: Array.from({ length: 100 }, () => detail.participants[0]),
            },
          },
        }),
      ),
      graphql.query('QuestParticipants', ({ variables }) => {
        rosterOffsets.push(variables.offset);
        return HttpResponse.json({
          data: {
            quest: {
              participants: [{ ...detail.participants[0], characterId: otherId }],
            },
          },
        });
      }),
    );
    expect(await loadMyCharacters()).toHaveLength(51);
    expect(characterOffsets).toEqual([0, 50]);
    expect((await loadQuest({ shortCode: 'Q-101' })).participants).toHaveLength(101);
    expect(rosterOffsets).toEqual([100]);
  });
  it('reads linked summaries by actual Quest UUID with complete pages and honest legacy totals', async () => {
    const variables: unknown[] = [];
    server.use(
      graphql.query('QuestSummaryPage', ({ variables: input }) => {
        variables.push(input);
        return HttpResponse.json({
          data: {
            questSummaries: {
              summaries:
                input.offset === 0
                  ? Array.from({ length: 50 }, () => summaries.summaries[0])
                  : [],
              totals: { totalPcxpAwarded: null, coverage: 'LEGACY_UNKNOWN' },
            },
          },
        });
      }),
    );
    const result = await loadQuestSummaryPage('Q-101');
    expect(result.documents).toHaveLength(50);
    expect(result.totals.totalPcxpAwarded).toBeNull();
    expect(variables).toEqual([
      { questId: detail.id, offset: 0 },
      { questId: detail.id, offset: 50 },
    ]);
  });
  it('links the shared summary editor using authoritative UUIDs without prose search', async () => {
    login();
    server.use(
      graphql.query('Quest', () => HttpResponse.json({ data: { quest: {
        ...detail, participants: detail.participants.map((participant) => ({ ...participant, memberId: actorId })),
      } } })),
      graphql.query('QuestSummaryPage', () =>
        HttpResponse.json({
          data: {
            questSummaries: {
              ...summaries,
              summaries: summaries.summaries.map((summary) => ({
                ...summary,
                canEditBody: false,
                canEditMetadata: true,
                effectiveBody: null,
              })),
            },
          },
        }),
      ),
    );
    renderWithProviders(
      <Routes>
        <Route path="/quests/:code/summary" element={<QuestSummaryPage />} />
      </Routes>,
      { route: '/quests/Q-101/summary' },
    );
    expect(
      await screen.findByRole('link', { name: 'Write a DM summary' }),
    ).toHaveAttribute('href', `/summaries/new?questId=${detail.id}`);
    expect(screen.getByRole('link', { name: 'Edit entry' })).toHaveAttribute(
      'href',
      `/summaries/${summaries.summaries[0].id}/edit`,
    );
    await userEvent.click(screen.getByRole('button', { name: /^Summary character/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Lyra Storm' }));
    expect(screen.getByRole('link', { name: 'Write a character summary' })).toHaveAttribute('href', `/summaries/new?questId=${detail.id}&characterId=${characterId}`);
  });

  it.each([false, true])('gives empty summaries a role-valid action, staff=%s', async (staff) => {
    if (staff) login();
    server.use(graphql.query('QuestSummaryPage', () => HttpResponse.json({
      data: { questSummaries: { ...summaries, summaries: [] } },
    })));
    renderWithProviders(
      <Routes><Route path="/quests/:code/summary" element={<QuestSummaryPage />} /></Routes>,
      { route: '/quests/Q-101/summary' },
    );
    const section = await screen.findByRole('region', { name: 'Linked summaries' });
    if (staff) {
      expect(within(section).getByRole('link', { name: 'Write a DM summary' })).toHaveAttribute('href', `/summaries/new?questId=${detail.id}`);
      expect(within(section).queryByRole('link', { name: 'Back to the quest' })).not.toBeInTheDocument();
    } else {
      expect(within(section).getByRole('link', { name: 'Back to the quest' })).toHaveAttribute('href', '/quests/Q-101');
      expect(within(section).queryByRole('link', { name: 'Write a DM summary' })).not.toBeInTheDocument();
    }
  });

});
