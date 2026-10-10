import { describe, expect, it } from 'vitest';
import {
  assertCanAddFeature,
  parseHexFeatures,
} from '../../../src/features/map/adapters/mapFeaturesAdapter.js';
import { InvariantViolation } from '../../../src/errors/types.js';

const feature = (n: number) => ({
  id: `11111111-1111-4111-8111-11111111111${n}`,
  title: `Feature ${n}`,
  summary: `Summary ${n}`,
  slug: `feature-${n}`,
});

describe('parseHexFeatures', () => {
  it('accepts up to four features', () => {
    const result = parseHexFeatures([feature(1), feature(2)]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toHaveLength(2);
  });

  it('rejects more than four', () => {
    const result = parseHexFeatures([
      feature(1),
      feature(2),
      feature(3),
      feature(4),
      feature(5),
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('InvalidWire');
  });
});

describe('assertCanAddFeature', () => {
  it('allows when under max', () => {
    expect(() => assertCanAddFeature(3)).not.toThrow();
  });

  it('throws when at max', () => {
    expect(() => assertCanAddFeature(4)).toThrow(InvariantViolation);
  });
});
