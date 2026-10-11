#!/usr/bin/env node
// B6 gallery gate (#466). Registry-driven, built-vs-pending: a primitive
// whose module exists on disk and has no complete gallery entry FAILS; a
// primitive with no module yet is PENDING, not failed — the gate stays
// green from day one instead of red-and-ignored.
//
// Reads src/styles/primitives.registry.ts and the gallery entries index by
// regex scrape, same technique check-duplication.mjs uses (gates run as
// plain .mjs, no TS loader). It accepts the current feature-owned gallery
// and the earlier pages-owned location. Field checks (rules 4-6) read the
// entry sources under the selected gallery root.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const feRoot = join(repoRoot, 'apps', 'web');
const appRoot = join(feRoot, 'src');

const listMode = process.argv.includes('--list');

const registryPath = join(appRoot, 'styles', 'primitives.registry.ts');
const galleryRoots = [
  join(appRoot, 'features', 'gallery'),
  join(appRoot, 'pages', 'gallery'),
];
const galleryRoot =
  galleryRoots.find((root) => existsSync(join(root, 'entries', 'index.ts'))) ??
  galleryRoots.find(existsSync);
const entriesDir = join(galleryRoot ?? galleryRoots[0], 'entries');
const entriesIndexPath = join(entriesDir, 'index.ts');

const registrySrc = readFileSync(registryPath, 'utf8');

// Scrape each row object out of PRIMITIVES_REGISTRY.
const rowRe =
  /\{\s*id:\s*(\d+),\s*name:\s*'([^']+)',\s*group:\s*'([^']+)',\s*galleryEntryId:\s*'([^']+)',\s*module:\s*'([^']+)',\s*status:\s*'([^']+)'\s*\}/g;
const rows = [...registrySrc.matchAll(rowRe)].map((m) => ({
  id: Number(m[1]),
  name: m[2],
  group: m[3],
  galleryEntryId: m[4],
  module: m[5],
  status: m[6],
}));

if (rows.length === 0) {
  console.error(
    'check:gallery (B6) FAILED — could not read any rows from src/styles/primitives.registry.ts',
  );
  process.exit(1);
}

const failures = [];
const pending = [];
if (!galleryRoot) {
  failures.push(
    'gallery missing at src/features/gallery or src/pages/gallery; gallery coverage is unavailable',
  );
} else if (!existsSync(entriesIndexPath)) {
  failures.push(
    `gallery entries index missing at ${relative(feRoot, entriesIndexPath).replace(/\\/g, '/')}`,
  );
}

// Rule 1: non-empty galleryEntryId, not TBD-B6, unique.
const seenIds = new Map();
for (const row of rows) {
  if (!row.galleryEntryId || row.galleryEntryId === 'TBD-B6') {
    failures.push(
      `rule1: ${row.name} has no real galleryEntryId (got '${row.galleryEntryId}')`,
    );
  }
  if (seenIds.has(row.galleryEntryId)) {
    failures.push(
      `rule1: galleryEntryId '${row.galleryEntryId}' duplicated (${row.name} / ${seenIds.get(row.galleryEntryId)})`,
    );
  }
  seenIds.set(row.galleryEntryId, row.name);
}

