import type { PointcrawlNodeState } from '../../api/graphql.operations.gen.js';

export type NodeState = PointcrawlNodeState;

/**
 * Hex state is an admin-set exploration label (owner decision 2026-10-28). It is
 * display only: it never hides a hex or changes who can open it. New hexes start Locked.
 */
export const NODE_STATES = [
  'LOCKED',
  'UNLOCKED',
  'MAPPED',
] as const satisfies readonly NodeState[];

const LABELS: Record<NodeState, string> = {
  LOCKED: 'Locked',
  UNLOCKED: 'Unlocked',
  MAPPED: 'Mapped',
};

const MEANINGS: Record<NodeState, string> = {
  LOCKED: 'Not yet open to play',
  UNLOCKED: 'Open to play',
  MAPPED: 'Explored and charted',
};

export function nodeStateLabel(state: NodeState): string {
  return LABELS[state];
}

export function nodeStateMeaning(state: NodeState): string {
  return MEANINGS[state];
}
