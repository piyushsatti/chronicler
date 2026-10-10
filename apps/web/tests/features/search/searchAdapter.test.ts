import { describe, expect, it } from 'vitest';
import {
  parseSearch,
  parseSearchKinds,
} from '../../../src/features/search/adapters/searchAdapter.js';
import bad from '../../fixtures/wire/search/bad-missing-field.json';
import good from '../../fixtures/wire/search/good.json';
import kinds from '../../fixtures/wire/search/kinds-good.json';

describe('parseSearch', () => {
  it('flattens documents and members', () => {
    const result = parseSearch(good);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0]?.title).toBe('Tree of Light');
      expect(result.data[1]?.kind).toBe('member');
    }
  });

  it('rejects bad wire', () => {
    expect(parseSearch(bad).ok).toBe(false);
  });
});

describe('parseSearchKinds', () => {
  it('accepts a string array', () => {
    const result = parseSearchKinds(kinds);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toContain('codex');
  });
});