// Scrape entry ids from the current array registry or keys from the earlier
// object registry. Keep the registry comparison exact: a shipped module
// still needs a matching gallery entry.
let entriesSrc = '';
if (existsSync(entriesIndexPath)) {
  entriesSrc = readFileSync(entriesIndexPath, 'utf8');
}
const importedKeyRe = /['"]?([\w-]+)['"]?\s*:\s*\w+/g;
const arrayBodyMatch = entriesSrc.match(/GALLERY_ENTRIES[^=]*=\s*\[([\s\S]*?)\n\];/);
const objectBodyMatch = entriesSrc.match(/GALLERY_ENTRIES[^=]*=\s*\{([\s\S]*?)\n\};/);
const entryKeys = arrayBodyMatch
  ? [...arrayBodyMatch[1].matchAll(/(?:^|\n)\s*\{\s*id:\s*['"]([^'"]+)['"]/g)].map(
      (m) => m[1],
    )
  : objectBodyMatch
    ? [...objectBodyMatch[1].matchAll(importedKeyRe)].map((m) => m[1])
    : [];

// Rule 2: module exists on disk -> must have an entries/index.ts key.
for (const row of rows) {
  const moduleFile = join(appRoot, `${row.module}.tsx`);
  const moduleFileTs = join(appRoot, `${row.module}.ts`);
  const moduleExists = existsSync(moduleFile) || existsSync(moduleFileTs);
  if (moduleExists) {
    if (!entryKeys.includes(row.galleryEntryId)) {
      failures.push(
        `rule2: ${row.module} exists on disk but '${row.galleryEntryId}' has no entries/index.ts key — a primitive without a gallery entry fails the build`,
      );
    }
  } else {
    pending.push(`${row.name} (${row.galleryEntryId}): module not shipped yet`);
  }
}

// Rules 4-6: any gallery entry source that declares status: 'built' must
// provide the docs/overflow fields. The current renderer array is the
// gallery-presence registry; explicit built-entry contract records remain
// subject to these checks wherever they are stored under entries/.
function findBuiltEntrySources() {
  // Walk every .tsx/.ts under the selected gallery entries tree, looking for `status: 'built'`
  // object literals.
  const out = [];
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name) && !name.includes('.test.')) out.push(full);
    }
  }
  walk(entriesDir);
  return out;
}

const REQUIRED_DOCS_FIELDS = [
  'purpose',
  'api',
  'variants',
  'tones',
  'states',
  'composition',
  'mustNot',
];

for (const file of findBuiltEntrySources()) {
  const src = readFileSync(file, 'utf8');
  const relPath = relative(feRoot, file).replace(/\\/g, '/');
  if (!/status:\s*'built'/.test(src)) continue;

  // Rule 4: every docs field present and non-empty.
  for (const field of REQUIRED_DOCS_FIELDS) {
    const fieldRe = new RegExp(`${field}:\\s*(''|""|\\[\\])`);
    if (!new RegExp(`\\b${field}:`).test(src)) {
      failures.push(`rule4: ${relPath} status:'built' missing docs.${field}`);
    } else if (fieldRe.test(src)) {
      failures.push(`rule4: ${relPath} status:'built' has empty docs.${field}`);
    }
  }

  // Rule 5: overflow block with a mechanism from the allowed set, plus
  // threshold (or why for not-a-collection).
  // 'scroll-cap' is a sixth sanctioned mechanism, admitted for `Legend` only
  // (design-language.md §10 row 22: "scroll cap ... no +N" — none of the
  // five existing mechanisms expresses that; cap+N is explicitly forbidden
  // for a legend). Written deviation, not an invention (B12 #491).
  const ALLOWED_MECHANISMS = [
    'cap+n',
    'heat-aggregate',
    'virtualize',
    'load-more',
    'cluster',
    'scroll-cap',
    'not-a-collection',
  ];
  const mechMatch = src.match(/mechanism:\s*'([^']+)'/);
  if (!mechMatch || !ALLOWED_MECHANISMS.includes(mechMatch[1])) {
    failures.push(
      `rule5: ${relPath} status:'built' missing/invalid overflow.mechanism`,
    );
  } else if (mechMatch[1] === 'not-a-collection') {
    if (!/why:\s*'[^']+'/.test(src)) {
      failures.push(
        `rule5: ${relPath} not-a-collection overflow missing non-empty why`,
      );
    }
  } else if (!/threshold:\s*(-?\d+|'width-driven'|'always-on')/.test(src)) {
    failures.push(`rule5: ${relPath} status:'built' overflow missing threshold`);
  }

  // Rule 6: docs.states includes 'default' and 'focus-visible'.
  const statesMatch = src.match(/states:\s*\[([^\]]*)\]/);
  const statesList = statesMatch ? statesMatch[1] : '';
  if (!/'default'/.test(statesList))
    failures.push(`rule6: ${relPath} docs.states missing 'default'`);
  if (!/'focus-visible'/.test(statesList))
    failures.push(`rule6: ${relPath} docs.states missing 'focus-visible'`);
}

