import { describe, expect, it } from 'vitest';
import { parsePersonalization } from '../../../src/features/personalize/adapters/personalizationAdapter.js';
import bad from '../../fixtures/wire/personalize/bad.json';
import good from '../../fixtures/wire/personalize/good.json';

describe('personalizationAdapter', () => {
  it('parses catalog ownership and equipped state', () => {
    const result = parsePersonalization(good);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.catalog[0]?.owned).toBe(true);
    expect(result.data.catalog[1]?.owned).toBe(false);
    expect(result.data.driverProgress.playerQuestsCount).toBe(4);
    expect(result.data.dmTier).toBe('apprentice');
  });

  it('rejects bad wire', () => {
    const result = parsePersonalization(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('InvalidWire');
  });
});
