import { describe, expect, it } from 'vitest';
import {
  parseCharacterSummaries,
  parseCoPlayers,
  parseParticipations,
} from '../../../src/features/character/adapters/characterTabsAdapter.js';

describe('characterTabsAdapter', () => {
  it('parses co-players', () => {
    const result = parseCoPlayers({
      items: [{ handle: 'alex', displayName: 'Alex', sharedQuests: 2 }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data[0]?.label).toBe('Alex');
  });

  it('parses summaries', () => {
    const result = parseCharacterSummaries({
      items: [{ slug: 'vault', title: 'Vault notes', questShortCode: 'Q-1' }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data[0]?.href).toBe('/summaries/vault');
  });

  it('parses participations', () => {
    const result = parseParticipations({
      items: [{ questShortCode: 'Q-101', questTitle: 'Siege', status: 'played' }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data[0]?.label).toBe('Siege');
  });
});
