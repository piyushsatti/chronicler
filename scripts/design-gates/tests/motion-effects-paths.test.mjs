import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'chronicler-motion-gates-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of [
    'scripts/design-gates/check-motion.mjs',
    'scripts/design-gates/check-effects.mjs',
    'apps/web/src/motion/catalog.ts',
    'apps/web/src/motion/tokens.ts',
    'apps/web/src/styles/motion.css',
    'apps/web/src/styles/effects.css',
    'apps/web/src/styles/tokens.css',
    'apps/web/src/effects/catalog.ts',
    'apps/web/src/chrome/AmbientLayer.tsx',
    'apps/web/src/features/gallery/sections/Motion.tsx',
    'apps/web/src/context/theme.utils.ts',
  ]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    copyFileSync(join(repo, file), join(root, file));
  }
  return root;
}
function run(root, name) {
  return spawnSync(process.execPath, [join(root, 'scripts/design-gates', name)], {
    cwd: root,
    encoding: 'utf8',
  });
}
function edit(root, file, replace) {
  const path = join(root, file);
  writeFileSync(path, replace(readFileSync(path, 'utf8')));
}
const catalog = 'apps/web/src/motion/catalog.ts';
test('real canonical Gallery and AmbientLayer paths execute all retained checks', (t) => {
  const root = fixture(t);
  for (const gate of ['check-motion.mjs', 'check-effects.mjs']) {
    const result = run(root, gate);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /SKIP|PENDING/);
  }
});
test('a missing retained nonlaunch row fails completeness', (t) => {
  const root = fixture(t);
  edit(root, catalog, (source) =>
    source.replace(/ {2}\{\s*n: 22,[\s\S]*?launch: false,\s*\},/, ''),
  );
  const result = run(root, 'check-motion.mjs');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /3-catalog-completeness/);
});
test('the retired hex identity is rejected even if the retained count and row numbers match', (t) => {
  const root = fixture(t);
  edit(root, catalog, (source) =>
    source.replace("id: 'timeline-scrub-momentum'", "id: 'map-hex-select-ripple'"),
  );
  const result = run(root, 'check-motion.mjs');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /3-retired-feature/);
});
test('a missing retained motion demo still fails coverage under the feature-owned path', (t) => {
  const root = fixture(t);
  edit(root, 'apps/web/src/features/gallery/sections/Motion.tsx', (source) =>
    source.replace("  'route-crossfade-lift',\n", ''),
  );
  const result = run(root, 'check-motion.mjs');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /5-css-demo-coverage/);
});
test('the canonical AmbientLayer remains identity independent', (t) => {
  const root = fixture(t);
  edit(
    root,
    'apps/web/src/chrome/AmbientLayer.tsx',
    (source) => `${source}\nconst forbiddenBranch = 'glow-pulse';\n`,
  );
  const result = run(root, 'check-effects.mjs');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /E5/);
});
