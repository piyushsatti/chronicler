import { describe, expect, it } from 'vitest';
import {
  parseHome,
  parseSiteStats,
} from '../../../src/features/home/adapters/homeAdapter.js';
import goodHome from '../../fixtures/wire/home/good.json';
import badHome from '../../fixtures/wire/home/bad-missing-field.json';
import emptyHome from '../../fixtures/wire/home/empty-list.json';
import goodStats from '../../fixtures/wire/stats/good.json';
import badStats from '../../fixtures/wire/stats/bad-wrong-type.json';

describe('parseHome', () => {
  it('accepts good wire and derives heading', () => {
    const result = parseHome(goodHome);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.headingTitle).toBe('Siege of Kraghold');
      expect(result.data.recentByCategory).toHaveLength(1);
    }
  });

  it('rejects missing title', () => {
    const result = parseHome(badHome);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('InvalidWire');
  });

  it('empty list yields null heading', () => {
    const result = parseHome(emptyHome);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.headingTitle).toBeNull();
  });
});

describe('parseSiteStats', () => {
  it('accepts totalMembers', () => {
    const result = parseSiteStats(goodStats);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.totalMembers).toBe(42);
  });

  it('rejects wrong type', () => {
    const result = parseSiteStats(badStats);
    expect(result.ok).toBe(false);
  });
});
