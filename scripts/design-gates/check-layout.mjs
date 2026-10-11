#!/usr/bin/env node
// A8 layout-API gate (epic-a-tokens-and-enforcement #458). Flags inline
// `display:flex`/`justifyContent:…` style-object mechanics repeated per
// component — the defect class C9 (design-language.md) replaces with the
// data-justify/data-align/data-cols/data-gap sheet (src/styles/layout.css).
//
// Same allowlist/ratchet pattern as A5 check-tokens.mjs: every match is
// either an owner-wave violation (allowlist.json "layout" section, an
// Epic C wave removes it) or unlisted and red.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const feRoot = join(repoRoot, 'apps', 'web');
const appRoot = join(feRoot, 'src');
const allowlistPath = join(__dirname, 'allowlist.json');

const args = process.argv.slice(2);
const listMode = args.includes('--list');
const countsMode = args.includes('--counts');

// Map/cartography SVG positioning is a documented exception, same scope
// as A5's raw-hex exception (map math isn't a component layout mechanic).
const EXCEPTION_PATH_GLOBS = [
  /^src\/components\/map\//,
  /^src\/features\/map\//,
  /spike-map/,
  /map\/spike\//,
];

function walk(dir, exts) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

const files = walk(appRoot, ['.ts', '.tsx']);

// Inline style objects/attrs carrying flex/grid layout mechanics.
// `style={{ display: 'flex', ... }}` or a `justifyContent:`/`alignItems:`
// property anywhere in a style object literal.
const INLINE_DISPLAY_RE = /style=\{\{[^}]*display:\s*['"](flex|grid|inline-flex)['"]/;
const INLINE_JUSTIFY_RE = /justifyContent:\s*['"][\w-]+['"]/;
const INLINE_ALIGN_RE = /alignItems:\s*['"][\w-]+['"]/;

function scan(file, relPath) {
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const hits = [];
  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    if (INLINE_DISPLAY_RE.test(line))
      hits.push({ file: relPath, line: lineNo, rule: 'inline-flex-display' });
    if (INLINE_JUSTIFY_RE.test(line))
      hits.push({ file: relPath, line: lineNo, rule: 'inline-justify-content' });
    if (INLINE_ALIGN_RE.test(line))
      hits.push({ file: relPath, line: lineNo, rule: 'inline-align-items' });
  });
  return hits;
}

let all = [];
for (const file of files) {
  const relPath = relative(feRoot, file).replace(/\\/g, '/');
  if (relPath.endsWith('.test.ts') || relPath.endsWith('.test.tsx')) continue;
  all.push(...scan(file, relPath));
}

function tag(hit) {
  if (EXCEPTION_PATH_GLOBS.some((re) => re.test(hit.file)))
    return 'documented-exception';
  return 'owner-wave';
}

const tagged = all.map((h) => ({ ...h, tag: tag(h) }));

if (countsMode) {
  const counts = {
    'owner-wave': 0,
    'documented-exception': 0,
    'deleted-with-source': 0,
  };
  for (const t of tagged) counts[t.tag]++;
  console.log(JSON.stringify({ total: tagged.length, ...counts }, null, 2));
  process.exit(0);
}

if (listMode) {
  console.log(JSON.stringify(tagged, null, 2));
  process.exit(0);
}

const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8'));
const allowed = new Set(
  (allowlist.layout || []).map((e) => `${e.file}:${e.line}:${e.rule}`),
);

const unlisted = tagged.filter((h) => {
  if (h.tag === 'documented-exception' || h.tag === 'deleted-with-source') return false;
  return !allowed.has(`${h.file}:${h.line}:${h.rule}`);
});

if (unlisted.length > 0) {
  console.error(
    'check:layout FAILED — new inline-flex layout violation(s) not in scripts/design-gates/allowlist.json:',
  );
  for (const v of unlisted) console.error(`  ${v.file}:${v.line}  [${v.rule}]`);
  console.error(
    '\nUse a .stack/.row/.cols class plus data-justify/data-align/data-cols/data-gap (src/styles/layout.css), or if intentionally deferred, add an entry to allowlist.json ("layout" section) with an owning Epic C wave.',
  );
  process.exit(1);
}

console.log(
  `check:layout (A8) OK — ${tagged.length} known occurrence(s) (owner-wave: ${tagged.filter((t) => t.tag === 'owner-wave').length}, documented-exception: ${tagged.filter((t) => t.tag === 'documented-exception').length}, deleted-with-source: ${tagged.filter((t) => t.tag === 'deleted-with-source').length}), all accounted for.`,
);
