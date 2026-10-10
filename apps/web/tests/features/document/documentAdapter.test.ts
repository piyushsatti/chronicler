import { describe, expect, it } from 'vitest';
import { parseDocument } from '../../../src/features/document/adapters/documentAdapter.js';
import bad from '../../fixtures/wire/document/bad-missing-field.json';
import good from '../../fixtures/wire/document/good.json';

describe('parseDocument', () => {
  it('maps document body', () => {
    const result = parseDocument(good);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.title).toBe('Tree of Light');
      expect(result.data.body).toContain('Tree stands');
    }
  });

  it('rejects bad wire', () => {
    expect(parseDocument(bad).ok).toBe(false);
  });
});
