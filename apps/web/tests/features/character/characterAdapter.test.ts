import { describe, expect, it } from 'vitest';
import { parseCharacter } from '../../../src/features/character/adapters/characterAdapter.js';
import bad from '../../fixtures/wire/character/bad-missing-field.json';
import good from '../../fixtures/wire/character/good.json';

describe('parseCharacter', () => {
  it('maps the backstory id and no longer carries the retired background text', () => {
    const result = parseCharacter({ ...good, backgroundText: 'Old notes' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.backstoryId).toBe(good.backstoryId ?? null);
      expect(result.data).not.toHaveProperty('backgroundText');
    }
  });

  it('rejects missing name', () => {
    const result = parseCharacter(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('InvalidWire');
  });
});
