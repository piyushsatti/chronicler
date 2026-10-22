/**
 * tokens.ts — token NAME constants only (#471 / B10). Values live in
 * ../styles/motion.css as `--motion-*` custom properties; the ms/s comments
 * below are documentation only — check-motion.mjs strips comments before its
 * "no bespoke numeric literal" scan, so they never count as a value.
 */

export const MOTION_DURATION_TOKENS = {
  // Route (row 2): 250ms out / 300ms in.
  routeOut: '--motion-duration-route-out',
  routeIn: '--motion-duration-route-in',
  // Orchestration (row 1): 600-900ms whole-shell cascade.
  bootCascade: '--motion-duration-boot-cascade',
  // Orchestration→interaction-band exception (row 3): 350ms per-item.
  staggerItem: '--motion-duration-stagger-item',
  // Interaction (row 4): 150ms hover lift+tilt.
  hoverLift: '--motion-duration-hover-lift',
  // Interaction (row 8): 250ms in / 200ms out toast choreography.
  toastIn: '--motion-duration-toast-in',
  toastOut: '--motion-duration-toast-out',
  // Interaction (row 9): 250ms modal scale.
  modalScale: '--motion-duration-modal-scale',
  // Interaction (row 10): 200ms tab underline glide.
  tabGlide: '--motion-duration-tab-glide',
  // Orchestration (row 13): 500ms + 600ms dm-dashboard cascade waves.
  dmWave1: '--motion-duration-dm-wave-1',
  dmWave2: '--motion-duration-dm-wave-2',
  // Interaction (row 18): 300ms error shake (3 decaying cycles).
  errorShake: '--motion-duration-error-shake',
  // Orchestration (row 19): 800ms countup reveal.
  countup: '--motion-duration-countup',
  // Interaction (row 20): 200ms in / 150ms out chip pop.
  chipIn: '--motion-duration-chip-in',
  chipOut: '--motion-duration-chip-out',
  // Orchestration→interaction-band exception (row 24): 200ms per-row.
  resultMaterialize: '--motion-duration-result-materialize',
  // Celebration (row 5), later data, ships per #471's accept criterion: 800ms.
  publishBurst: '--motion-duration-publish-burst',
  // Later data (rows 6,7,11,14,21,22,23,25) — declared for catalog completeness.
  sealStamp: '--motion-duration-seal-stamp', // 500ms
  unlockShine: '--motion-duration-unlock-shine', // 700ms
  reorderFlip: '--motion-duration-reorder-flip', // 300ms
  avatarGlow: '--motion-duration-avatar-glow', // 200ms
  timelineMomentum: '--motion-duration-timeline-momentum', // 300ms
  badgeDing: '--motion-duration-badge-ding', // 250ms
  backstoryUnfurl: '--motion-duration-backstory-unfurl', // 350ms
} as const;

export const MOTION_EASING_TOKENS = {
  out: '--motion-ease-out',
  outBack: '--motion-ease-out-back',
  inOut: '--motion-ease-in-out',
  linear: '--motion-ease-linear',
  outExpo: '--motion-ease-out-expo',
} as const;

export const MOTION_AMPLITUDE_TOKENS = {
  hoverLiftDistance: '--motion-amplitude-hover-lift', // 4px
  hoverTiltAngle: '--motion-amplitude-hover-tilt', // 2deg
  routeShift: '--motion-amplitude-route-shift', // 8px
  cardScaleFrom: '--motion-amplitude-card-scale-from', // 0.96
  modalScaleFrom: '--motion-amplitude-modal-scale-from', // 0.95
  chipScaleFrom: '--motion-amplitude-chip-scale-from', // 0.8
  shakeDistance: '--motion-amplitude-shake-distance', // 6px
  burstScale: '--motion-amplitude-burst-scale', // 1.08
} as const;

export const MOTION_STAGGER_TOKENS = {
  bootHero: '--motion-stagger-boot-hero',
  questCard: '--motion-stagger-quest-card', // 40ms
  shimmerBar: '--motion-stagger-shimmer-bar', // 80ms
  resultRow: '--motion-stagger-result-row', // 15ms
} as const;

export const MOTION_DELAY_TOKENS = {
  modalContent: '--motion-delay-modal-content', // 50ms
  backstoryContent: '--motion-delay-backstory-content', // 100ms
} as const;

export const MOTION_LOOP_TOKENS = {
  shimmer: '--motion-loop-shimmer', // 1.2s
  heroParallax: '--motion-loop-hero-parallax', // 20-40s
  emptyBob: '--motion-loop-empty-bob', // 3s
  statusPulse: '--motion-loop-status-pulse', // 1.8s
  starfield: '--motion-loop-starfield', // 6s
} as const;
