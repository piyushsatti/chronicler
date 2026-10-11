#!/usr/bin/env node
// A5 token-only-color gate. Extends the old app/components+app/pages,
// .tsx-only, prefix-only check:tokens grep to all of app/**, .ts+.tsx (+.css
// for the token-definition files themselves), any quoted hex literal (not
// just color:/background:/border:-prefixed), raw rgb()/hsl() literals,
// color-mix() with a literal color operand, hex-plus-alpha-suffix string
// concatenation, and out-of-tier --p-* references outside the semantic tier.
//
// Every match is tagged exactly one of:
//   owner-wave         file:line -> an Epic C wave that removes it (allowlist.json "tokens" section)
//   documented-exception  map-SVG cartography (tokens.css:442-area exception, see EXCEPTION_GLOBS) and Tailwind-retarget in tailwind.config
//
// --list prints every current match with its auto-tag, for regenerating the
// allowlist and for the issue's "counts regenerated from a committed script"
// acceptance criterion (run with --counts for the 3-bucket summary).
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

// Primitive-tier blocks in tokens.css are exempt: the raw-hex ban targets
// application code, not the token definitions the tiers are built from.
const PRIMITIVE_TIER_FILE = 'src/styles/tokens.css';

// Documented exceptions (finding L4 / the map-cartography exception).
//
// #455/#495 review FIX 6: the exception is SVG `stroke=`/`fill=` attributes
// in map cartography ONLY (tokens.css:442 records it) — NOT every hex/rgb
// literal anywhere under these paths. A blanket path exemption let plain
// CSS colors, non-SVG inline styles, etc. in map files skip owning-wave
// tagging entirely. isSvgStrokeFillLine() below narrows the exemption to
// the actual attribute; anything else in these paths falls through to
// owner-wave like everywhere else and needs a real allowlist wave.
const EXCEPTION_PATH_GLOBS = [
  /^src\/components\/map\//,
  /^src\/features\/map\//,
  /spike-map/,
  /map\/spike\//,
];
const SVG_STROKE_FILL_RE = /\b(stroke|fill)\s*=\s*(\{|["'])/;
function isSvgStrokeFillLine(text) {
  return SVG_STROKE_FILL_RE.test(text);
}

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

const files = walk(appRoot, ['.ts', '.tsx', '.css']);

// Quoted hex literal, anywhere (not prefix-gated).
const HEX_RE = /(['"])#[0-9a-fA-F]{3,8}\1/g;
// CSS-context hex (unquoted, e.g. `color: #abc123;`), still a literal.
const CSS_HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
// Raw rgb()/hsl() functions with numeric literal args (not var()-composed).
const RGB_HSL_RE = /\b(rgb|rgba|hsl|hsla)\(\s*[\d.]/g;
// color-mix() with a literal hex/rgb/hsl operand (var()-only color-mix is fine).
const COLOR_MIX_LITERAL_RE = /color-mix\([^)]*(#[0-9a-fA-F]{3,8}|\brgba?\(|\bhsla?\()/g;
// Hex-or-token string concatenated with a 2-char alpha suffix, e.g. `${col}1c`.
const ALPHA_SUFFIX_RE = /\$\{[^}]+\}[0-9a-fA-F]{2}[`'"]/g;
// --p-* referenced outside tokens.css (primitive tier leaking past the semantic tier).
const P_TOKEN_RE = /var\(\s*--p-[a-zA-Z0-9-]+/g;
// Tailwind color classes in .tsx (scope corrected 2026-08-02, finding L4):
// tailwind.config itself retargets these at semantic tokens per fork 11 and
// is exempt, not scanned (it's not under app/**.tsx anyway).
const TAILWIND_CLASS_RE =
  /\b(text-text-[\w-]+|bg-bg-[\w-]+|border-border[\w-]*|text-accent\b)/g;

function scan(file, relPath) {
  // tokens.css is routed through scanTokensCss instead (primitive-tier exemption).
  const isCss = relPath.endsWith('.css');
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const hits = [];
  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    const push = (rule) => hits.push({ file: relPath, line: lineNo, rule, text: line });

    const hexRe = isCss ? CSS_HEX_RE : HEX_RE;
    hexRe.lastIndex = 0;
    while (hexRe.exec(line) !== null) push('raw-hex');

    RGB_HSL_RE.lastIndex = 0;
    while (RGB_HSL_RE.exec(line) !== null) push('raw-rgb-hsl');

    COLOR_MIX_LITERAL_RE.lastIndex = 0;
    while (COLOR_MIX_LITERAL_RE.exec(line) !== null) push('color-mix-literal');

    ALPHA_SUFFIX_RE.lastIndex = 0;
    while (ALPHA_SUFFIX_RE.exec(line) !== null) push('alpha-suffix-concat');

    if (!isCss) {
      P_TOKEN_RE.lastIndex = 0;
      while (P_TOKEN_RE.exec(line) !== null) push('p-tier-outside-semantic');
    }

    if (relPath.endsWith('.tsx')) {
      TAILWIND_CLASS_RE.lastIndex = 0;
      while (TAILWIND_CLASS_RE.exec(line) !== null) push('tailwind-color-class');
    }
  });
  return hits;
}

// tokens.css needs its own pass: skip the --p-* primitive blocks entirely
// (raw hex there is correct-by-design), but still catch --p-* *usage*
// outside SECTION 2A (semantic/component tiers referencing primitives
// directly, which A5 also bans).
function scanTokensCss(file, relPath) {
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const hits = [];
  let inPrimitiveTier = false;
  let inSemanticTier = false;
  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    if (/SECTION 2A: PRIMITIVE TIER/.test(line)) {
      inPrimitiveTier = true;
      inSemanticTier = false;
    }
    if (/SECTION 2B: SEMANTIC TIER/.test(line)) {
      inPrimitiveTier = false;
      inSemanticTier = true;
    }
    if (/=== SECTION [3-5]/.test(line)) inSemanticTier = false; // past 2B, component/status tiers
    // SECTION 6 (#452 fork 9 / #495 review FIX 1) is also a semantic-tier
    // consumer by design: --cat-*/--evt-*/--rarity-*/--region-* alias the
    // theme-invariant --p-quintet-*/--p-region-mark-* primitives declared
    // in 2A. Same rule as 2B ("only the semantic tier reads --p-*"), a
    // second theme-invariant view rather than a second implementation.
    if (/=== SECTION 6:/.test(line)) inSemanticTier = true;
    if (/=== SECTION 7:/.test(line)) inSemanticTier = false; // component tier: back to raw-hex ban
    if (inPrimitiveTier) return; // primitive-tier exemption: hex literals here are correct-by-design
    if (inSemanticTier) return; // semantic tier is exactly the thing allowed to read --p-*
    P_TOKEN_RE.lastIndex = 0;
    while (P_TOKEN_RE.exec(line) !== null)
      hits.push({ file: relPath, line: lineNo, rule: 'p-tier-outside-semantic' });
  });
  return hits;
}

let all = [];
for (const file of files) {
  const relPath = relative(feRoot, file).replace(/\\/g, '/');
  if (relPath.endsWith('.test.ts') || relPath.endsWith('.test.tsx')) continue;
  if (relPath === PRIMITIVE_TIER_FILE) {
    all.push(...scanTokensCss(file, relPath));
    continue;
  }
  all.push(...scan(file, relPath));
}

function tag(hit) {
  if (
    EXCEPTION_PATH_GLOBS.some((re) => re.test(hit.file)) &&
    isSvgStrokeFillLine(hit.text || '')
  ) {
    return 'documented-exception';
  }
  return 'owner-wave';
}

const tagged = all.map((h) => {
  const { text: _text, ...rest } = h;
  return { ...rest, tag: tag(h) };
});

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
  (allowlist.tokens || []).map((e) => `${e.file}:${e.line}:${e.rule}`),
);

const unlisted = tagged.filter((h) => {
  if (h.tag === 'documented-exception' || h.tag === 'deleted-with-source') return false;
  return !allowed.has(`${h.file}:${h.line}:${h.rule}`);
});

if (unlisted.length > 0) {
  console.error(
    'check:tokens FAILED — new token-only-color violation(s) not in scripts/design-gates/allowlist.json:',
  );
  for (const v of unlisted) console.error(`  ${v.file}:${v.line}  [${v.rule}]`);
  console.error(
    '\nUse a --color-*/--p-* token, or if intentionally deferred, add an entry to allowlist.json ("tokens" section) with an owning Epic C wave.',
  );
  process.exit(1);
}

console.log(
  `check:tokens (A5) OK — ${tagged.length} known occurrence(s) (owner-wave: ${tagged.filter((t) => t.tag === 'owner-wave').length}, documented-exception: ${tagged.filter((t) => t.tag === 'documented-exception').length}, deleted-with-source: ${tagged.filter((t) => t.tag === 'deleted-with-source').length}), all accounted for.`,
);
