import { describe, expect, it } from 'vitest';
import { parseCharacter } from '../../../src/features/character/adapters/characterAdapter.js';
import bad from '../../fixtures/wire/character/bad-missing-field.json';
import good from '../../fixtures/wire/character/good.json';

describe('parseCharacter', () => {
  it('maps character without Background field', () => {
    const result = parseCharacter(good, 'Child of the Weeping');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.backstoryName).toBe('Child of the Weeping');
      expect(result.data).not.toHaveProperty('backgroundText');
    }
  });

  it('rejects missing name', () => {
    const result = parseCharacter(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('InvalidWire');
  });
});
