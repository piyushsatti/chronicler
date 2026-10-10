import { describe, expect, it } from 'vitest';
import {
  parseChronicleList,
} from '../../../src/features/chronicle/adapters/chronicleAdapter.js';
import bad from '../../fixtures/wire/chronicle/list-bad.json';
import good from '../../fixtures/wire/chronicle/list-good.json';

describe('parseChronicleList', () => {
  it('maps published summaries', () => {
    const result = parseChronicleList(good);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0]?.title).toBe('Vault Delve — Session recap');
    }
  });

  it('rejects bad wire', () => {
    expect(parseChronicleList(bad).ok).toBe(false);
  });
});
