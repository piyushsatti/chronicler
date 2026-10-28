import { useId } from 'react';
import type { NodeState } from '../nodeState.js';
import styles from './nodeState.module.css';

/** The hatch a Locked hex is filled with. `size` is the stripe spacing in user units. */
export function LockedHatchPattern({ id, size }: { id: string; size: number }) {
  return (
    <pattern
      id={id}
      width={size}
      height={size}
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(45)"
    >
      <rect className={styles.lockedWash} width={size} height={size} />
      <line className={styles.lockedHatch} x1="0" y1="0" x2="0" y2={size} />
    </pattern>
  );
}

/** One hex cell drawn in a state's style, positioned by the caller. */
export function NodeStateCell({
  state,
  points,
  hatchId,
}: {
  state: NodeState;
  points: string;
  hatchId: string;
}) {
  return (
    <polygon
      className={styles.stateCell}
      data-node-state={state}
      points={points}
      fill={state === 'LOCKED' ? `url(#${hatchId})` : undefined}
      vectorEffect="non-scaling-stroke"
    />
  );
}

const SWATCH_HEX = '9,0 4.5,7.794 -4.5,7.794 -9,0 -4.5,-7.794 4.5,-7.794';

/** A small hex drawn the way the map draws a hex in this state, for the key and sidebar. */
export function NodeStateSwatch({ state }: { state: NodeState }) {
  const hatchId = `hex-hatch-${useId().replaceAll(':', '')}`;
  return (
    <svg className={styles.swatch} viewBox="-10 -10 20 20" aria-hidden="true">
      <defs>
        <LockedHatchPattern id={hatchId} size={4} />
      </defs>
      <NodeStateCell state={state} points={SWATCH_HEX} hatchId={hatchId} />
    </svg>
  );
}
