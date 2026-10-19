import { describe, expect, it } from 'vitest';
import { parseChronicleList } from '../../../src/features/chronicle/adapters/chronicleAdapter.js';
import { summaryCategoryMeta } from '../../../src/features/chronicle/summaryCategory.js';
import bad from '../../fixtures/wire/chronicle/list-bad.json';
import good from '../../fixtures/wire/chronicle/list-good.json';

describe('parseChronicleList', () => {
  it('maps published summaries with derived timeline fields', () => {
    const result = parseChronicleList(good);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.total).toBe(2);
    const first = result.data.items[0];
    expect(first?.title).toBe('Vault Delve — Session recap');
    expect(first?.excerpt).toBe('The vault door finally gave way.');
    expect(first?.tags).toEqual(['delve', 'vault']);
    expect(first?.region).toBe('Dalmond');
    expect(first?.arc).toBe('Deep Roads');
    expect(first?.gameDay).toBe(142);
    expect(first?.gameDate?.eraAbbrev).toBe('AE');
    expect(first?.authorHandle).toBe('mira');
  });

  it('rejects bad wire', () => {
    expect(parseChronicleList(bad).ok).toBe(false);
  });
});

describe('summaryCategoryMeta', () => {
  it('maps character and dm to SESSION and DM RECAP chips', () => {
    expect(summaryCategoryMeta('character').label).toBe('SESSION');
    expect(summaryCategoryMeta('dm').label).toBe('DM RECAP');
    expect(summaryCategoryMeta('session').label).toBe('SESSION');
    expect(summaryCategoryMeta(null).label).toBe('ENTRY');
  });
});
