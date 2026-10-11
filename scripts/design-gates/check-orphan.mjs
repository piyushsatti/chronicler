#!/usr/bin/env node
// A6 orphan gate: any file under src/components/** must be imported by
// SOMETHING in the dev build graph — a feature, a page, another component,
// or the gallery route. The gallery counts as a valid importer on purpose:
// a component that only the gallery imports is still "used"
// (that's the whole point of the gallery being the owner's review bench
// before Epic C migrates real call sites to it), so this gate must not
// force premature call-site migration just to avoid an orphan flag.
//
// #456 (A6) review FIX 2: scope corrected from src/components/primitives/**
// (didn't exist yet — silent no-op) to src/components/** per the issue text
// ("a file under components/* that nothing imports fails").
//
// Graph is a plain import-statement crawl over src/**, so it needs no build
// step to run in CI. Recognize both the current feature-owned gallery and
// its earlier pages-owned location as evidence that the importer graph is
// complete.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const feRoot = join(repoRoot, 'apps', 'web');
const appRoot = join(feRoot, 'src');
const primitivesRoot = join(appRoot, 'components');
const allowlistPath = join(__dirname, 'allowlist.json');
const galleryRoots = [
  join(appRoot, 'features', 'gallery'),
  join(appRoot, 'pages', 'gallery'),
];
const galleryRoot = galleryRoots.find(existsSync);

const listMode = process.argv.includes('--list');

if (!existsSync(primitivesRoot)) {
  console.log(
    'check:orphan (A6) OK — src/components/** does not exist yet; nothing to check.',
  );
  process.exit(0);
}
if (!galleryRoot) {
  console.error(
    'check:orphan (A6) FAILED — gallery missing at src/features/gallery or src/pages/gallery; importer graph coverage is unavailable.',
  );
  process.exit(1);
}

function walk(dir, exts = ['.ts', '.tsx']) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

const IMPORT_RE = /from\s+['"]([^'"]+)['"]/g;
const EXTS_TO_TRY = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

function resolveSpec(spec, fromFile) {
  let base;
  if (spec.startsWith('@/')) base = join(appRoot, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null; // external package
  const sourceBases = [base];
  const withoutJsExtension = base.replace(/\.jsx?$/, '');
  if (withoutJsExtension !== base) sourceBases.push(withoutJsExtension);
  for (const sourceBase of sourceBases) {
    for (const ext of EXTS_TO_TRY) {
      const candidate = sourceBase + ext;
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
  }
  return null;
}

const allFiles = walk(appRoot);
const importedBy = new Map(); // target file -> [importer relPaths]

for (const file of allFiles) {
  const content = readFileSync(file, 'utf8');
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(content))) {
    const target = resolveSpec(m[1], file);
    if (!target) continue;
    if (!importedBy.has(target)) importedBy.set(target, []);
    importedBy.get(target).push(relative(feRoot, file).replace(/\\/g, '/'));
  }
}

const primitiveFiles = walk(primitivesRoot).filter((f) => !f.includes('.test.'));
const orphans = [];
for (const file of primitiveFiles) {
  const relPath = relative(feRoot, file).replace(/\\/g, '/');
  const importers = importedBy.get(file) || [];
  const hasValidImporter = importers.length > 0; // gallery import already counted above
  if (!hasValidImporter) orphans.push(relPath);
}

const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8'));
const allowedOrphans = new Set((allowlist.orphan || []).map((e) => e.file));
const unlisted = orphans.filter((f) => !allowedOrphans.has(f));

if (listMode) {
  console.log(JSON.stringify(orphans, null, 2));
  process.exit(0);
}

if (unlisted.length > 0) {
  console.error(
    'check:orphan (A6) FAILED — primitive file(s) with zero importers (gallery counts as a valid importer):',
  );
  for (const f of unlisted) console.error(`  ${f}`);
  console.error(
    '\nWire it into the gallery (B6) at minimum, or add to allowlist.json ("orphan" section) with an owning wave.',
  );
  process.exit(1);
}

console.log(
  `check:orphan (A6) OK — ${primitiveFiles.length} primitive file(s) scanned, 0 unaccounted orphans.`,
);
