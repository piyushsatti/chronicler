import { describe, expect, it } from 'vitest';
import { parseProfileHub } from '../../../src/features/profile/adapters/profileCommunityAdapter.js';
import bad from '../../fixtures/wire/community/directory-bad.json';
import good from '../../fixtures/wire/community/directory-good.json';

describe('parseProfileHub', () => {
  it('splits dms and players from directory wire', () => {
    const result = parseProfileHub(good);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.dms[0]?.handle).toBe('mira');
    expect(result.data.players[0]?.handle).toBe('player1');
    expect(result.data.memberCount).toBe(2);
  });

  it('rejects bad directory wire', () => {
    const result = parseProfileHub(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('InvalidWire');
  });
});
