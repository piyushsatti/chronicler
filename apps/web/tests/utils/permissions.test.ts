import { describe, expect, it } from 'vitest';
import {
  canAccessAdmin,
  canEditOwned,
  canVerify,
  isAdmin,
  isCharacterOwner,
} from '../../src/utils/permissions.js';

describe('permissions', () => {
  it('detects admin and verify roles', () => {
    expect(isAdmin(['admin'])).toBe(true);
    expect(canVerify(['verifier'])).toBe(true);
    expect(canAccessAdmin(['player'])).toBe(false);
    expect(canAccessAdmin(['verifier'])).toBe(false);
  });

  it('detects character ownership and edit rights', () => {
    const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    expect(isCharacterOwner(owner, owner)).toBe(true);
    expect(canEditOwned(owner, owner, ['player'])).toBe(true);
    expect(canEditOwned('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', owner, ['admin'])).toBe(
      true,
    );
    expect(
      canEditOwned('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', owner, ['player']),
    ).toBe(false);
  });
});
