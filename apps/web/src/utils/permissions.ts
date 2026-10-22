/** Ownership helpers; role affordances share the validated-account authority. */
import { isAdmin, type MemberRole } from '../auth/roles.js';

export { hasRole } from '../auth/roles.js';

/** Owner check against v2 member id (not Discord id). */
export function isCharacterOwner(
  memberId: string | null | undefined,
  ownerId: string | null | undefined,
): boolean {
  return Boolean(memberId && ownerId && memberId === ownerId);
}

export function canEditOwned(
  memberId: string | null | undefined,
  ownerId: string | null | undefined,
  roles: readonly MemberRole[] | undefined,
): boolean {
  return isCharacterOwner(memberId, ownerId) || isAdmin(roles);
}
