import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scanCss, scanTsx } from '../check-page-layout.mjs';

const rules = (hits) => hits.map((h) => h.rule);

test('flags literal page widths >= 160px and ignores tokens, small sizes and breakpoints', () => {
  const css = [
    '.a { max-width: 1380px; }',
    '.b { inline-size: min(300px, 100%); }',
    '.c { max-inline-size: 45rem; }',
    '.d { max-inline-size: var(--page-max); }',
    '.e { width: 22px; min-width: 16rem; border-width: 400px; }',
    '@container x (max-width: 68rem) {',
    '/* width: 900px */',
  ].join('\n');
  const hits = scanCss('src/features/x/x.module.css', css);
  assert.deepEqual(hits.map((h) => h.line), [1, 2, 3]);
  assert.deepEqual(new Set(rules(hits)), new Set(['css-width-literal']));
});

test('flags literal card minimums in grid-template-columns, not the token', () => {
  const css = [
    '.g { grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr)); }',
    '.h { grid-template-columns: repeat(auto-fill, minmax(min(var(--card-min), 100%), 1fr)); }',
    '.i { grid-template-columns: minmax(0, 1fr) auto; }',
  ].join('\n');
  const hits = scanCss('src/features/x/x.module.css', css);
  assert.deepEqual(hits.map((h) => [h.line, h.rule]), [[1, 'grid-card-min']]);
});

test('flags max="wide" anywhere and filter sidebars only in feature pages', () => {
  const page = [
    '<PageShell context="tavern" max="wide">',
    "<PageShell max={admin ? 'wide' : 'default'}>",
    '<div data-sidebar={expanded}>',
    '<aside className="rail">',
    "import { FilterSidebar } from '../components/FilterSidebar.js';",
  ].join('\n');
  assert.deepEqual(rules(scanTsx('src/features/x/pages/XPage.tsx', page)), [
    'page-max-wide',
    'page-max-wide',
    'filter-sidebar',
    'filter-sidebar',
  ]);
  assert.deepEqual(rules(scanTsx('src/features/x/components/Rail.tsx', '<aside>')), []);
});
