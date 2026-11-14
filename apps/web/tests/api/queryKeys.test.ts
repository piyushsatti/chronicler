import { describe, expect, it } from 'vitest';
import { queryKeys } from '../../src/api/queryKeys.js';

describe('queryKeys factory', () => {
  it('every value is a non-empty array or a function', () => {
    const entries = Object.entries(queryKeys);
    expect(entries.length).toBeGreaterThan(0);
    for (const [name, value] of entries) {
      if (typeof value === 'function') continue;
      expect(Array.isArray(value), `${name} should be an array or function`).toBe(
        true,
      );
      expect((value as readonly unknown[]).length, `${name} should be non-empty`).toBeGreaterThan(
        0,
      );
    }
  });
});
