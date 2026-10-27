import { describe, expect, it } from 'vitest';
import { canCreateRecord, createNeedsLiveDm } from '../../src/auth/createRules.js';

const guest = undefined;
const player = { roles: ['player'], liveDm: false };
const pendingDm = { roles: ['dm'], liveDm: false };
const liveDm = { roles: ['dm'], liveDm: true };
const admin = { roles: ['admin'], liveDm: false };
const member = { roles: [], liveDm: false };

describe('canCreateRecord', () => {
  it.each([
    ['guest', guest, false],
    ['player', player, false],
    ['live DM', liveDm, false],
    ['admin', admin, true],
  ])('hall-of-fame is for admins only: %s → %s', (_name, actor, allowed) => {
    expect(canCreateRecord('hall-of-fame', actor)).toBe(allowed);
  });

  it.each([
    ['guest', guest, false],
    ['member without a role', member, false],
    ['player', player, true],
    ['DM whose profile is not approved', pendingDm, false],
    ['live DM', liveDm, true],
    ['admin', admin, true],
  ])('summary: %s → %s', (_name, actor, allowed) => {
    expect(canCreateRecord('summary', actor)).toBe(allowed);
  });

  it.each([
    ['guest', guest, false],
    ['player', player, false],
    ['DM whose profile is not approved', pendingDm, false],
    ['live DM', liveDm, true],
    ['admin', admin, true],
  ])('quest follows LiveDM, not the role: %s → %s', (_name, actor, allowed) => {
    expect(canCreateRecord('quest', actor)).toBe(allowed);
  });

  it('keeps DM tables to the DM role, stricter than the API', () => {
    expect(canCreateRecord('dm-table', player)).toBe(false);
    expect(canCreateRecord('dm-table', pendingDm)).toBe(true);
    expect(canCreateRecord('dm-table', admin)).toBe(true);
  });

  it('waits on the DM profile only when roles cannot answer', () => {
    expect(createNeedsLiveDm('quest', ['dm'])).toBe(true);
    expect(createNeedsLiveDm('quest', ['dm', 'admin'])).toBe(false);
    expect(createNeedsLiveDm('quest', ['player'])).toBe(false);
    expect(createNeedsLiveDm('summary', ['dm'])).toBe(true);
    expect(createNeedsLiveDm('summary', ['player', 'dm'])).toBe(false);
    expect(createNeedsLiveDm('dm-table', ['dm'])).toBe(false);
  });
});
