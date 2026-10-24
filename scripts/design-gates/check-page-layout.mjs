#!/usr/bin/env node
// L5 page-layout drift gate (round 3 layout spec). Pages drifted apart
// because widths, card minimums and filter placement were per-page literals.
// This gate fails when, outside src/styles/tokens.css:
//   css-width-literal   a max-width / max-inline-size / width / inline-size
//                       declaration carries a literal length >= 160px
//                       (10rem/10em) instead of a layout token;
//   grid-card-min       grid-template-columns uses a literal minmax(<len>
//                       card minimum instead of --card-min or CardGrid;
//   page-max-wide       a TSX file passes max="wide" to PageShell (there is
//                       one page width);
//   filter-sidebar      a features/*/pages file renders an <aside> or a
//                       sidebar class (index-page filters belong in FilterBar;
//                       detail pages use SplitPane / MasterDetail).
//
// Allowlist (allowlist.json): `pageLayout` holds justified exceptions, each
// with a `reason`; `pageLayoutPendingMigration` holds current violations that
// page migration removes. Entries key on file + rule + value (not line, so
// unrelated edits do not invalidate them) and are consumed one hit each.
// Both sections are ratcheted (ratchet-floor.json). Stale entries are
// reported so they can be deleted.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const feRoot = join(repoRoot, 'apps', 'web');
const appRoot = join(feRoot, 'src');
const allowlistPath = join(__dirname, 'allowlist.json');
const listMode = process.argv.includes('--list');
const jsonMode = process.argv.includes('--json');

const TOKEN_FILES = new Set(['src/styles/tokens.css']);
const MIN_PX = 160;
const PX_PER = { px: 1, rem: 16, em: 16 };

function walk(dir, exts) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

function stripCssComments(css) {
  // Keep line numbers: replace comment bodies with the same count of newlines.
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

const WIDTH_DECL_RE =
  /(?<![\w-])(max-width|max-inline-size|width|inline-size)\s*:\s*([^;{}]+)/g;
const GRID_DECL_RE = /(?<![\w-])grid-template-columns\s*:\s*([^;{}]+)/g;
const LENGTH_RE = /(?<![\w.-])(\d+(?:\.\d+)?)(px|rem|em)\b/g;
const LITERAL_MINMAX_RE = /minmax\(\s*(?:min\(\s*)?\d+(?:\.\d+)?(?:px|rem|em)\b/;

export function scanCss(relPath, css) {
  const hits = [];
  const lines = stripCssComments(css).split('\n');
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    // Container/media conditions are breakpoints, not widths.
    if (trimmed.startsWith('@')) return;
    for (const m of line.matchAll(WIDTH_DECL_RE)) {
      const value = m[2].trim();
      for (const len of value.matchAll(LENGTH_RE)) {
        const px = Number(len[1]) * PX_PER[len[2]];
        if (px >= MIN_PX) {
          hits.push({
            file: relPath,
            line: idx + 1,
            rule: 'css-width-literal',
            value: `${m[1]}: ${value}`,
          });
          break;
        }
      }
    }
    for (const m of line.matchAll(GRID_DECL_RE)) {
      const value = m[1].trim();
      if (LITERAL_MINMAX_RE.test(value)) {
        hits.push({
          file: relPath,
          line: idx + 1,
          rule: 'grid-card-min',
          value: `grid-template-columns: ${value}`,
        });
      }
    }
  });
  return hits;
}

const PAGE_MAX_WIDE_RE = /\bmax=(?:"wide"|'wide'|\{[^}]*['"]wide['"][^}]*\})/;
const ASIDE_RE = /<aside\b/;
const SIDEBAR_RE = /[\w.-]*sidebar[\w-]*/i;

export function scanTsx(relPath, src) {
  const hits = [];
  const isPage = /^src\/features\/[^/]+\/pages\//.test(relPath);
  src.split('\n').forEach((line, idx) => {
    if (PAGE_MAX_WIDE_RE.test(line) && /PageShell|max=/.test(line)) {
      hits.push({
        file: relPath,
        line: idx + 1,
        rule: 'page-max-wide',
        value: 'max="wide"',
      });
    }
    if (!isPage) return;
    const code = line.replace(/\/\/.*$/, '');
    if (ASIDE_RE.test(code)) {
      hits.push({
        file: relPath,
        line: idx + 1,
        rule: 'filter-sidebar',
        value: '<aside>',
      });
    } else if (SIDEBAR_RE.test(code) && !/^\s*(import\b|\*|\/\*)/.test(code)) {
      hits.push({
        file: relPath,
        line: idx + 1,
        rule: 'filter-sidebar',
        value: code.match(SIDEBAR_RE)[0],
      });
    }
  });
  return hits;
}

function collect() {
  const hits = [];
  for (const file of walk(appRoot, ['.css'])) {
    const relPath = relative(feRoot, file).replace(/\\/g, '/');
    if (TOKEN_FILES.has(relPath)) continue;
    hits.push(...scanCss(relPath, readFileSync(file, 'utf8')));
  }
  for (const file of walk(appRoot, ['.tsx', '.ts'])) {
    const relPath = relative(feRoot, file).replace(/\\/g, '/');
    if (/\.test\.tsx?$/.test(relPath)) continue;
    hits.push(...scanTsx(relPath, readFileSync(file, 'utf8')));
  }
  return hits;
}

const keyOf = (e) => `${e.file}|${e.rule}|${e.value}`;

function main() {
  const hits = collect();
  const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8'));
  const justified = allowlist.pageLayout ?? [];
  const pending = allowlist.pageLayoutPendingMigration ?? [];
  const problems = [];
  for (const entry of justified) {
    if (!entry.reason)
      problems.push(`pageLayout entry without a reason: ${keyOf(entry)}`);
  }
  const budget = new Map();
  for (const entry of [...justified, ...pending]) {
    budget.set(keyOf(entry), (budget.get(keyOf(entry)) ?? 0) + 1);
  }
  const unlisted = [];
  for (const hit of hits) {
    const k = keyOf(hit);
    const left = budget.get(k) ?? 0;
    if (left > 0) budget.set(k, left - 1);
    else unlisted.push(hit);
  }
  const stale = [...budget]
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k}${n > 1 ? ` (x${n})` : ''}`);

  if (jsonMode) {
    console.log(JSON.stringify(hits, null, 2));
    return;
  }
  if (listMode) {
    for (const h of hits) console.log(`${h.file}:${h.line} ${h.rule} ${h.value}`);
  }
  for (const s of stale)
    console.warn(`check:page-layout stale allowlist entry (remove it): ${s}`);
  if (problems.length || unlisted.length) {
    console.error(
      `check:page-layout (L5) FAILED — ${unlisted.length} unlisted violation(s)`,
    );
    for (const p of problems) console.error(`  ${p}`);
    for (const h of unlisted)
      console.error(`  ${h.file}:${h.line} ${h.rule} ${h.value}`);
    console.error(
      '  Use the layout tokens (--page-max, --page-max-reading, --rail-width, --card-min), CardGrid, FilterBar, or SplitPane/MasterDetail.',
    );
    process.exit(1);
  }
  console.log(
    `check:page-layout (L5) OK — ${hits.length} hit(s) all allowlisted (${justified.length} justified, ${pending.length} pending migration)`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
