import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const tokens = readFileSync(join(__dirname, '../../src/styles/tokens.css'), 'utf8');

describe('tokens.css port', () => {
  it('keeps breakpoint custom properties for Imposition/JS consumers', () => {
    expect(tokens).toMatch(/--bp-sm:\s*640px/);
    expect(tokens).toMatch(/--bp-md:\s*1024px/);
    expect(tokens).toMatch(/--bp-lg:\s*1440px/);
  });

  it('keeps compact density multiplier', () => {
    expect(tokens).toContain('[data-density="compact"]');
    expect(tokens).toMatch(/--density-mult:\s*0\.75/);
  });

  it('does not leave :root unclosed around breakpoints', () => {
    const open = (tokens.match(/\{/g) || []).length;
    const close = (tokens.match(/\}/g) || []).length;
    expect(open).toBe(close);
  });
});
