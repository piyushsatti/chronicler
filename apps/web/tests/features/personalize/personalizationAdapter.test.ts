import { describe, expect, it } from 'vitest';
import { parsePersonalization } from '../../../src/features/personalize/adapters/personalizationAdapter.js';
import bad from '../../fixtures/wire/personalize/bad.json';
import good from '../../fixtures/wire/personalize/good.json';

describe('personalizationAdapter', () => {
  it('parses settings-only personalization wire', () => {
    const result = parsePersonalization(good);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.theme).toBe('parchment');
    expect(result.data.mode).toBe('system');
    expect(result.data.effectsEnabled).toBe(false);
    expect(result.data.density).toBe('comfortable');
    expect(result.data.memberId).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  });

  it('rejects bad wire', () => {
    const result = parsePersonalization(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('InvalidWire');
  });
});
