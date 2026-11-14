import { beforeEach, describe, expect, it, vi } from 'vitest';
import { graphqlRequest } from '../../../src/api/graphql.js';
import { loadUpcomingSignups } from '../../../src/features/member/adapters/memberHubAdapter.js';

vi.mock('../../../src/api/graphql.js', () => ({ graphqlRequest: vi.fn() }));

const FROM = '2099-01-01T00:00:00.000Z';
const MEMBER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('loadUpcomingSignups', () => {
  beforeEach(() => vi.mocked(graphqlRequest).mockReset());

  it('loads seats then quests in two requests and omits past or withdrawn rows', async () => {
    const future = Array.from({ length: 60 }, (_, index) => {
      const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
      return {
        questId: id,
        status: 'signed_up',
        characterName: `Hero ${index}`,
        quest: {
          id,
          shortCode: `Q-${index}`,
          status: 'open',
          scheduledAt: `2099-06-01T20:00:${String(index).padStart(2, '0')}Z`,
          briefDocument: { title: `Quest ${index}` },
        },
      };
    });
    const waitlisted = {
      questId: '00000000-0000-4000-8000-000000000096',
      status: 'waitlisted',
      characterName: 'Queued',
      quest: {
        id: '00000000-0000-4000-8000-000000000096',
        shortCode: 'Q-wait',
        status: 'open',
        scheduledAt: '2099-06-01T21:02:00Z',
        briefDocument: { title: 'Waitlisted quest' },
      },
    };
    const omitted = [
      {
        questId: '00000000-0000-4000-8000-000000000099',
        status: 'withdrawn',
        characterName: 'Gone',
        quest: {
          id: '00000000-0000-4000-8000-000000000099',
          shortCode: 'Q-gone',
          status: 'open',
          scheduledAt: '2099-06-01T21:00:00Z',
          briefDocument: { title: 'Withdrawn quest' },
        },
      },
      {
        questId: '00000000-0000-4000-8000-000000000098',
        status: 'no_show',
        characterName: 'Missed',
        quest: {
          id: '00000000-0000-4000-8000-000000000098',
          shortCode: 'Q-missed',
          status: 'open',
          scheduledAt: '2099-06-01T21:01:00Z',
          briefDocument: { title: 'No-show quest' },
        },
      },
      {
        questId: '00000000-0000-4000-8000-000000000097',
        status: 'signed_up',
        characterName: 'Past',
        quest: {
          id: '00000000-0000-4000-8000-000000000097',
          shortCode: 'Q-past',
          status: 'completed',
          scheduledAt: '2098-06-01T20:00:00Z',
          briefDocument: { title: 'Past quest' },
        },
      },
    ];
    const seats = [...future, waitlisted, ...omitted];
    vi.mocked(graphqlRequest)
      .mockResolvedValueOnce({
        myQuestSignups: {
          total: seats.length,
          items: seats.map(({ questId, status, characterName }) => ({
            questId,
            status,
            characterName,
          })),
        },
      })
      .mockResolvedValueOnce({
        quests: {
          total: seats.length,
          items: seats.map((row) => row.quest),
        },
      });

    const loaded = await loadUpcomingSignups(MEMBER, FROM);
    expect(graphqlRequest).toHaveBeenCalledTimes(2);
    expect(vi.mocked(graphqlRequest).mock.calls[0]?.[1]).toEqual({
      from: FROM,
      limit: 100,
      offset: 0,
    });
    expect(vi.mocked(graphqlRequest).mock.calls[1]?.[1]).toEqual({
      ids: [
        ...future.map((row) => row.questId),
        waitlisted.questId,
        omitted[2]!.questId,
      ],
      limit: 100,
      offset: 0,
    });
    expect(loaded).toHaveLength(61);
    expect(loaded.map((row) => row.questId)).toEqual([
      ...future.map((row) => row.questId),
      waitlisted.questId,
    ]);
    expect(loaded.some((row) => row.characterName === 'Queued')).toBe(true);
    expect(loaded.some((row) => row.characterName === 'Gone')).toBe(false);
    expect(loaded.some((row) => row.characterName === 'Missed')).toBe(false);
    expect(loaded.some((row) => row.characterName === 'Past')).toBe(false);
  });
});
