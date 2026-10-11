import { describe, expect, it } from 'vitest';
import { isSafeDdbUrl, isSafeInternalPath, isSafeUrl } from '../../src/utils/url.js';

describe('url safety', () => {
  it('accepts internal paths', () => {
    expect(isSafeInternalPath('/quests')).toBe(true);
    expect(isSafeInternalPath('//evil')).toBe(false);
  });

  it('accepts http(s) only', () => {
    expect(isSafeUrl('https://example.com')).toBe(true);
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
  });

  it('restricts DDB hostnames', () => {
    expect(isSafeDdbUrl('https://www.dndbeyond.com/characters/1')).toBe(true);
    expect(isSafeDdbUrl('https://evil.com/dndbeyond.com')).toBe(false);
    expect(isSafeDdbUrl('javascript:alert(1)')).toBe(false);
  });
});
