import type { EffectDef } from './types.js';

export const EFFECT_CATALOG = [
  {
    id: 'starfield-twinkle',
    scope: 'ambient',
    label: 'Starfield',
    placement: 'page-background',
    kind: 'css',
    colorTokens: ['--color-accent', '--color-text-muted'],
    loopTokens: ['--motion-loop-starfield'],
    easingToken: '--motion-ease-in-out',
    collapse: 'static',
    launch: true,
    particleCount: 60,
    motionPreset: 'hero-ambient-parallax-drift',
  },
  {
    id: 'glow-pulse',
    scope: 'ambient',
    label: 'Glow pulse',
    placement: 'page-background',
    kind: 'css',
    colorTokens: ['--color-hero-glow'],
    loopTokens: ['--motion-loop-status-pulse'],
    easingToken: '--motion-ease-in-out',
    collapse: 'static',
    launch: true,
    motionPreset: 'quest-status-pulse-live',
    reuses: 'atlas-pulse',
  },
  {
    id: 'gradient-sweep',
    scope: 'ambient',
    label: 'Gradient sweep',
    placement: 'page-background',
    kind: 'css',
    colorTokens: ['--color-accent', '--color-text-muted'],
    loopTokens: ['--motion-loop-shimmer'],
    easingToken: '--motion-ease-in-out',
    collapse: 'static',
    launch: true,
    motionPreset: 'skeleton-shimmer-cascade',
    reuses: 'skeleton-shimmer-cascade',
  },
] as const satisfies readonly EffectDef[];

const EFFECT_BY_ID: Map<string, EffectDef> = new Map(
  EFFECT_CATALOG.map((e) => [e.id, e]),
);

export type { EffectDef } from './types.js';
export function effectById(id: string): EffectDef | undefined {
  return EFFECT_BY_ID.get(id);
}
