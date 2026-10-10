import { describe, expect, it } from 'vitest';
import { parseRulesList } from '../../../src/features/rules/adapters/rulesAdapter.js';
import good from '../../fixtures/wire/rules/list-good.json';

describe('parseRulesList', () => {
  it('splits guides and rulings', () => {
    const result = parseRulesList(good);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.guides).toHaveLength(1);
      expect(result.data.rulings).toHaveLength(1);
    }
  });
});
