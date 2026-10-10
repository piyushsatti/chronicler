/**
 * Pure exploration rules (product intent; not yet on the wire).
 * Locked / Unlocked / Mapped. Center + ring 1 start unlocked.
 * Mapped after 3 games on a hex unlocks six neighbors.
 */

export type HexExplorationState = 'locked' | 'unlocked' | 'mapped';

export type HexNode = {
  hexcode: string;
  ring: number;
  neighbors: string[];
};

export type ExplorationState = Record<string, HexExplorationState>;

export function initialExploration(nodes: HexNode[]): ExplorationState {
  const state: ExplorationState = {};
  for (const node of nodes) {
    state[node.hexcode] = node.ring === 0 || node.ring === 1 ? 'unlocked' : 'locked';
  }
  return state;
}

export function applyGameOnHex(
  state: ExplorationState,
  nodes: HexNode[],
  hexcode: string,
  gamesOnHex: Record<string, number>,
): { state: ExplorationState; gamesOnHex: Record<string, number> } {
  if (state[hexcode] === 'locked') {
    return { state, gamesOnHex };
  }
  const nextGames = { ...gamesOnHex, [hexcode]: (gamesOnHex[hexcode] ?? 0) + 1 };
  const nextState = { ...state };
  if (nextGames[hexcode] >= 3 && nextState[hexcode] !== 'mapped') {
    nextState[hexcode] = 'mapped';
    const node = nodes.find((n) => n.hexcode === hexcode);
    for (const neighbor of node?.neighbors ?? []) {
      if (nextState[neighbor] === 'locked') {
        nextState[neighbor] = 'unlocked';
      }
    }
  }
  return { state: nextState, gamesOnHex: nextGames };
}

/** Lightfall-style ring labels for the demo atlas. */
export function demoHexNodes(): HexNode[] {
  return [
    {
      hexcode: 'LFC1001',
      ring: 0,
      neighbors: ['LFR1001', 'LFR1002', 'LFR1003', 'LFR1004', 'LFR1005', 'LFR1006'],
    },
    {
      hexcode: 'LFR1001',
      ring: 1,
      neighbors: ['LFC1001', 'LFR1002', 'LFR1006', 'LFR2001'],
    },
    {
      hexcode: 'LFR1002',
      ring: 1,
      neighbors: ['LFC1001', 'LFR1001', 'LFR1003', 'LFR2002'],
    },
    {
      hexcode: 'LFR1003',
      ring: 1,
      neighbors: ['LFC1001', 'LFR1002', 'LFR1004', 'LFR2003'],
    },
    {
      hexcode: 'LFR1004',
      ring: 1,
      neighbors: ['LFC1001', 'LFR1003', 'LFR1005', 'LFR2004'],
    },
    {
      hexcode: 'LFR1005',
      ring: 1,
      neighbors: ['LFC1001', 'LFR1004', 'LFR1006', 'LFR2005'],
    },
    {
      hexcode: 'LFR1006',
      ring: 1,
      neighbors: ['LFC1001', 'LFR1005', 'LFR1001', 'LFR2006'],
    },
    { hexcode: 'LFR2001', ring: 2, neighbors: ['LFR1001'] },
    { hexcode: 'LFR2002', ring: 2, neighbors: ['LFR1002'] },
    { hexcode: 'LFR2003', ring: 2, neighbors: ['LFR1003'] },
    { hexcode: 'LFR2004', ring: 2, neighbors: ['LFR1004'] },
    { hexcode: 'LFR2005', ring: 2, neighbors: ['LFR1005'] },
    { hexcode: 'LFR2006', ring: 2, neighbors: ['LFR1006'] },
  ];
}
