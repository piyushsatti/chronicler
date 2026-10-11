import { describe, expect, it } from 'vitest';
import {
  applyGameOnHex,
  demoHexNodes,
  initialExploration,
} from '../../../src/features/map/mapExploration.js';
import { assertCanAddFeature } from '../../../src/features/map/adapters/mapFeaturesAdapter.js';
import { parseHexFeatures } from '../../../src/features/map/adapters/mapAdapter.js';
import { InvariantViolation } from '../../../src/errors/types.js';

describe('mapExploration', () => {
  it('starts with center and ring 1 unlocked', () => {
    const nodes = demoHexNodes();
    const state = initialExploration(nodes);
    expect(state.LFC1001).toBe('unlocked');
    expect(state.LFR1001).toBe('unlocked');
    expect(state.LFR2001).toBe('locked');
  });

  it('maps a hex after three games and unlocks neighbors', () => {
    const nodes = demoHexNodes();
    let state = initialExploration(nodes);
    let games: Record<string, number> = {};
    for (let i = 0; i < 3; i += 1) {
      ({ state, gamesOnHex: games } = applyGameOnHex(state, nodes, 'LFC1001', games));
    }
    expect(state.LFC1001).toBe('mapped');
    expect(state.LFR1001).toBe('unlocked');
  });
});

describe('parseHexFeatures', () => {
  it('rejects more than four features', () => {
    const wire = Array.from({ length: 5 }, (_, i) => ({
      id: `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
      title: `F${i}`,
      summary: 'x',
      slug: `f-${i}`,
    }));
    const result = parseHexFeatures(wire);
    expect(result.ok).toBe(false);
  });

  it('assertCanAddFeature throws at four', () => {
    expect(() => assertCanAddFeature(4)).toThrow(InvariantViolation);
  });
});
