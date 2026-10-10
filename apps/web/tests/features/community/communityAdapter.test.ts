import { describe, expect, it } from 'vitest';
import { parseCommunityDirectory } from '../../../src/features/community/adapters/communityAdapter.js';
import good from '../../fixtures/wire/community/directory-good.json';

describe('parseCommunityDirectory', () => {
  it('splits dms and players', () => {
    const result = parseCommunityDirectory(good);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.dms).toHaveLength(1);
      expect(result.data.players).toHaveLength(1);
    }
  });
});
