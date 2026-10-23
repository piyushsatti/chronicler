import { describe, expect, it } from 'vitest';
import { graphql, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileActivity } from '../../../src/features/profile/components/ProfileActivity.js';
import { TOKEN_KEY } from '../../../src/auth/storage.js';
import { server } from '../../../src/mocks/server.js';
import { renderWithProviders } from '../../test-utils.js';
import character from '../../fixtures/wire/character/good.json';

const memberId = '11111111-1111-4111-8111-111111111111';
const sharedQuestId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const roster = Array.from({ length: 9 }, (_, index) => ({
  ...character,
  id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  shortCode: `C-${index + 1}`,
}));
const questIds = roster.map((_, index) => `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);

describe('Profile quest history requests', () => {
  it('bounds character history requests to four while retaining every roster and participation page', async () => {
    const token = `${btoa('{}')}.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.test`;
    localStorage.setItem(TOKEN_KEY, token);
    let release = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let active = 0;
    let maximum = 0;
    const rosterOffsets: unknown[] = [];
    const participations: { characterId: unknown; offset: unknown; authorization: string | null }[] = [];
    server.use(
      graphql.query('CharacterDirectory', ({ variables }) => {
        const history = variables.limit === 100;
        if (history) rosterOffsets.push(variables.offset);
        const offset = Number(variables.offset);
        return HttpResponse.json({ data: { characters: { items: roster.slice(offset, offset + (history ? 5 : 24)), total: roster.length } } });
      }),
      graphql.query('ParticipationsByCharacter', async ({ variables, request }) => {
        active += 1;
        maximum = Math.max(maximum, active);
        participations.push({ characterId: variables.characterId, offset: variables.offset, authorization: request.headers.get('authorization') });
        await gate;
        active -= 1;
        const index = roster.findIndex((row) => row.id === variables.characterId);
        return HttpResponse.json({ data: { participationsByCharacter: { items: [{ questId: variables.offset === 0 ? sharedQuestId : questIds[index], status: 'accepted' }], total: 2 } } });
      }),
      graphql.query('CharacterHistoryQuest', ({ variables }) => {
        const index = questIds.indexOf(String(variables.id));
        return HttpResponse.json({ data: { quest: { shortCode: index < 0 ? 'shared' : `Q-${index + 1}`, briefDocument: { title: index < 0 ? 'Shared quest' : `Quest ${index + 1}` }, scheduledAt: null } } });
      }),
    );
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<ProfileActivity memberId={memberId} owner={false} about={<p>About</p>} />);
    await user.click(screen.getByRole('tab', { name: 'Quest history' }));
    try {
      await waitFor(() => expect(participations).toHaveLength(4));
      expect(maximum).toBe(4);
    } finally {
      release();
    }
    expect(await screen.findByRole('link', { name: 'Quest 9' })).toHaveAttribute('href', '/quests/Q-9');
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(maximum).toBeLessThanOrEqual(4);
    expect(rosterOffsets).toEqual([0, 5]);
    expect(participations).toHaveLength(18);
    for (const row of roster) {
      expect(participations.filter((call) => call.characterId === row.id).map((call) => call.offset)).toEqual([0, 1]);
    }
    expect(participations.every((call) => call.authorization === `Bearer ${token}`)).toBe(true);
    expect(screen.getAllByRole('link', { name: 'Shared quest' })).toHaveLength(1);
    for (let number = 1; number <= 9; number += 1) {
      expect(screen.getByRole('link', { name: `Quest ${number}` })).toHaveAttribute('href', `/quests/Q-${number}`);
    }
  });

  it('does not dispatch another character batch after cancellation', async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let active = 0;
    const requested: unknown[] = [];
    server.use(
      graphql.query('CharacterDirectory', () => HttpResponse.json({ data: { characters: { items: roster, total: roster.length } } })),
      graphql.query('ParticipationsByCharacter', async ({ variables }) => {
        requested.push(variables.characterId);
        active += 1;
        await gate;
        active -= 1;
        return HttpResponse.json({ data: { participationsByCharacter: { items: [], total: 0 } } });
      }),
    );
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<ProfileActivity memberId={memberId} owner={false} about={<p>About</p>} />);
    await user.click(screen.getByRole('tab', { name: 'Quest history' }));
    try {
      await waitFor(() => expect(requested).toHaveLength(4));
      await queryClient.cancelQueries({ queryKey: ['profileHistory', memberId] });
    } finally {
      release();
    }
    await waitFor(() => expect(active).toBe(0));
    expect(requested).toEqual(roster.slice(0, 4).map((row) => row.id));
    expect(queryClient.getQueryData(['profileHistory', memberId])).toBeUndefined();
  });
});
