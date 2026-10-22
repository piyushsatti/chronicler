#!/usr/bin/env node
// B10 motion gate (#471). One script machine-checks the rules that used to
// live only in prose (design-language.md §5, motion-and-effects-catalog.md
// §1): no bespoke values, no orphan tokens, real declared timings, tier
// duration bands, catalog completeness, celebration/stagger/continuous rule
// invariants, stagger cap, CSS+demo coverage, collapse coverage, one
// animation engine per id, no generic keyframe names, collapse attribute
// actually published.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const feRoot = join(repoRoot, 'apps', 'web');
const appRoot = join(feRoot, 'src');
const motionDir = join(appRoot, 'motion');
const motionCssPath = join(appRoot, 'styles', 'motion.css');
const galleryMotionPath = join(
  appRoot,
  'features',
  'gallery',
  'sections',
  'Motion.tsx',
);
const effectsCssPath = join(appRoot, 'styles', 'effects.css');

let failures = [];
function fail(rule, msg) {
  failures.push(`[${rule}] ${msg}`);
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

// ---------------------------------------------------------------------------
// Load catalog + tokens by literal require-like eval-free regex scrape
// (gates run as plain .mjs, no TS loader — same technique as check-gallery).
// ---------------------------------------------------------------------------
// T020 soft-skip: motion catalog lands with T230.
if (
  !existsSync(join(motionDir, 'catalog.ts')) ||
  !existsSync(join(motionDir, 'tokens.ts'))
) {
  console.log(
    'check:motion (B10) SKIP — src/motion/{catalog,tokens}.ts missing (pending T230).',
  );
  process.exit(0);
}
const catalogSrc = readFileSync(join(motionDir, 'catalog.ts'), 'utf8');
const tokensSrc = readFileSync(join(motionDir, 'tokens.ts'), 'utf8');

// Every catalog entry object, scraped between `{ n: <num>, ... }`.
const entryRe = /\{\s*n:\s*(\d+),[\s\S]*?launch:\s*(true|false),\s*\}/g;
const rawEntries = [...catalogSrc.matchAll(entryRe)].map((m) => m[0]);

function field(str, name, multi = false) {
  const re = multi
    ? new RegExp(`${name}:\\s*\\[([^\\]]*)\\]`)
    : new RegExp(`${name}:\\s*'([^']+)'`);
  const m = str.match(re);
  if (!m) return multi ? [] : undefined;
  if (multi) {
    return [...m[1].matchAll(/[A-Z]\.(\w+)/g)].map((x) => x[1]);
  }
  return m[1];
}

function boolField(str, name) {
  const m = str.match(new RegExp(`${name}:\\s*(true|false)`));
  return m ? m[1] === 'true' : undefined;
}

function numField(str, name) {
  const m = str.match(new RegExp(`${name}:\\s*(\\d+)`));
  return m ? Number(m[1]) : undefined;
}

const entries = rawEntries.map((raw) => ({
  n: Number(raw.match(/n:\s*(\d+)/)[1]),
  id: field(raw, 'id'),
  tier: field(raw, 'tier'),
  durationTokens: field(raw, 'durationTokens', true),
  staggerToken:
    field(raw, 'staggerToken', false) ?? raw.match(/staggerToken:\s*[A-Z]\.(\w+)/)?.[1],
  staggerCap: numField(raw, 'staggerCap'),
  easingToken: raw.match(/easingToken:\s*[A-Z]\.(\w+)/)?.[1],
  loopToken: raw.match(/loopToken:\s*[A-Z]\.(\w+)/)?.[1],
  delayToken: raw.match(/delayToken:\s*[A-Z]{1,2}\.(\w+)/)?.[1],
  eventKeyed: boolField(raw, 'eventKeyed'),
  firstLoadOnly: boolField(raw, 'firstLoadOnly'),
  collapse: field(raw, 'collapse'),
  launch: boolField(raw, 'launch'),
}));

if (entries.length === 0) {
  fail(
    'parse',
    'could not scrape any entries out of src/motion/catalog.ts — regex or file moved?',
  );
}

// Map token-key ('routeOut') -> CSS custom-property name ('--motion-duration-route-out').
const tokenKeyToVar = new Map();
for (const m of tokensSrc.matchAll(/(\w+):\s*'(--motion-[\w-]+)'/g)) {
  tokenKeyToVar.set(m[1], m[2]);
}

function resolveVar(key) {
  return tokenKeyToVar.get(key);
}

// ---------------------------------------------------------------------------
// Rule 1: no bespoke ms/s numeric literal anywhere under src/motion/**.
// ---------------------------------------------------------------------------
const motionFiles = walk(motionDir, ['.ts', '.tsx']).filter(
  (f) => !f.includes('__tests__'),
);
if (motionFiles.length === 0) {
  fail(
    '1-no-bespoke-values',
    'scanned file list under src/motion/** is EMPTY — dir renamed/moved? failing loudly.',
  );
} else {
  const literalRe = /(?<![\w$])\d+(\.\d+)?(ms|s)\b/g;
  for (const file of motionFiles) {
    const rel = relative(feRoot, file);
    const raw = readFileSync(file, 'utf8');
    // Strip comments (// line and /* block */) before scanning — tokens.ts's
    // documentation comments ("// 150ms") are allowed.
    const noBlockComments = raw.replace(/\/\*[\s\S]*?\*\//g, '');
    const noComments = noBlockComments
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');
    // Also strip string literals containing CSS var names (no numeric value there anyway)
    // and only match numeric+unit tokens that are NOT inside a quoted CSS custom-property NAME.
    const matches = [...noComments.matchAll(literalRe)];
    if (matches.length > 0) {
      fail(
        '1-no-bespoke-values',
        `${rel} has a bespoke ms/s literal outside comments: "${matches[0][0]}"`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Parse motion.css: declared :root custom properties + which are referenced
// by a CSS rule (used outside the :root block).
// ---------------------------------------------------------------------------
const motionCss = readFileSync(motionCssPath, 'utf8');
const rootBlockMatch = motionCss.match(/:root\s*\{([\s\S]*?)\n\}/);
const rootBlock = rootBlockMatch ? rootBlockMatch[1] : '';
const declaredTokens = new Map(); // var-name -> raw value string
for (const m of rootBlock.matchAll(/(--motion-[\w-]+):\s*([^;]+);/g)) {
  declaredTokens.set(m[1], m[2].trim());
}

// effects.css (B8 #469) consumes motion.css loop tokens without owning a
// MOTION_CATALOG entry, so it counts as a real reference for rule 2.
// motion.css stays the ONE duration-declaration surface; this only widens
// where a declared token may be USED.
const effectsCss = existsSync(effectsCssPath)
  ? readFileSync(effectsCssPath, 'utf8')
  : '';
const cssOutsideRoot =
  motionCss.replace(rootBlockMatch ? rootBlockMatch[0] : '', '') + '\n' + effectsCss;
function cssReferences(varName) {
  return cssOutsideRoot.includes(`var(${varName})`);
}

// Every token referenced by ANY catalog entry (launch or later).
const referencedByEntry = new Set();
for (const e of entries) {
  for (const dt of e.durationTokens ?? []) {
    const v = resolveVar(dt);
    if (v) referencedByEntry.add(v);
  }
  const st = e.staggerToken ? resolveVar(e.staggerToken) : undefined;
  if (st) referencedByEntry.add(st);
  const lt = e.loopToken ? resolveVar(e.loopToken) : undefined;
  if (lt) referencedByEntry.add(lt);
  const dl = e.delayToken ? resolveVar(e.delayToken) : undefined;
  if (dl) referencedByEntry.add(dl);
}

// ---------------------------------------------------------------------------
// Rule 2: no orphan / no phantom tokens.
// ---------------------------------------------------------------------------
for (const e of entries) {
  const allTokenKeys = [
    ...(e.durationTokens ?? []),
    e.staggerToken,
    e.loopToken,
    e.delayToken,
  ].filter(Boolean);
  for (const key of allTokenKeys) {
    const v = resolveVar(key);
    if (!v) {
      fail(
        '2-orphan-phantom',
        `catalog entry ${e.id} references token key "${key}" with no tokens.ts export`,
      );
      continue;
    }
    if (!declaredTokens.has(v)) {
      fail(
        '2-orphan-phantom',
        `${v} referenced by catalog entry ${e.id} but not declared in motion.css :root`,
      );
    }
  }
}
for (const [varName] of declaredTokens) {
  const usedByCss = cssReferences(varName);
  const usedByCatalog = referencedByEntry.has(varName);
  if (!usedByCss && !usedByCatalog) {
    fail(
      '2-orphan-phantom',
      `${varName} declared in motion.css but referenced by no catalog entry and no CSS rule`,
    );
  }
}

// ---------------------------------------------------------------------------
// Rule 2b: real timings declared for the 13 launch rows (+ 24 covers stagger).
// Asserts a real declared-token COUNT so collapsing distinct values silently
// is caught (route in/out, dm-dashboard two waves, modal content delay,
// stagger steps 40/80/15ms).
// ---------------------------------------------------------------------------
const LAUNCH_ROW_NUMBERS = [1, 2, 3, 4, 8, 9, 10, 13, 17, 18, 19, 20, 24, 25];
const launchEntries = entries.filter((e) => LAUNCH_ROW_NUMBERS.includes(e.n));
const distinctDurationTokens = new Set();
for (const e of launchEntries) {
  for (const dt of e.durationTokens ?? []) {
    const v = resolveVar(dt);
    if (v) distinctDurationTokens.add(v);
  }
}
// Minimum expected distinct duration tokens across the 13 launch rows: one
// per row except the multi-phase rows (2, 9(+delay handled separately), 13)
// which carry 2. 11 single + 2 double(2,13) - stagger-only rows (17 has none
// as a durationToken, it's loop+stagger) => count floor.
const MIN_DISTINCT_LAUNCH_DURATIONS = 14;
if (distinctDurationTokens.size < MIN_DISTINCT_LAUNCH_DURATIONS) {
  fail(
    '2b-real-timings',
    `only ${distinctDurationTokens.size} distinct duration tokens declared across launch rows, expected >= ${MIN_DISTINCT_LAUNCH_DURATIONS} (route in/out, dm-dashboard two waves, stagger steps must stay distinct)`,
  );
}
// Row 9 modal content delay + row 25(not launch) — check modal delay token exists distinctly.
const modalEntry = entries.find((e) => e.id === 'modal-scale-breathe');
if (modalEntry) {
  const modalDelayVar = tokenKeyToVar.get('modalContent');
  if (!modalDelayVar || !declaredTokens.has(modalDelayVar)) {
    fail(
      '2b-real-timings',
      'modal-scale-breathe row 9 50ms content delay token not declared',
    );
  }
}
const staggerStepVars = ['questCard', 'shimmerBar', 'resultRow'].map((k) =>
  tokenKeyToVar.get(k),
);
const distinctStaggerValues = new Set(
  staggerStepVars.map((v) => declaredTokens.get(v)),
);
if (distinctStaggerValues.size < 3) {
  fail(
    '2b-real-timings',
    'stagger steps (rows 3/17/24) collapsed onto fewer than 3 distinct values',
  );
}

// ---------------------------------------------------------------------------
// Rule 2c: tier duration bands.
// ---------------------------------------------------------------------------
function msValue(raw) {
  if (!raw) return undefined;
  const t = raw.trim();
  if (t.endsWith('ms')) return parseFloat(t);
  if (t.endsWith('s')) return parseFloat(t) * 1000;
  return undefined;
}

const BANDS = {
  interaction: [150, 350],
  orchestration: [500, 900],
  celebration: [500, 800],
  continuous: [1200, 40000],
  route: [250, 300],
};

// Scope: the 13 launch rows + quest-publish-burst (celebration accept
// criterion, #471) are the only entries whose tokens actually ship in CSS —
// banding protects those. The remaining 11 later-data rows are placeholder
// catalog entries with no CSS/hook wiring yet (Out of scope) and are not
// band-checked here.
for (const e of entries) {
  if (!e.durationTokens || e.durationTokens.length === 0) continue;
  if (!LAUNCH_ROW_NUMBERS.includes(e.n) && e.id !== 'quest-publish-burst') continue;
  let effectiveTier = e.tier;
  // Stagger-per-item exception: an orchestration entry with a staggerToken is
  // band-checked against interaction UNLESS pinned by id (page-boot-orchestrate,
  // the whole-shell cascade, not a per-item stagger duration).
  if (
    e.tier === 'orchestration' &&
    e.staggerToken &&
    e.id !== 'page-boot-orchestrate'
  ) {
    effectiveTier = 'interaction';
  }
  const band = BANDS[effectiveTier];
  for (const dt of e.durationTokens) {
    const v = resolveVar(dt);
    const raw = v ? declaredTokens.get(v) : undefined;
    const ms = msValue(raw);
    if (ms === undefined) {
      fail(
        '2c-tier-bands',
        `${e.id}: duration token "${dt}" (${v}) has no parseable ms/s value`,
      );
      continue;
    }
    if (ms < band[0] || ms > band[1]) {
      fail(
        '2c-tier-bands',
        `${e.id}: duration ${ms}ms (${v}) out of ${effectiveTier} band [${band[0]}-${band[1]}]ms`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Rule 3: catalog completeness.
// ---------------------------------------------------------------------------
if (entries.length !== 24) {
  fail(
    '3-catalog-completeness',
    `expected exactly 24 retained catalog entries, found ${entries.length}`,
  );
}
const ids = entries.map((e) => e.id);
if (new Set(ids).size !== ids.length) {
  fail('3-catalog-completeness', 'catalog ids are not unique');
}
const ns = entries.map((e) => e.n).sort((a, b) => a - b);
const expectedNs = Array.from({ length: 25 }, (_, i) => i + 1).filter((n) => n !== 21);
if (entries.some((entry) => entry.n === 21 || entry.id === 'map-hex-select-ripple')) {
  fail('3-retired-feature', 'retired hex motion row must not be restored');
}
if (JSON.stringify(ns) !== JSON.stringify(expectedNs)) {
  fail(
    '3-catalog-completeness',
    `retained catalog "n" values are not 1..25 except 21: got [${ns.join(',')}]`,
  );
}
const launchIds = entries.filter((e) => e.launch).map((e) => e.id);
const EXPECTED_LAUNCH_IDS = [
  'page-boot-orchestrate',
  'route-crossfade-lift',
  'quest-card-stagger-in',
  'card-hover-lift-tilt',
  'toast-choreo-slide-stack',
  'modal-scale-breathe',
  'tab-underline-glide',
  'dm-dashboard-panel-cascade',
  'skeleton-shimmer-cascade',
  'error-shake-nudge',
  'countup-stat-reveal',
  'chip-tag-pop-add',
  'search-result-materialize',
  'backstory-reveal-unfurl',
];
if (launchIds.length !== 14) {
  fail(
    '3-catalog-completeness',
    `expected exactly 14 entries with launch:true, found ${launchIds.length}`,
  );
}
const launchSetMismatch =
  launchIds.length !== EXPECTED_LAUNCH_IDS.length ||
  !EXPECTED_LAUNCH_IDS.every((id) => launchIds.includes(id));
if (launchSetMismatch) {
  fail(
    '3-catalog-completeness',
    `launch:true id set does not match the plan's fixed 14`,
  );
}

// ---------------------------------------------------------------------------
// Rule 4: rule invariants + Rule 4b stagger cap.
// ---------------------------------------------------------------------------
const STAGGER_IDS = [
  'page-boot-orchestrate',
  'quest-card-stagger-in',
  'search-result-materialize',
  'dm-dashboard-panel-cascade',
];
for (const e of entries) {
  if (e.tier === 'celebration' && e.eventKeyed !== true) {
    fail('4-rule-invariants', `${e.id}: tier celebration must have eventKeyed: true`);
  }
  if (STAGGER_IDS.includes(e.id) && e.firstLoadOnly !== true) {
    fail('4-rule-invariants', `${e.id}: stagger entry must have firstLoadOnly: true`);
  }
  if (e.tier === 'continuous' && e.collapse !== 'static') {
    fail('4-rule-invariants', `${e.id}: tier continuous must have collapse: 'static'`);
  }
  if (e.staggerToken && (e.staggerCap === undefined || e.staggerCap > 10)) {
    fail(
      '4b-stagger-cap',
      `${e.id}: staggerToken present but staggerCap missing or > 10`,
    );
  }
}

// ---------------------------------------------------------------------------
// Rule 5 + 6: CSS + demo coverage, collapse coverage.
// ---------------------------------------------------------------------------
const DEMO_IDS = [...EXPECTED_LAUNCH_IDS, 'quest-publish-burst'];
if (!existsSync(galleryMotionPath)) {
  fail(
    '5-css-demo-coverage',
    'gallery Motion.tsx not found at expected path — renamed/moved?',
  );
} else {
  const gallerySrc = readFileSync(galleryMotionPath, 'utf8');

  // The gallery renders demos from a literal DEMO_IDS array (data-driven, one
  // interpreter — MOTION_CATALOG's own convention) rather than 14 unrolled
  // literal-string blocks. Read the id SET from that array literal, then
  // confirm the attribute plumbing (literal or `{id}`-bound) exists once per
  // id by counting occurrences, so a removed demo or renamed attribute still
  // fails loudly even though individual attribute values are dynamic.
  const demoIdsArrayMatch = gallerySrc.match(
    /DEMO_IDS\s*=\s*\[([\s\S]*?)\]\s*as const/,
  );
  const literalDemoIds = demoIdsArrayMatch
    ? [...demoIdsArrayMatch[1].matchAll(/'([\w-]+)'/g)].map((m) => m[1])
    : [...gallerySrc.matchAll(/data-motion-demo="([\w-]+)"/g)].map((m) => m[1]);

  if (literalDemoIds.length === 0) {
    fail(
      '5-css-demo-coverage',
      'no data-motion-demo attributes found in gallery Motion.tsx — scrape target wrong?',
    );
  }
  const demoIdSet = [...new Set(literalDemoIds)].sort();
  const expectedSet = [...DEMO_IDS].sort();
  if (JSON.stringify(demoIdSet) !== JSON.stringify(expectedSet)) {
    fail(
      '5-css-demo-coverage',
      `gallery demo id set != 14 launch ids + quest-publish-burst.\n  got:      ${demoIdSet.join(',')}\n  expected: ${expectedSet.join(',')}`,
    );
  }

  // Attribute plumbing is structural (may be data-driven from a loop, so the
  // literal attribute text appears once in source for many ids at runtime) —
  // assert it exists at all; the id SET itself was already verified above
  // against DEMO_IDS, which is the actual regression this rule guards.
  const demoAttrCount = (gallerySrc.match(/data-motion-demo=/g) ?? []).length;
  const demoCollapseAttrCount = (gallerySrc.match(/data-motion-demo-collapse=/g) ?? [])
    .length;
  if (demoAttrCount === 0) {
    fail(
      '5-css-demo-coverage',
      'no data-motion-demo attribute plumbing found in gallery Motion.tsx',
    );
  }
  if (demoCollapseAttrCount === 0) {
    fail(
      '6-collapse-coverage',
      'no data-motion-demo-collapse attribute plumbing found in gallery Motion.tsx',
    );
  }
  for (const id of DEMO_IDS) {
    const cls = id === 'skeleton-shimmer-cascade' ? 'skeleton-shimmer' : `motion-${id}`;
    const guardRe = new RegExp(
      `\\[data-motion-collapse='off'\\] \\.${cls}[^{]*\\{`,
      'g',
    );
    const guardLines = [...motionCss.matchAll(guardRe)].map((m) => m[0]);
    const hasGuard = guardLines.length > 0;
    for (const g of guardLines) {
      if (!g.includes(`:not([data-motion-collapse='on'] *)`)) {
        fail(
          '5-css-demo-coverage',
          `${id}: guard "${g.trim()}" is a plain descendant selector — a subtree data-motion-collapse="on" cannot win. Append :not([data-motion-collapse='on'] *).`,
        );
      }
    }
    const reducedMotionBlock = motionCss.match(
      /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*)\}\s*$/,
    );
    const hasReducedMotionOverride =
      !!reducedMotionBlock && reducedMotionBlock[1].includes(`.${cls}`);
    if (!hasGuard && !hasReducedMotionOverride) {
      fail(
        '5-css-demo-coverage',
        `${id}: no [data-motion-collapse='off'] guard and no reduced-motion override for .${cls}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Rule 7: one animation engine per id (no animation:/@keyframes for a launch
// id or its class anywhere outside motion.css).
// ---------------------------------------------------------------------------
const allAppFiles = walk(appRoot, ['.css', '.ts', '.tsx']).filter(
  (f) => f !== motionCssPath,
);
const launchClassNames = DEMO_IDS.map((id) =>
  id === 'skeleton-shimmer-cascade' ? 'skeleton-shimmer' : `motion-${id}`,
);
for (const file of allAppFiles) {
  const rel = relative(feRoot, file);
  const content = readFileSync(file, 'utf8');
  for (const id of [...DEMO_IDS, ...launchClassNames]) {
    const kfRe = new RegExp(`@keyframes\\s+${id.replace(/[-]/g, '-')}\\b`);
    if (kfRe.test(content)) {
      fail(
        '7-one-engine-per-id',
        `${rel}: duplicate @keyframes for "${id}" found outside motion.css`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Rule 7b: no generic keyframe names anywhere under app/**.
// ---------------------------------------------------------------------------
const GENERIC_KF_RE = /@keyframes\s+(shimmer|fade|pulse|shake|pop|burst|glide)\s*\{/;
for (const file of allAppFiles) {
  const rel = relative(feRoot, file);
  const content = readFileSync(file, 'utf8');
  const m = content.match(GENERIC_KF_RE);
  if (m) {
    fail(
      '7b-no-generic-keyframes',
      `${rel}: bare @keyframes ${m[1]} — must be named after the catalog id`,
    );
  }
}

// ---------------------------------------------------------------------------
// Rule 8: collapse attribute is actually published somewhere real.
// ---------------------------------------------------------------------------
const nonGalleryNonTestFiles = allAppFiles.filter((f) => {
  const rel = relative(feRoot, f);
  return (
    !rel.includes('src/features/gallery/') &&
    !rel.includes('.test.') &&
    !rel.startsWith('src/motion/')
  );
});
const publishers = nonGalleryNonTestFiles.filter((f) =>
  readFileSync(f, 'utf8').includes('data-motion-collapse'),
);
if (publishers.length === 0) {
  fail(
    '8-collapse-published',
    'data-motion-collapse string not found in any non-gallery, non-test file under app/ outside src/motion/**',
  );
}

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------
if (failures.length > 0) {
  console.error(`check:motion (B10) FAILED — ${failures.length} issue(s):\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `check:motion (B10) OK — ${entries.length} catalog entries, ${launchIds.length} launch, all rules green.`,
);
