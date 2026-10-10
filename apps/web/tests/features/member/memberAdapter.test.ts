import { describe, expect, it } from 'vitest';
import { parseMe } from '../../../src/features/member/adapters/memberAdapter.js';
import goodMe from '../../fixtures/wire/me/good.json';
import badMe from '../../fixtures/wire/me/bad-missing-field.json';

describe('parseMe', () => {
  it('parses roles from members/me wire', () => {
    const result = parseMe(goodMe);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.roles).toEqual(['player', 'dm']);
    }
  });

  it('rejects incomplete wire', () => {
    expect(parseMe(badMe).ok).toBe(false);
  });
});
