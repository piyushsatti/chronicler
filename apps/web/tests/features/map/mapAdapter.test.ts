import { describe, expect, it } from 'vitest';
import {
  parseHexFeatures,
  parseMapBundle,
} from '../../../src/features/map/adapters/mapAdapter.js';
import bad from '../../fixtures/wire/map/bad-missing-field.json';
import good from '../../fixtures/wire/map/good.json';
import viewGood from '../../fixtures/wire/map/view-good.json';

describe('parseMapBundle', () => {
  it('joins map hexes with feature places', () => {
    const result = parseMapBundle(good, viewGood);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.hexes).toHaveLength(2);
      expect(result.data.hexes[0]?.features[0]?.title).toBe('Tree of Light');
    }
  });

  it('rejects bad map wire', () => {
    expect(parseMapBundle(bad, viewGood).ok).toBe(false);
  });

  it('rejects a malformed feature in the joined map view', () => {
    const malformedView = structuredClone(viewGood);
    malformedView.places[0]!.documentId = 'not-a-uuid';
    expect(parseMapBundle(good, malformedView).ok).toBe(false);
  });

  it('rejects more than four features assigned to one hex', () => {
    const crowdedView = structuredClone(viewGood);
    const first = crowdedView.places[0]!;
    crowdedView.places = Array.from({ length: 5 }, (_, index) => ({
      ...first,
      documentId: `eeeeeeee-eeee-4eee-8eee-${String(index).padStart(12, '0')}`,
      slug: `feature-${index}`,
    }));
    expect(parseMapBundle(good, crowdedView).ok).toBe(false);
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
