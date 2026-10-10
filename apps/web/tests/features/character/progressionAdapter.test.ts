import { describe, expect, it } from 'vitest';
import { parseProgression } from '../../../src/features/character/adapters/progressionAdapter.js';
import bad from '../../fixtures/wire/character/progression-bad.json';
import good from '../../fixtures/wire/character/progression-good.json';

describe('parseProgression', () => {
  it('maps entries', () => {
    const result = parseProgression(good);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0]?.amount).toBe(100);
    }
  });

  it('rejects bad wire', () => {
    expect(parseProgression(bad).ok).toBe(false);
  });
});
