import type { BgEffectId } from '../context/theme.utils.js';
import type { MotionId } from '../motion/catalog.js';
export type EffectDef = {
  id: Exclude<BgEffectId, 'none'>;
  label: string;
  scope: 'ambient';
  placement: 'page-background' | 'hero-header';
  kind: 'css';
  colorTokens: readonly string[];
  loopTokens: readonly string[];
  easingToken: string;
  collapse: 'static';
  launch: boolean;
  particleCount?: number;
  motionPreset: MotionId | null;
  reuses?: 'atlas-pulse' | 'skeleton-shimmer-cascade';
};
