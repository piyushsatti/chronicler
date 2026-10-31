import { describe, expect, it } from 'vitest';
import { isHexCode, normalizeHexCode } from '../../src/utils/hexCode.js';

describe('hex codes', () => {
  it('accepts centre and ring codes in any case', () => {
    expect(isHexCode('LFC1001')).toBe(true);
    expect(isHexCode(' lfr7008 ')).toBe(true);
    expect(normalizeHexCode(' lfr7008 ')).toBe('LFR7008');
  });

  it('rejects numbers alone, other shapes and non-strings', () => {
    expect(isHexCode('7008')).toBe(false);
    expect(isHexCode('LFX7008')).toBe(false);
    expect(isHexCode('LFR700')).toBe(false);
    expect(isHexCode(7008)).toBe(false);
    expect(normalizeHexCode(undefined)).toBe('');
  });
});
