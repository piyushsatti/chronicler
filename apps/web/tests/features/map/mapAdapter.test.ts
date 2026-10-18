import { describe, expect, it } from 'vitest';
import {
  parseHexFeatures,
  parseMap,
} from '../../../src/features/map/adapters/mapAdapter.js';
import bad from '../../fixtures/wire/map/bad-missing-field.json';
import good from '../../fixtures/wire/map/good.json';

describe('parseMap', () => {
  it('accepts pointcrawl map atlas wire', () => {
    const result = parseMap(good);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.atlasCode).toBe('LFC');
      expect(result.data.mapKind).toBe('pointcrawl');
      expect(result.data.family).toBe('lightfall');
    }
  });

  it('rejects bad map wire', () => {
    expect(parseMap(bad).ok).toBe(false);
  });
});

describe('parseHexFeatures', () => {
  it('accepts the selected feature wire shape', () => {
    const result = parseHexFeatures([
      {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        title: 'Tree of Light',
        summary: 'A luminous tree.',
        slug: 'tree-of-light',
      },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data[0]?.title).toBe('Tree of Light');
  });

  it('rejects malformed feature fields and the per-hex limit', () => {
    expect(parseHexFeatures([{ id: 'bad' }]).ok).toBe(false);
    const tooMany = Array.from({ length: 5 }, (_, index) => ({
      id: `eeeeeeee-eeee-4eee-8eee-${String(index).padStart(12, '0')}`,
      title: `Feature ${index}`,
      summary: '',
      slug: `feature-${index}`,
    }));
    expect(parseHexFeatures(tooMany)).toMatchObject({
      ok: false,
      failure: 'InvalidWire',
      detail: 'max-4-features',
    });
  });
});
