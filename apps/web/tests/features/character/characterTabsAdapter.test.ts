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

  it('parses participations', () => {
    const result = parseParticipations({
      items: [
        {
          questId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          status: 'played',
          characterName: 'Lyra',
          createdAt: '2026-01-01T18:00:00Z',
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data[0]?.label).toBe('Lyra');
  });
});
