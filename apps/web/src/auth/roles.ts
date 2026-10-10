/** Role gates for UI affordances. Roles come only from validated MemberViewModel. */

export function isAdmin(roles: readonly string[]): boolean {
  return roles.includes('admin');
}

export function canAccessVerify(roles: readonly string[]): boolean {
  return isAdmin(roles) || roles.includes('verifier');
}

export function isDm(roles: readonly string[]): boolean {
  return roles.includes('dm') || isAdmin(roles);
}
