export type EffectDef = {
  id: string;
  particleCount?: number;
};

export const EFFECT_CATALOG: readonly EffectDef[] = [
  { id: 'starfield-twinkle', particleCount: 24 },
  { id: 'glow-pulse', particleCount: 0 },
  { id: 'gradient-sweep', particleCount: 0 },
];

export function effectById(id: string): EffectDef | undefined {
  return EFFECT_CATALOG.find((e) => e.id === id);
}
