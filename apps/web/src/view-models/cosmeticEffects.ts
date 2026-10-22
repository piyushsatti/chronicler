import { hasRole, type MemberRole } from '../auth/roles.js';
import type { MotionId } from '../motion/catalog.js';

export type CosmeticDriver = 'selection' | 'role';
export type CosmeticEffectDef = {
  id: string;
  label: string;
  scope: 'entity';
  driver: CosmeticDriver;
  roleMatch: readonly MemberRole[] | null;
  placement: 'avatar' | 'avatar-corner' | 'list-row';
  colorTokens: readonly `--color-${string}`[];
  loopTokens: readonly `--motion-${string}`[];
  easingToken: string | null;
  motionPreset: MotionId | null;
  hasMotion: boolean;
  launch: boolean;
};
const DRIVER_PRIORITY: Readonly<Record<CosmeticDriver, number>> = {
  selection: 0,
  role: 1,
};

export const COSMETIC_CATALOG: readonly CosmeticEffectDef[] = [
  {
    id: 'admin-ring',
    label: 'Admin ring',
    scope: 'entity',
    driver: 'role',
    roleMatch: ['admin'],
    placement: 'avatar',
    colorTokens: ['--color-warn'],
    loopTokens: [],
    easingToken: null,
    motionPreset: null,
    hasMotion: false,
    launch: true,
  },
  {
    id: 'verifier-glow',
    label: 'Verifier glow',
    scope: 'entity',
    driver: 'role',
    roleMatch: ['verifier'],
    placement: 'avatar',
    colorTokens: ['--color-accent'],
    loopTokens: ['--motion-loop-status-pulse'],
    easingToken: '--motion-ease-in-out',
    motionPreset: 'avatar-role-glow-hover',
    hasMotion: true,
    launch: true,
  },
  {
    id: 'dm-sigil',
    label: 'DM sigil',
    scope: 'entity',
    driver: 'role',
    roleMatch: ['dm'],
    placement: 'avatar-corner',
    colorTokens: ['--color-accent'],
    loopTokens: [],
    easingToken: null,
    motionPreset: null,
    hasMotion: false,
    launch: true,
  },
  {
    id: 'role-hairline-tint',
    label: 'Role hairline tint',
    scope: 'entity',
    driver: 'role',
    roleMatch: ['archon', 'lieutenant'],
    placement: 'list-row',
    colorTokens: ['--color-accent'],
    loopTokens: [],
    easingToken: null,
    motionPreset: null,
    hasMotion: false,
    launch: true,
  },
  {
    id: 'selection-ring',
    label: 'Selection ring',
    scope: 'entity',
    driver: 'selection',
    roleMatch: null,
    placement: 'list-row',
    colorTokens: ['--color-selected-wash'],
    loopTokens: [],
    easingToken: null,
    motionPreset: null,
    hasMotion: false,
    launch: true,
  },
];
export const LAUNCH_COSMETICS = COSMETIC_CATALOG.filter((entry) => entry.launch);
export type CosmeticEntity = { roles?: readonly MemberRole[]; selected?: boolean };

/** Presentation only. Role styling grants no permission. Selection has visual priority. */
export function resolveCosmeticEffects(
  entity: CosmeticEntity,
): readonly CosmeticEffectDef[] {
  return LAUNCH_COSMETICS.filter((entry) =>
    entry.driver === 'selection'
      ? entity.selected
      : entry.roleMatch?.some((role) => hasRole(entity.roles, role)),
  ).sort((a, b) => DRIVER_PRIORITY[a.driver] - DRIVER_PRIORITY[b.driver]);
}
export function resolveCosmeticEffect(entity: CosmeticEntity) {
  const top = resolveCosmeticEffects(entity)[0];
  return top
    ? {
        id: top.id,
        className: `cosmetic-${top.id}`,
        driver: top.driver,
        hasMotion: top.hasMotion,
      }
    : null;
}