// Rule 7: no React.lazy( and no dynamic import( in gallery page or entry
// sources. The feature route module itself is excluded: its lazy route
// registration is outside the gallery's rendered page and demos.
function walkAll(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walkAll(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}
const galleryCodeRoots =
  galleryRoot && galleryRoot.endsWith(join('features', 'gallery'))
    ? [join(galleryRoot, 'pages'), entriesDir]
    : galleryRoot
      ? [galleryRoot]
      : [];
for (const file of galleryCodeRoots.flatMap(walkAll)) {
  const relPath = relative(feRoot, file).replace(/\\/g, '/');
  const src = readFileSync(file, 'utf8');
  const codeLines = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));
  const codeSrc = codeLines.join('\n');
  if (/React\.lazy\(/.test(codeSrc) || /(?<!\.)\bimport\(/.test(codeSrc)) {
    failures.push(
      `rule7: ${relPath} uses React.lazy( or dynamic import( in gallery page/entry source (H4)`,
    );
  }
}

// Rule 8 (#468 demo-backdrop contract): legacy Effects.tsx and future
// per-effect entry files must set demo backdrops only via .gallery-demo-stage.
const DEMO_BACKDROP_FILES = [
  join(appRoot, 'pages', 'gallery', 'sections', 'Effects.tsx'),
  join(appRoot, 'features', 'gallery', 'pages', 'Effects.tsx'),
];
const entriesEffectFiles = existsSync(entriesDir)
  ? walkAll(entriesDir).filter((f) => /effect/i.test(f) && !f.endsWith('index.ts'))
  : [];
const featureEffectsEntry = galleryRoot === galleryRoots[0] ? entriesIndexPath : null;
for (const file of [...DEMO_BACKDROP_FILES, ...entriesEffectFiles]) {
  if (!existsSync(file)) continue;
  const relPath = relative(feRoot, file).replace(/\\/g, '/');
  const src = readFileSync(file, 'utf8');
  if (/\bbackground(Color)?\s*:\s*['"`]/.test(src)) {
    failures.push(
      `rule8: ${relPath} sets background/backgroundColor inline — demo backdrops must use the .gallery-demo-stage contract (B7b)`,
    );
  }
}
if (featureEffectsEntry && existsSync(featureEffectsEntry)) {
  const src = readFileSync(featureEffectsEntry, 'utf8');
  const effectsDemo = src.match(
    /function EffectsDemo\s*\([^)]*\)\s*\{([\s\S]*?)(?=\nfunction\s|\n\/\*\*|\nexport const GALLERY_ENTRIES)/,
  )?.[1];
  if (effectsDemo && /\bbackground(Color)?\s*:\s*['"`]/.test(effectsDemo)) {
    const relPath = relative(feRoot, featureEffectsEntry).replace(/\\/g, '/');
    failures.push(
      `rule8: ${relPath} EffectsDemo sets background/backgroundColor inline — demo backdrops must use the .gallery-demo-stage contract (B7b)`,
    );
  }
}

if (listMode) {
  console.log('check:gallery (B6) — rows:');
  for (const row of rows)
    console.log(`  ${row.id} ${row.name} [${row.galleryEntryId}] status=${row.status}`);
  console.log(
    `galleryRoot=${galleryRoot ? relative(feRoot, galleryRoot).replace(/\\/g, '/') : 'missing'}`,
  );
  console.log(`\nPENDING (${pending.length}):`);
  for (const p of pending) console.log(`  ${p}`);
  process.exit(0);
}

if (pending.length > 0) {
  console.log(
    `check:gallery (B6) — ${pending.length} PENDING (module not shipped, not a failure):`,
  );
  for (const p of pending) console.log(`  ${p}`);
}

if (failures.length > 0) {
  console.error(`\ncheck:gallery (B6) FAILED — ${failures.length} issue(s):`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

console.log(
  `\ncheck:gallery (B6) passed — ${rows.length} registry rows, ${pending.length} pending, 0 failures.`,
);
process.exit(0);
