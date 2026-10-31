import { describe, expect, it } from 'vitest';
import { QUEST_SIGNUP_TYPES, signupTypeLabel } from '../../src/utils/questVocabulary.js';

describe('quest signup types', () => {
  it('offers exactly Last Game Played and DM pick', () => {
    expect(QUEST_SIGNUP_TYPES).toEqual([
      ['last_game_played', 'Last Game Played'],
      ['dm_pick', 'DM pick'],
    ]);
    expect(signupTypeLabel('last_game_played')).toBe('Last Game Played');
    expect(signupTypeLabel('dm_pick')).toBe('DM pick');
  });
});
