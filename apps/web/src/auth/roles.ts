/** Role gates for UI affordances. Roles come only from validated MemberViewModel. */

export type MemberRole = string;

export function hasRole(
  roles: readonly MemberRole[] | undefined,
  role: MemberRole,
): boolean {
  return Boolean(roles?.includes(role));
}

export function isAdmin(roles: readonly MemberRole[] | undefined): boolean {
  return hasRole(roles, 'admin');
}

export function canAccessVerify(roles: readonly MemberRole[] | undefined): boolean {
  return isAdmin(roles) || hasRole(roles, 'verifier');
}

export function isDm(roles: readonly MemberRole[] | undefined): boolean {
  return hasRole(roles, 'dm') || isAdmin(roles);
}

export const canAccessAdmin = isAdmin;
export const canVerify = canAccessVerify;
