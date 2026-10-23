import { describe, expect, it } from 'vitest';
import { isTitleEcho } from '../../../src/features/home/bannerText.js';

describe('isTitleEcho', () => {
  it('hides a body that only repeats the title', () => {
    expect(isTitleEcho('Maintenance', 'maintenance.')).toBe(true);
  });
  it('keeps a body that adds meaning to the title', () => {
    expect(isTitleEcho('Maintenance', 'Maintenance starts tomorrow.')).toBe(false);
    expect(isTitleEcho(null, 'Anything')).toBe(false);
  });
});
