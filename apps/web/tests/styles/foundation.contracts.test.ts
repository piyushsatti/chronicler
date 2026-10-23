import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vite already owns the installed PostCSS parser; no new test dependency.
const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve('vite'));
interface CssNode {
  type: string;
  name?: string;
  params?: string;
  selector?: string;
  prop?: string;
  value?: string;
  parent?: CssNode;
  walkDecls: (callback: (node: CssNode) => void) => void;
  walkRules: (callback: (node: CssNode) => void) => void;
  walkAtRules: (name: string, callback: (node: CssNode) => void) => void;
}
const postcss = viteRequire('postcss') as { parse: (css: string) => CssNode };
const styles = join(__dirname, '../../src/styles');
const css = (file: string) => readFileSync(join(styles, file), 'utf8');
const index = postcss.parse(css('index.css'));
const base = postcss.parse(css('base.css'));
const imports: string[] = [];
index.walkAtRules('import', (rule) => {
  imports.push(rule.params!.replace(/^['"]\.\//, '').replace(/['"]$/, ''));
});

function rules(root: CssNode, selector: string): CssNode[] {
  const matches: CssNode[] = [];
  root.walkRules((rule) => {
    if (rule.selector?.trim() === selector || rule.selector?.split(',').map((part) => part.trim()).includes(selector)) {
      matches.push(rule);
    }
  });
  return matches;
}

function declarations(rule: CssNode): Record<string, string> {
  const values: Record<string, string> = {};
  rule.walkDecls((decl) => { values[decl.prop!] = decl.value!; });
  return values;
}

describe('shared foundation CSS ownership', () => {
  it('only consumes custom properties defined in the imported styles', () => {
    const definitions = new Set<string>();
    for (const file of imports) {
      postcss.parse(css(file)).walkDecls((decl) => {
        if (decl.prop?.startsWith('--')) definitions.add(decl.prop);
      });
    }
    const missing: string[] = [];
    base.walkDecls((decl) => {
      for (const reference of decl.value!.matchAll(/var\(\s*(--[\w-]+)/g)) {
        if (!definitions.has(reference[1])) missing.push(`${decl.prop}: ${reference[1]}`);
      }
    });
    expect(missing).toEqual([]);
    expect(declarations(rules(base, 'body')[0])).toMatchObject({
      background: 'var(--color-bg-deep)', color: 'var(--color-text)',
    });
    expect(declarations(rules(base, ':root')[0])).toMatchObject({
      '--imposition-shell-nav-background': 'var(--color-bg-panel)',
      '--imposition-shell-border-color': 'var(--color-border)',
    });
  });

  it('leaves the ten semantic typography tiers with their existing owner', () => {
    const tiers = ['display', 'heading', 'title', 'label', 'body', 'narrative', 'caption', 'code', 'value', 'ui'];
    const typography = postcss.parse(css('typography.css'));
    for (const tier of tiers) {
      expect(rules(typography, `.type-${tier}`)).toHaveLength(1);
      expect(rules(base, `.type-${tier}`)).toHaveLength(0);
    }
    expect(declarations(rules(typography, '.type-display')[0])).toMatchObject({
      'font-family': 'var(--font-title)',
      'font-size': 'var(--type-display-size, clamp(1.75rem, 4vw, 3rem))',
      'font-weight': 'var(--font-title-weight)', 'line-height': '1.08',
    });
    // D7: every title tier is Lexend Bold; Fraunces stays for narrative.
    for (const tier of ['heading', 'title']) {
      expect(declarations(rules(typography, `.type-${tier}`)[0])).toMatchObject({
        'font-family': 'var(--font-title)', 'font-weight': 'var(--font-title-weight)',
      });
    }
    expect(declarations(rules(typography, '.type-caption')[0])).toMatchObject({
      'font-size': 'var(--type-caption-size, 0.8125rem)',
      color: 'var(--color-text-muted)',
    });
  });

  it('preserves Atlas card/button skins and imports primitive state overrides afterward', () => {
    const atlas = postcss.parse(css('atlas.css'));
    for (const selector of ['.card', '.btn', '.btn.primary', '.btn:disabled', '.eyebrow']) {
      expect(rules(base, selector)).toHaveLength(0);
      expect(rules(atlas, selector)).toHaveLength(1);
    }
    // Round 3 L1: the one page frame lives in base.css and reads layout tokens.
    expect(rules(atlas, '.page')).toHaveLength(0);
    expect(declarations(rules(base, '.page')[0])).toMatchObject({
      'max-inline-size': 'var(--page-max)',
    });
    expect(declarations(rules(atlas, '.card')[0])).toMatchObject({
      'border-radius': 'var(--rad)', 'box-shadow': 'var(--shadow-2)',
    });
    // D8: Parchment sets --btn-primary-*; other themes fall back to accent + hero ink.
    expect(declarations(rules(atlas, '.btn.primary')[0]).color).toBe(
      'var(--btn-primary-ink, var(--color-hero-on-brand-ink))',
    );
    // D9: buttons are 8px rounded rectangles, not pills.
    expect(declarations(rules(atlas, '.btn')[0])['border-radius']).toBe('var(--rad-btn)');
    expect(imports.indexOf('primitives.css')).toBeGreaterThan(imports.indexOf('atlas.css'));
    expect(imports.indexOf('primitives.css')).toBeGreaterThan(imports.indexOf('base.css'));
    expect(rules(base, '.field input')).toHaveLength(0);
    expect(rules(base, '.field :where(input, textarea, select):not(.field-input)')).toHaveLength(1);
    expect(declarations(rules(postcss.parse(css('primitives.css')), '.field-input')[0])).toMatchObject({
      'border-radius': 'var(--rad-sm)', background: 'var(--color-bg-surface)',
    });
  });

  it('keeps default gaps below explicit layout attributes in the components layer', () => {
    expect(imports.indexOf('base.css')).toBeLessThan(imports.indexOf('atlas.css'));
    expect(imports.indexOf('base.css')).toBeLessThan(imports.indexOf('layout.css'));
    for (const selector of ['.stack', '.row']) {
      const rule = rules(base, selector)[0];
      expect(rule.parent).toMatchObject({ type: 'atrule', name: 'layer', params: 'components' });
      expect(Object.keys(declarations(rule))).toEqual(['gap']);
    }
    expect(css('base.css')).not.toMatch(/@media\s*\([^)]*(?:width|height)/);
  });
});

describe('self-hosted font assets', () => {
  it('declares all four token families against intact local WOFF2 files and carries the licenses', () => {
    const fonts = postcss.parse(css('fonts.css'));
    const families = new Set<string>();
    const files: string[] = [];
    fonts.walkAtRules('font-face', (face) => {
      const values = declarations(face);
      families.add(values['font-family']);
      expect(values['font-weight']).toBe('100 900');
      expect(values['font-display']).toBe('swap');
      const path = /url\(['"]?([^)'"\s]+)/.exec(values.src)![1];
      expect(path.startsWith('/fonts/')).toBe(true);
      const binary = readFileSync(join(__dirname, '../../public', path));
      expect(binary.subarray(0, 4).toString()).toBe('wOF2');
      expect(binary.readUInt32BE(8)).toBe(binary.length);
      files.push(path);
    });
    expect([...families].sort()).toEqual([
      "'Fraunces Variable'", "'Geist Mono'", "'Geist'", "'Lexend Variable'",
    ]);
    expect(files).toHaveLength(6);
    for (const name of ['Fraunces-OFL.txt', 'Geist-OFL.txt', 'Lexend-OFL.txt']) {
      expect(readFileSync(join(__dirname, '../../public/fonts', name), 'utf8')).toContain('SIL OPEN FONT LICENSE Version 1.1');
    }
    expect(imports.indexOf('fonts.css')).toBeLessThan(imports.indexOf('typography.css'));
  });
});
