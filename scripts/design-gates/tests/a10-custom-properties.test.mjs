import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import {
  emptyDefinitions,
  declarationsIn,
  findings,
  isCovered,
  referencesIn,
  resolvePackageStylesheets,
  scanCss,
  scanScope,
  scanTs,
} from '../check-custom-properties.mjs';

const fixture = (name) =>
  readFileSync(
    new URL(`./fixtures/a10-custom-properties/${name}`, import.meta.url),
    'utf8',
  );
const css = scanCss(fixture('tokens.css'));
const tsx = scanTs(fixture('Heat.tsx.txt'), 'src/Heat.tsx');

function definitions(...scans) {
  const defs = emptyDefinitions();
  for (const scan of scans)
    for (const d of scan.definitions)
      (d.dynamic ? defs.prefixes : defs.names).add(d.name);
  return defs;
}
const defs = definitions(css, tsx);
const result = findings(
  [
    { file: 'src/tokens.css', references: css.references },
    { file: 'src/Heat.tsx', references: tsx.references },
  ],
  defs,
);
const flagged = (rule) =>
  result.findings
    .filter((hit) => hit.rule === rule)
    .map((hit) => hit.name)
    .sort();

test('defined references pass: CSS declarations, @property, runtime writes, CSS-in-JS text', () => {
  const names = result.findings.map((hit) => hit.name);
  for (const name of [
    '--color-text',
    '--angle',
    '--swatch-color',
    '--header-height',
    '--from-text',
  ])
    assert.ok(!names.includes(name), `${name} should be defined`);
});

test('undefined references without a fallback fail, nested fallbacks included', () => {
  assert.deepEqual(flagged('undefined-property'), [
    '--color-bg',
    '--ghost',
    '--missing-inner',
  ]);
});

test('undefined references with a fallback are reported on the softer rule', () => {
  assert.deepEqual(flagged('fallback-undefined-property'), ['--knob', '--pad']);
  assert.deepEqual(flagged('fallback-undefined-prefix'), ['--soft-']);
});

test('dynamic names are prefixes: covered by any defined name or runtime prefix', () => {
  assert.deepEqual(flagged('undefined-prefix'), ['--nowhere-']);
  assert.ok(isCovered(defs, { name: '--color-region-', dynamic: true }));
  assert.ok(isCovered(defs, { name: '--cat-alpha', dynamic: false }));
  assert.ok(defs.prefixes.has('--cat-'));
  assert.equal(result.unresolved, 1, 'var(${region}) has no static head');
});

test('comments never reference or define', () => {
  const names = [...css.references, ...tsx.references].map((r) => r.name);
  assert.ok(!names.includes('--commented-ref'));
  assert.ok(!names.includes('--comment-only'));
  assert.ok(!defs.names.has('--ghost'));
});

test('references record line and fallback; non-custom var( text is ignored', () => {
  const bg = css.references.find((r) => r.name === '--color-bg');
  assert.equal(bg.line, 13);
  assert.equal(bg.fallback, false);
  assert.deepEqual(referencesIn('var(foo) var( --x ,1)'), [
    { name: '--x', dynamic: false, fallback: true, index: 9 },
  ]);
});

test('declarations ignore empty literal names and retain dynamic-name recognition', () => {
  assert.deepEqual(
    declarationsIn('--: 0; --good: 1; --\u0000dynamic: 2;').map(
      ({ name, dynamic }) => ({ name, dynamic }),
    ),
    [
      { name: '--good', dynamic: false },
      { name: '--', dynamic: true },
    ],
  );
});

test('scanScope unions package and app definitions and excludes generated files and tests', () => {
  const root = mkdtempSync(join(tmpdir(), 'a10-props-'));
  try {
    mkdirSync(join(root, 'src/styles'), { recursive: true });
    mkdirSync(join(root, 'src/__tests__'), { recursive: true });
    writeFileSync(join(root, 'pkg.css'), ':root { --pkg-token: 1px; }\n');
    writeFileSync(
      join(root, 'src/styles/a.module.css'),
      '.a { --local: 1; margin: var(--pkg-token); padding: var(--from-test); }\n',
    );
    writeFileSync(
      join(root, 'src/api.gen.ts'),
      "export const s = { '--from-gen': 1, c: 'var(--gen-ref)' };\n",
    );
    writeFileSync(
      join(root, 'src/A.test.tsx'),
      "export const t = { '--from-test': 1, c: 'var(--test-ref)' };\n",
    );
    writeFileSync(
      join(root, 'src/__tests__/b.ts'),
      "export const c = 'var(--test-ref)';\n",
    );
    writeFileSync(join(root, 'src/B.tsx'), "export const c = 'var(--from-gen)';\n");
    const scope = scanScope(join(root, 'src'), [join(root, 'pkg.css')]);
    assert.deepEqual(
      scope.findings.map((hit) => `${hit.file}:${hit.rule}:${hit.name}`).sort(),
      [
        'src/B.tsx:undefined-property:--from-gen',
        'src/styles/a.module.css:undefined-property:--from-test',
      ],
    );
    assert.throws(() => scanScope(join(root, 'src'), [join(root, 'missing.css')]));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the imposition package stylesheet resolves through node from apps/web', () => {
  const [sheet] = resolvePackageStylesheets();
  assert.match(sheet, /styles\.css$/);
});
