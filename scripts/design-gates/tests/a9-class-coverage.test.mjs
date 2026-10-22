import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import {
  indexCss,
  scanScope,
  scanSource,
  selectorPreludes,
} from '../check-class-coverage.mjs';

const fixture = (name) =>
  readFileSync(
    new URL(`./fixtures/a9-class-coverage/${name}`, import.meta.url),
    'utf8',
  );
const widget = fixture('Widget.tsx.txt');
const css = fixture('widget.css');
const hits = scanSource(widget, 'src/components/primitives/Widget.tsx', indexCss(css));
const flagged = (rule) =>
  hits
    .filter((hit) => hit.rule === rule)
    .map((hit) => hit.class)
    .sort();

test('covered classes pass: literals, cx args, local consts, @layer/@media rules, any combinator', () => {
  for (const cls of ['widget', 'widget--calm', 'widget__icon', 'type-body'])
    assert.ok(!hits.some((hit) => hit.class === cls), `${cls} should be covered`);
});

test('uncovered classes fail, including union-expanded template members', () => {
  assert.deepEqual(flagged('uncovered-class'), [
    'widget--loud',
    'widget--selected',
    'widget__body',
    'widget__ghost',
  ]);
});

test('comparison operands are never emitted classes', () => {
  assert.ok(!hits.some((hit) => hit.class === 'loud'));
});

test('unresolvable template spans fall back to prefix coverage', () => {
  assert.deepEqual(flagged('uncovered-prefix'), ['unstyled__']);
});

test('commented-out rules and attribute-selector values do not count as coverage', () => {
  const index = indexCss(css);
  assert.ok(!index.classes.has('widget__ghost'));
  assert.ok(!index.classes.has('widget__body'));
  assert.ok(selectorPreludes(css).every((prelude) => !prelude.startsWith('@')));
});

test('data-* values the stylesheet never selects on the same class are flagged; classless rules cover', () => {
  assert.deepEqual(flagged('data-value-mismatch'), ['widget[data-selected]']);
  const fixed = widget.replace(
    "selected ? 'true' : 'false'",
    "selected ? '1' : undefined",
  );
  const after = scanSource(fixed, 'Widget.tsx', indexCss(css));
  assert.ok(!after.some((hit) => hit.rule === 'data-value-mismatch'));
});

test('scanScope reads the index.css @import closure and a sibling module stylesheet', () => {
  const root = mkdtempSync(join(tmpdir(), 'a9-class-'));
  try {
    mkdirSync(join(root, 'styles'), { recursive: true });
    mkdirSync(join(root, 'components/primitives'), { recursive: true });
    mkdirSync(join(root, 'components/foundation'), { recursive: true });
    writeFileSync(join(root, 'styles/index.css'), "@import './parts.css';\n");
    writeFileSync(join(root, 'styles/parts.css'), '.shared { color: red; }\n');
    writeFileSync(
      join(root, 'components/primitives/Thing.tsx'),
      'export const Thing = () => <div className="shared thing local" />;\n',
    );
    writeFileSync(
      join(root, 'components/primitives/Thing.module.css'),
      '.local { color: blue; }\n',
    );
    writeFileSync(
      join(root, 'components/primitives/Thing.test.tsx'),
      'export const T = () => <div className="ignored" />;\n',
    );
    writeFileSync(
      join(root, 'components/foundation/Other.tsx'),
      'export const Other = () => <p className="local" />;\n',
    );
    const found = scanScope(root).map((hit) => `${hit.file}:${hit.class}`);
    assert.deepEqual(found.sort(), [
      'src/components/foundation/Other.tsx:local',
      'src/components/primitives/Thing.tsx:thing',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
