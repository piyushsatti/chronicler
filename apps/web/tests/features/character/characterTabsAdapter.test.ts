import { describe, expect, it } from 'vitest';
import {
  parseCharacterSummaries,
  parseCoPlayers,
  parseParticipations,
} from '../../../src/features/character/adapters/characterTabsAdapter.js';

describe('characterTabsAdapter', () => {
  it('parses co-players', () => {
    const result = parseCoPlayers({
      items: [
        {
          characterId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          memberId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          questCount: 2,
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0]?.sharedQuests).toBe(2);
      expect(result.data[0]?.key).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    }
  });

  it('parses summaries', () => {
    const result = parseCharacterSummaries({
      items: [
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          slug: 'vault',
          title: 'Vault notes',
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data[0]?.href).toBe('/summaries/vault');
  });

  it('names each participation by its quest, not by the character', () => {
    const played = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const untitled = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const hidden = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const row = (questId: string) => ({
      questId,
      status: 'played',
      characterName: 'Lyra',
      createdAt: '2026-01-01T18:00:00Z',
    });
    const result = parseParticipations(
      { items: [row(played), row(untitled), row(hidden)] },
      {
        [played]: {
          shortCode: 'Q-7',
          title: 'The Salt Stair',
          scheduledAt: '2026-01-03T18:00:00Z',
        },
        [untitled]: { shortCode: 'Q-8', title: null, scheduledAt: null },
        [hidden]: null,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((item) => item.label)).toEqual([
      'The Salt Stair',
      'Q-8',
      'Quest not available',
    ]);
    expect(result.data.some((item) => item.label === 'Lyra')).toBe(false);
    expect(result.data[0]).toMatchObject({
      href: '/quests/Q-7',
      scheduledAt: '2026-01-03T18:00:00Z',
    });
    expect(result.data[2]?.href).toBeNull();
  });
});
