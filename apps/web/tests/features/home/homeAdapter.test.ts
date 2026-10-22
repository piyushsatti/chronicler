import { describe, expect, it } from 'vitest';
import { parseSiteStats } from '../../../src/features/home/adapters/homeAdapter.js';
import goodStats from '../../fixtures/wire/stats/good.json';
import badStats from '../../fixtures/wire/stats/bad-wrong-type.json';

describe('parseSiteStats', () => {
  it('accepts campaign quest and active character counts', () => {
    const result = parseSiteStats(goodStats);
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.data).toEqual({ totalQuests: 412, activeCharacters: 200 });
  });

  it('rejects wrong type', () => {
    const result = parseSiteStats(badStats);
    expect(result.ok).toBe(false);
  });
});
