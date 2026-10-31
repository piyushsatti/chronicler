import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vite already owns the installed PostCSS parser; no new test dependency.
const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve('vite'));
interface CssNode {
  selector?: string;
  prop?: string;
  value?: string;
  walkDecls: (callback: (node: CssNode) => void) => void;
  walkRules: (callback: (node: CssNode) => void) => void;
}
const postcss = viteRequire('postcss') as { parse: (css: string) => CssNode };
const src = join(__dirname, '../../src');

function declarations(file: string, selector: string): Record<string, string> {
  const found: Record<string, string> = {};
  postcss.parse(readFileSync(join(src, file), 'utf8')).walkRules((rule) => {
    if (rule.selector !== selector) return;
    rule.walkDecls((decl) => {
      found[decl.prop!] = decl.value!;
    });
  });
  return found;
}

describe('word breaking in tables and the map place panel', () => {
  it('breaks prose table cells between words and lets the table scroll', () => {
    const cells = declarations('styles/atlas-content.css', '.cr-prose th, .cr-prose td');
    expect(cells['overflow-wrap']).toBe('break-word');
    expect(cells['word-break']).toBe('normal');
    expect(declarations('styles/atlas-content.css', '.cr-table-scroll')['overflow-x']).toBe(
      'auto',
    );
  });

  it('breaks the place panel between words', () => {
    const panel = declarations('features/map/pages/map.module.css', '.details');
    expect(panel['overflow-wrap']).toBe('break-word');
    expect(panel['word-break']).toBeUndefined();
  });
});
