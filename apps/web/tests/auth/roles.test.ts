import { describe, expect, it } from 'vitest';
import {
  canAccessAdmin,
  canAccessVerify,
  canVerify,
  hasRole,
  isAdmin,
  isDm,
} from '../../src/auth/roles.js';
import * as permissions from '../../src/utils/permissions.js';

describe('validated-account role affordances', () => {
  it.each([
    [undefined, false, false, false],
    [[], false, false, false],
    [['player'], false, false, false],
    [['verifier'], false, true, false],
    [['dm'], false, false, true],
    [['admin'], true, true, true],
    [['archon', 'lieutenant'], false, false, false],
  ] as const)(
    'keeps admin, review, and DM capabilities separate: %j',
    (roles, admin, review, dm) => {
      expect(isAdmin(roles)).toBe(admin);
      expect(canAccessAdmin(roles)).toBe(admin);
      expect(canAccessVerify(roles)).toBe(review);
      expect(canVerify(roles)).toBe(review);
      expect(isDm(roles)).toBe(dm);
    },
  );

  it('uses one set of role functions across legacy import paths', () => {
    expect(permissions.isAdmin).toBe(isAdmin);
    expect(permissions.canVerify).toBe(canAccessVerify);
    expect(permissions.canAccessAdmin).toBe(canAccessAdmin);
    expect(permissions.hasRole).toBe(hasRole);
  });
});
