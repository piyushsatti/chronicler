import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const gateDir = dirname(here);

function makeFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'chronicler-gallery-gates-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts', 'design-gates'), { recursive: true });
  for (const name of ['check-gallery.mjs', 'check-orphan.mjs']) {
    copyFileSync(join(gateDir, name), join(root, 'scripts', 'design-gates', name));
  }
  write(
    root,
    'apps/web/src/styles/primitives.registry.ts',
    `
export const PRIMITIVES_REGISTRY = [
  { id: 1, name: 'Button', group: 'B1', galleryEntryId: 'button', module: 'components/primitives/Button', status: 'built' },
];
`,
  );
  write(
    root,
    'apps/web/src/components/primitives/Button.tsx',
    'export const Button = () => null;\n',
  );
  write(root, 'scripts/design-gates/allowlist.json', '{"orphan": []}\n');
  return root;
}

function write(root, relativePath, content) {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function runGate(root, name) {
  return spawnSync(process.execPath, [join(root, 'scripts', 'design-gates', name)], {
    cwd: root,
    encoding: 'utf8',
  });
}

function featureGallery(root, { ids = ['button'], page = '' } = {}) {
  write(
    root,
    'apps/web/src/features/gallery/entries/index.ts',
    `export const GALLERY_ENTRIES = [\n${ids.map((id) => `  { id: '${id}', title: '${id}', section: 'primitives', render: () => null },`).join('\n')}\n];\n`,
  );
  write(
    root,
    'apps/web/src/features/gallery/pages/GalleryPage.tsx',
    page || 'export const GalleryPage = () => null;\n',
  );
}

test('gallery gate reads current feature-owned array entries and checks built primitive coverage', (t) => {
  const root = makeFixture(t);
  featureGallery(root);

  const result = runGate(root, 'check-gallery.mjs');

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /passed — 1 registry rows, 0 pending, 0 failures/);
  assert.doesNotMatch(result.stdout, /SKIP|PENDING/);
});

test('gallery gate fails when a shipped primitive is missing from the feature entry registry', (t) => {
  const root = makeFixture(t);
  featureGallery(root, { ids: ['other'] });

  const result = runGate(root, 'check-gallery.mjs');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /rule2: components\/primitives\/Button exists on disk/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /SKIP/);
});

test('gallery gate keeps required built-entry docs checks active under feature entries', (t) => {
  const root = makeFixture(t);
  featureGallery(root);
  write(
    root,
    'apps/web/src/features/gallery/entries/button.ts',
    `export const button = { status: 'built', docs: { purpose: 'A button.' } };\n`,
  );

  const result = runGate(root, 'check-gallery.mjs');

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /rule4: src\/features\/gallery\/entries\/button\.ts status:'built' missing docs\.api/,
  );
  assert.match(
    result.stderr,
    /rule5: src\/features\/gallery\/entries\/button\.ts status:'built' missing\/invalid overflow\.mechanism/,
  );
  assert.match(
    result.stderr,
    /rule6: src\/features\/gallery\/entries\/button\.ts docs\.states missing 'default'/,
  );
});

test('gallery gate still rejects lazy gallery page code and inline effect backdrops', (t) => {
  const root = makeFixture(t);
  featureGallery(root, {
    page: `export const GalleryPage = () => import('./Deferred.tsx');\n`,
  });
  write(
    root,
    'apps/web/src/features/gallery/entries/index.ts',
    `function EffectsDemo() { return <div style={{ background: 'red' }} />; }\nexport const GALLERY_ENTRIES = [\n  { id: 'button', title: 'Button', section: 'primitives', render: () => null },\n];\n`,
  );

  const result = runGate(root, 'check-gallery.mjs');

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /rule7: src\/features\/gallery\/pages\/GalleryPage\.tsx uses React\.lazy\( or dynamic import/,
  );
  assert.match(
    result.stderr,
    /rule8: src\/features\/gallery\/entries\/index\.ts EffectsDemo sets background/,
  );
});

test('gallery gate reports absent supported gallery paths as failed coverage', (t) => {
  const root = makeFixture(t);

  const result = runGate(root, 'check-gallery.mjs');

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /gallery missing at src\/features\/gallery or src\/pages\/gallery/,
  );
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /SKIP/);
});

test('orphan gate counts the feature gallery as an importer for its primitive demos', (t) => {
  const root = makeFixture(t);
  featureGallery(root, {
    page: `import { Button } from '../../../components/primitives/Button.js';\nexport const GalleryPage = () => Button;\n`,
  });

  const result = runGate(root, 'check-orphan.mjs');

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 primitive file\(s\) scanned, 0 unaccounted orphans/);
  assert.doesNotMatch(result.stdout, /SKIP/);
});

test('orphan gate reports absent supported gallery paths as failed coverage', (t) => {
  const root = makeFixture(t);

  const result = runGate(root, 'check-orphan.mjs');

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /gallery missing at src\/features\/gallery or src\/pages\/gallery/,
  );
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /SKIP/);
});
