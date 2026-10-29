import { describe, expect, it } from 'vitest';
import { roleFormFromRoles, rolesFromForm } from '../../../src/features/admin/personRoles.js';

describe('member role forms', () => {
  it('guest role roundtrips through bulk forms', () => {
    for (const roles of [['guest'], ['guest', 'dm', 'verifier'], ['guest', 'player', 'archon', 'admin']]) {
      expect(rolesFromForm(roleFormFromRoles(roles))).toEqual(roles);
    }
  });

  it.each([
    [[], 'Spectator'],
    [['guest'], 'Guest'],
    [['player'], 'Player'],
    [['guest', 'player'], 'Guest + Player'],
  ])('shows the base roles for %j as %s', (roles, label) => {
    expect(roleFormFromRoles(roles).baseTier).toBe(label);
  });
});
