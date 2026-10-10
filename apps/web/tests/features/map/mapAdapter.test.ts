import { describe, expect, it } from 'vitest';
import { parseMapBundle } from '../../../src/features/map/adapters/mapAdapter.js';
import bad from '../../fixtures/wire/map/bad-missing-field.json';
import good from '../../fixtures/wire/map/good.json';
import viewGood from '../../fixtures/wire/map/view-good.json';

describe('parseMapBundle', () => {
  it('joins map hexes with feature places', () => {
    const result = parseMapBundle(good, viewGood);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.hexes).toHaveLength(2);
      expect(result.data.hexes[0]?.features[0]?.title).toBe('Tree of Light');
    }
  });

  it('rejects bad map wire', () => {
    expect(parseMapBundle(bad, viewGood).ok).toBe(false);
  });
});
