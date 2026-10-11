import { hasRole } from '../../utils/permissions.js';

export type BaseTier = 'Spectator' | 'Player';

export type MemberRoleForm = {
  baseTier: BaseTier;
  grantDm: boolean;
  grantArchon: boolean;
  grantLieutenant: boolean;
  grantVerifier: boolean;
  grantAdmin: boolean;
};

export function roleFormFromRoles(roles: string[]): MemberRoleForm {
  return {
    baseTier: hasRole(roles, 'player') ? 'Player' : 'Spectator',
    grantDm: hasRole(roles, 'dm'),
    grantArchon: hasRole(roles, 'archon'),
    grantLieutenant: hasRole(roles, 'lieutenant'),
    grantVerifier: hasRole(roles, 'verifier'),
    grantAdmin: hasRole(roles, 'admin'),
  };
}

export function roleFormsEqual(a: MemberRoleForm, b: MemberRoleForm): boolean {
  return (
    a.baseTier === b.baseTier &&
    a.grantDm === b.grantDm &&
    a.grantArchon === b.grantArchon &&
    a.grantLieutenant === b.grantLieutenant &&
    a.grantVerifier === b.grantVerifier &&
    a.grantAdmin === b.grantAdmin
  );
}

export function rolesFromForm(form: MemberRoleForm): string[] {
  const roles: string[] = [];
  if (form.baseTier === 'Player') roles.push('player');
  if (form.grantDm) roles.push('dm');
  if (form.grantArchon) roles.push('archon');
  if (form.grantLieutenant) roles.push('lieutenant');
  if (form.grantVerifier) roles.push('verifier');
  if (form.grantAdmin) roles.push('admin');
  return roles;
}
