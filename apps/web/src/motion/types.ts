import type {
  MOTION_DURATION_TOKENS,
  MOTION_EASING_TOKENS,
  MOTION_AMPLITUDE_TOKENS,
  MOTION_STAGGER_TOKENS,
  MOTION_DELAY_TOKENS,
  MOTION_LOOP_TOKENS,
} from './tokens.js';
type ValueOf<T> = T[keyof T];
export type MotionEntry = {
  /** Stable Legacy row identity. Retired row 21 is deliberately absent. */
  n: number;
  id: string;
  tier: 'interaction' | 'orchestration' | 'celebration' | 'continuous' | 'route';
  surface: string;
  durationTokens: readonly ValueOf<typeof MOTION_DURATION_TOKENS>[];
  staggerToken?: ValueOf<typeof MOTION_STAGGER_TOKENS>;
  staggerCap?: number;
  delayToken?: ValueOf<typeof MOTION_DELAY_TOKENS>;
  easingToken: ValueOf<typeof MOTION_EASING_TOKENS>;
  amplitudeTokens?: readonly ValueOf<typeof MOTION_AMPLITUDE_TOKENS>[];
  loopToken?: ValueOf<typeof MOTION_LOOP_TOKENS>;
  collapse: 'static' | 'instant' | 'no-stagger';
  eventKeyed?: boolean;
  firstLoadOnly?: boolean;
  launch: boolean;
};
