import { canAccessVerify, hasRole, isAdmin, isDm } from './roles.js';

export type CreateKind =
  | 'quest'
  | 'dm-table'
  | 'guide'
  | 'ruling'
  | 'summary'
  | 'codex'
  | 'demo';

/** `liveDm` is the API's LiveDM: the dm role and an approved DM profile (see useLiveDm). */
export type CreateActor = { roles: readonly string[]; liveDm: boolean };

/**
 * Who may start a new record. This gate is UX only, so nobody is offered a form
 * or a "Create …" link the server will refuse. The API stays authoritative
 * (`apps/api/internal/platform/auth/policy.go`), and these rules restate it
 * as closely as the web can see:
 *
 * - quest: LiveDM or admin, as `ruleQuestCreate`.
 * - summary: player, LiveDM or admin, as `ruleSummary` (the server also checks
 *   the quest and character relationships, which the form handles).
 * - guide, ruling: the rules editors use the server's review proof
 *   (`useCurrentAccess('review')`); this role check is only its fallback.
 * - dm-table: deliberately STRICTER than the API. The API lets any member create
 *   a community/dm_table document; the web offers it to DMs (role only, admin
 *   included) because a table page is a DM's listing. Open owner decision,
 *   recorded in the night decisions log.
 * - codex, demo: open; the server decides by ownership and category.
 *
 * The web reads roles and DM-profile status from the same live member reads
 * the API uses, but it cannot see every fact (an inactive account, a policy
 * change mid-session). A save the server refuses still shows its error.
 */
export function canCreateRecord(kind: CreateKind, actor: CreateActor | undefined): boolean {
  const roles = actor?.roles;
  const liveDm = actor?.liveDm === true;
  switch (kind) {
    case 'quest':
      return isAdmin(roles) || liveDm;
    case 'dm-table':
      return isDm(roles);
    case 'guide':
    case 'ruling':
      return canAccessVerify(roles);
    case 'summary':
      return hasRole(roles, 'player') || liveDm || isAdmin(roles);
    default:
      return true;
  }
}

/** True when roles alone cannot answer and the DM-profile read decides. */
export function createNeedsLiveDm(kind: CreateKind, roles: readonly string[]): boolean {
  return (
    (kind === 'quest' || kind === 'summary') &&
    hasRole(roles, 'dm') &&
    !canCreateRecord(kind, { roles, liveDm: false })
  );
}
