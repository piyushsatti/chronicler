#!/usr/bin/env node
// A6 duplication gate: for every ruled primitive in primitives.registry.ts,
// fail if a second implementation exists — i.e. the same primitive name is
// exported (function/const/class/default) from more than one file under
// app/**, excluding tests and the registry itself. Epic B has not shipped
// (no src/components/primitives/** tree yet), so a clean run today means
// zero registry names have ANY implementation, let alone two; the gate
// exists so B6's builders trip it the moment a second `Button.tsx` lands
// next to an existing hand-rolled one instead of replacing it.
//
// #456 (A6) review FIX 3: this alone misses the case the issue actually
// names — two components that render the SAME thing under different
// names (HexGrid/HexCell vs the map spike's HexTile/HexcrawlView), which
// never shares a registry entry name so the exact-name check above can't
// see it. Second mechanism: NAME-SIMILARITY clustering. Any file whose
// exported component/default name starts with a shared prefix word (case
// -insensitive) under src/**/map/** is grouped; a cluster of size >= 2
// must carry a `// duplication-justified: <reason>` comment in every file
// of the cluster, or the gate fails. This is deliberately a path-scoped
// heuristic (map renderers only, not a general fuzzy-match over the whole
// tree) — false positives elsewhere would just train people to ignore it.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const feRoot = join(repoRoot, 'apps', 'web');
const appRoot = join(feRoot, 'src');
const allowlistPath = join(__dirname, 'allowlist.json');

const listMode = process.argv.includes('--list');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

// Plain node has no TS loader for these gate scripts (they run as .mjs), so
// the registry is read by regex scrape rather than import — same technique
// the other check-*.mjs scripts use for reading .ts source without a build
// step. Keep primitives.registry.ts's `{ id, name: '...', group: ... }`
// shape stable or update this regex alongside it.
const registrySrc = readFileSync(
  join(appRoot, 'styles', 'primitives.registry.ts'),
  'utf8',
);
const names = [...registrySrc.matchAll(/name:\s*'([^']+)'/g)].map((m) => m[1]);
if (names.length === 0) {
  console.error(
    'check:duplication (A6) FAILED — could not read any primitive names from src/styles/primitives.registry.ts',
  );
  process.exit(1);
}

const EXPORT_RE_TEMPLATE = (name) =>
  new RegExp(`\\bexport\\s+(default\\s+)?(function|const|class)\\s+${name}\\b`);

const files = walk(appRoot).filter(
  (f) => !f.includes('.test.') && !f.endsWith(join('styles', 'primitives.registry.ts')),
);

const byName = new Map(names.map((n) => [n, []]));
for (const file of files) {
  const relPath = relative(feRoot, file).replace(/\\/g, '/');
  const content = readFileSync(file, 'utf8');
  for (const name of names) {
    if (EXPORT_RE_TEMPLATE(name).test(content)) byName.get(name).push(relPath);
  }
}

const dupes = [...byName.entries()].filter(([, locs]) => locs.length > 1);

// ---- Name-similarity cluster detection (map hex renderers) ----
const MAP_COMPONENT_RE = /\bmap\//;
const COMPONENT_EXPORT_RE =
  /export\s+(default\s+)?(function|const|class)\s+([A-Z][A-Za-z0-9]*)/g;
const JUSTIFIED_RE = /\/\/\s*duplication-justified:\s*(.+)/;

// First "word" of a PascalCase file basename, e.g. HexGrid.tsx -> hex,
// HexcrawlView.tsx -> hexcrawl, HexTile.tsx -> hex. Grouping on this word
// (file-level, not per-export — icons.tsx exporting 8 Ic* icons from ONE
// file is not "duplication") is what catches HexGrid/HexCell vs a spike's
// HexTile/HexcrawlView as one cluster without hardcoding filenames.
// Generic domain nouns are excluded: every map component legitimately
// says "Map"/"Region"/"Feature" and clustering on those words alone would
// just be noise, training people to ignore the gate.
const GENERIC_PREFIX_STOPLIST = new Set([
  'map',
  'region',
  'feature',
  'ic',
  'r',
  'port',
]);
function leadingWord(basename) {
  const m = basename.match(/^[A-Z][a-z0-9]*/);
  return m ? m[0].toLowerCase() : basename.toLowerCase();
}

const mapFiles = files.filter((f) =>
  MAP_COMPONENT_RE.test(relative(feRoot, f).replace(/\\/g, '/')),
);
const clusters = new Map(); // leadingWord -> [{relPath, exportName, justified}]
for (const file of mapFiles) {
  const relPath = relative(feRoot, file).replace(/\\/g, '/');
  const basename = relPath
    .split('/')
    .pop()
    .replace(/\.tsx?$/, '');
  const key = leadingWord(basename);
  if (key.length < 3 || GENERIC_PREFIX_STOPLIST.has(key)) continue;
  const content = readFileSync(file, 'utf8');
  const justified = JUSTIFIED_RE.test(content);
  const exportNames = [];
  let m;
  COMPONENT_EXPORT_RE.lastIndex = 0;
  while ((m = COMPONENT_EXPORT_RE.exec(content))) exportNames.push(m[3]);
  if (!clusters.has(key)) clusters.set(key, []);
  clusters.get(key).push({ relPath, exportNames, justified });
}

const unjustifiedClusters = [...clusters.entries()].filter(
  ([, entries]) => entries.length > 1 && entries.some((e) => !e.justified),
);

const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8'));
const allowedDupes = new Set((allowlist.duplication || []).map((e) => e.primitive));

const unlisted = dupes.filter(([name]) => !allowedDupes.has(name));

if (listMode) {
  console.log(
    JSON.stringify(
      {
        exactNameDupes: dupes.map(([name, locs]) => ({
          primitive: name,
          locations: locs,
        })),
        nameSimilarityClusters: [...clusters.entries()]
          .filter(([, entries]) => entries.length > 1)
          .map(([key, entries]) => ({ cluster: key, entries })),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (unlisted.length > 0) {
  console.error(
    'check:duplication (A6) FAILED — ruled primitive(s) with a second implementation:',
  );
  for (const [name, locs] of unlisted) {
    console.error(`  ${name}:`);
    for (const l of locs) console.error(`    ${l}`);
  }
  console.error(
    '\nOne implementation per ruled primitive (registry: src/styles/primitives.registry.ts). Delete the second one or add it to allowlist.json ("duplication" section) with an owning wave.',
  );
  process.exit(1);
}

if (unjustifiedClusters.length > 0) {
  console.error(
    'check:duplication (A6) FAILED — near-duplicate map component cluster(s) missing a `// duplication-justified: <reason>` comment:',
  );
  for (const [key, entries] of unjustifiedClusters) {
    console.error(`  "${key}*" cluster:`);
    for (const e of entries)
      console.error(
        `    ${e.relPath} (${e.exportNames.join(', ')})${e.justified ? ' [justified]' : ' [MISSING COMMENT]'}`,
      );
  }
  console.error(
    '\nAdd `// duplication-justified: <reason>` near the export in every file of the cluster if the duplication is intentional (e.g. a spike vs the real component), or converge them into one implementation.',
  );
  process.exit(1);
}

console.log(
  `check:duplication (A6) OK — 0 unaccounted duplicate primitive implementation(s) across ${names.length} registry entries, 0 unjustified name-similarity cluster(s).`,
);
