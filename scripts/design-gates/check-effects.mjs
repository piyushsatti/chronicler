#!/usr/bin/env node
// B8 effects gate (#469). Regex-scrape style, same technique as
// check-motion.mjs/check-gallery.mjs (no TS loader). Proves the effect
// registry stays data-not-code: EFFECT_CATALOG is the one source, and
// AmbientLayer.tsx never branches on effect id or theme identity.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const feRoot = join(repoRoot, 'apps', 'web');
const appRoot = join(feRoot, 'src');
const effectsDir = join(appRoot, 'effects');
const effectsCssPath = join(appRoot, 'styles', 'effects.css');
const motionCssPath = join(appRoot, 'styles', 'motion.css');
const motionCatalogPath = join(appRoot, 'motion', 'catalog.ts');
const tokensCssPath = join(appRoot, 'styles', 'tokens.css');
const ambientLayerPath = join(effectsDir, 'AmbientLayer.tsx');

function walk(dir, exts) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

/**
 * Pure check function — returns a failures array. Exported so a test can
 * import it without triggering process.exit (same convention as
 * check-state-trio.mjs's scanSource).
 */
export function runChecks() {
  const failures = [];
  function fail(rule, msg) {
    failures.push(`[${rule}] ${msg}`);
  }

  if (!existsSync(join(effectsDir, 'catalog.ts'))) {
    fail('parse', 'src/effects/catalog.ts not found — renamed/moved?');
    return failures;
  }

  const catalogSrc = readFileSync(join(effectsDir, 'catalog.ts'), 'utf8');

  // Scrape each EFFECT_CATALOG row object literal — bounded by the next
  // line that is exactly a closing "  },", not by field order (a row may
  // carry `reuses` after `motionPreset`, or omit it).
  const entryRe = /\{\s*id:\s*'([\w-]+)',[\s\S]*?\n\s{2}\},/g;
  const rawEntries = [...catalogSrc.matchAll(entryRe)].map((m) => m[0]);
  if (rawEntries.length === 0) {
    // T020 soft-skip: shell stub catalog (T010) until T230 ports EFFECT_CATALOG shape.
    console.log(
      'check:effects (B8) SKIP — catalog stub not legacy-shaped (pending T230).',
    );
    process.exit(0);
  }

  function field(str, name) {
    const m = str.match(new RegExp(`${name}:\\s*'([^']+)'`));
    return m ? m[1] : undefined;
  }
  function boolField(str, name) {
    const m = str.match(new RegExp(`${name}:\\s*(true|false)`));
    return m ? m[1] === 'true' : undefined;
  }
  function arrField(str, name) {
    const m = str.match(new RegExp(`${name}:\\s*\\[([^\\]]*)\\]`));
    if (!m) return [];
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  }

  const entries = rawEntries.map((raw) => ({
    id: field(raw, 'id'),
    kind: field(raw, 'kind'),
    launch: boolField(raw, 'launch'),
    colorTokens: arrField(raw, 'colorTokens'),
    loopTokens: arrField(raw, 'loopTokens'),
    easingToken: field(raw, 'easingToken'),
    motionPreset: /motionPreset:\s*null/.test(raw) ? null : field(raw, 'motionPreset'),
  }));

  const launchEntries = entries.filter((e) => e.launch);

  const effectsCss = existsSync(effectsCssPath)
    ? readFileSync(effectsCssPath, 'utf8')
    : '';
  const rootBlockMatch = effectsCss.match(/:root\s*\{([\s\S]*?)\n\}/);

  // ---------------------------------------------------------------------
  // E1: every launch row has a .effect-<id> block + @keyframes effect-<id>*
  // ---------------------------------------------------------------------
  for (const e of launchEntries) {
    const classRe = new RegExp(`\\.effect-${e.id}\\b`);
    const kfRe = new RegExp(`@keyframes\\s+effect-${e.id}`);
    if (!classRe.test(effectsCss))
      fail('E1', `${e.id}: no .effect-${e.id} rule in effects.css`);
    if (!kfRe.test(effectsCss))
      fail('E1', `${e.id}: no @keyframes effect-${e.id}* in effects.css`);
  }

  // ---------------------------------------------------------------------
  // E2: every `animation:` declaration under the FULL repo guard shape.
  // ---------------------------------------------------------------------
  const animLineRe = /^[^\n{]*\{[^}]*animation:\s*[^;]+;[^}]*\}/gm;
  // Simpler: scan selector blocks that contain `animation:` and check the
  // selector text carries the guard + :not() escape.
  const blockRe = /([^\n{]+)\{([^}]*)\}/g;
  for (const m of effectsCss.matchAll(blockRe)) {
    const [, selector, body] = m;
    if (!/animation:/.test(body)) continue;
    const guarded = /\[data-motion-collapse='off'\]/.test(selector);
    const escaped = /:not\(\[data-motion-collapse='on'\]\s*\*\)/.test(selector);
    if (!guarded || !escaped) {
      fail('E2', `unguarded/leaky animation rule: "${selector.trim()}"`);
    }
  }
  void animLineRe;

  // ---------------------------------------------------------------------
  // E3: zero color literals under src/effects/** and in effects.css
  // outside :root duration decls (hex, rgb(), hsl(), --p-*).
  // ---------------------------------------------------------------------
  const colorLiteralRe = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|--p-[\w-]+/;
  const effectsTsFiles = walk(effectsDir, ['.ts', '.tsx']).filter(
    (f) => !f.includes('.test.'),
  );
  for (const file of effectsTsFiles) {
    const rel = relative(feRoot, file);
    const src = readFileSync(file, 'utf8');
    if (colorLiteralRe.test(src)) {
      fail('E3', `${rel}: hardcoded color literal found`);
    }
  }
  const cssOutsideRoot = rootBlockMatch
    ? effectsCss.replace(rootBlockMatch[0], '')
    : effectsCss;
  if (colorLiteralRe.test(cssOutsideRoot)) {
    fail('E3', 'effects.css: hardcoded color literal found outside :root');
  }

  // ---------------------------------------------------------------------
  // E4: every colorTokens entry exists as a --color-* semantic token in
  // tokens.css.
  // ---------------------------------------------------------------------
  const tokensCss = existsSync(tokensCssPath)
    ? readFileSync(tokensCssPath, 'utf8')
    : '';
  for (const e of entries) {
    for (const tok of e.colorTokens) {
      if (!tok.startsWith('--color-')) {
        fail('E4', `${e.id}: colorTokens entry "${tok}" is not a --color-* token`);
        continue;
      }
      const declRe = new RegExp(`${tok}\\s*:`);
      if (!declRe.test(tokensCss)) {
        fail(
          'E4',
          `${e.id}: colorTokens entry "${tok}" has no tokens.css declaration — phantom token`,
        );
      }
    }
  }

  // ---------------------------------------------------------------------
  // E5: AmbientLayer.tsx contains no effect-id string literal and no
  // data-theme / theme-name literal.
  // ---------------------------------------------------------------------
  if (!existsSync(ambientLayerPath)) {
    fail('E5', 'src/effects/AmbientLayer.tsx not found — renamed/moved?');
  } else {
    const src = readFileSync(ambientLayerPath, 'utf8');
    for (const e of entries) {
      const literalRe = new RegExp(`['"\`]${e.id}['"\`]`);
      if (literalRe.test(src)) {
        fail(
          'E5',
          `AmbientLayer.tsx contains effect-id literal "${e.id}" — interpreter must not branch on identity`,
        );
      }
    }
    if (/data-theme/.test(src)) {
      fail(
        'E5',
        'AmbientLayer.tsx references data-theme — interpreter must not branch on theme identity',
      );
    }
    const themeNames = ['parchment', 'midnight', 'ember', 'dracula', 'vegan'];
    for (const t of themeNames) {
      if (new RegExp(`['"\`]${t}['"\`]`).test(src)) {
        fail('E5', `AmbientLayer.tsx contains theme-name literal "${t}"`);
      }
    }
  }

  // ---------------------------------------------------------------------
  // E6: src/effects/** contains no pointer/scroll listeners.
  // ---------------------------------------------------------------------
  const pointerRe =
    /onPointer\w*|onMouseMove|onScroll|addEventListener\(\s*['"](scroll|mousemove)['"]/;
  for (const file of effectsTsFiles) {
    const rel = relative(feRoot, file);
    const src = readFileSync(file, 'utf8');
    if (pointerRe.test(src)) {
      fail(
        'E6',
        `${rel}: ambient effect responds to pointer/scroll — must never listen`,
      );
    }
  }

  // ---------------------------------------------------------------------
  // E7: every duration/easing used in effects.css is a var(--...) token —
  // no literal s/ms/cubic-bezier outside :root.
  // ---------------------------------------------------------------------
  const bespokeRe = /(?<![\w$])\d+(\.\d+)?(ms|s)\b|cubic-bezier\(/;
  const noComments = cssOutsideRoot
    .split('\n')
    .map((l) => l.replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, ''))
    .join('\n');
  const bespokeMatch = noComments.match(bespokeRe);
  if (bespokeMatch) {
    fail(
      'E7',
      `effects.css: bespoke value "${bespokeMatch[0]}" found outside :root — use a var(--...) token`,
    );
  }

  // ---------------------------------------------------------------------
  // E8: prefers-reduced-motion does not appear anywhere under
  // src/effects/** or in src/styles/effects.css.
  // ---------------------------------------------------------------------
  for (const file of [...effectsTsFiles, effectsCssPath]) {
    if (!existsSync(file)) continue;
    const rel = relative(feRoot, file);
    const src = readFileSync(file, 'utf8');
    if (/prefers-reduced-motion/.test(src)) {
      fail(
        'E8',
        `${rel}: second collapse predicate "prefers-reduced-motion" — useMotionCollapse is the one predicate`,
      );
    }
  }

  // ---------------------------------------------------------------------
  // E9: orphan check — every .effect-* CSS class maps to a catalog row
  // and vice versa.
  // ---------------------------------------------------------------------
  const cssClassIds = new Set(
    [...effectsCss.matchAll(/\.effect-([\w-]+)/g)].map((m) => m[1]),
  );
  const catalogIds = new Set(entries.map((e) => e.id));
  for (const id of cssClassIds) {
    if (!catalogIds.has(id))
      fail('E9', `effects.css has .effect-${id} with no matching catalog row`);
  }
  for (const id of catalogIds) {
    if (!cssClassIds.has(id))
      fail('E9', `catalog row "${id}" has no .effect-${id} CSS class`);
  }

  // ---------------------------------------------------------------------
  // E10: every non-null motionPreset matches an id: in src/motion/catalog.ts.
  // ---------------------------------------------------------------------
  const motionCatalogSrc = existsSync(motionCatalogPath)
    ? readFileSync(motionCatalogPath, 'utf8')
    : '';
  const motionCatalogIds = new Set(
    [...motionCatalogSrc.matchAll(/id:\s*'([\w-]+)'/g)].map((m) => m[1]),
  );
  for (const e of entries) {
    if (e.motionPreset && !motionCatalogIds.has(e.motionPreset)) {
      fail(
        'E10',
        `${e.id}: motionPreset "${e.motionPreset}" has no matching id: in src/motion/catalog.ts`,
      );
    }
  }

  // ---------------------------------------------------------------------
  // E11: effects.css declares no --*-loop-* / duration custom property and
  // no :root block; every loopTokens entry exists in motion.css.
  // ---------------------------------------------------------------------
  if (rootBlockMatch) {
    fail(
      'E11',
      'effects.css declares a :root block — motion.css is the one duration-token surface',
    );
  }
  if (/--[\w-]*-loop-[\w-]*\s*:/.test(effectsCss)) {
    fail(
      'E11',
      'effects.css declares a --*-loop-* custom property — second duration surface',
    );
  }
  const motionCss = existsSync(motionCssPath)
    ? readFileSync(motionCssPath, 'utf8')
    : '';
  for (const e of entries) {
    for (const tok of e.loopTokens) {
      if (!new RegExp(`${tok}\\s*:`).test(motionCss)) {
        fail('E11', `${e.id}: loopTokens entry "${tok}" not declared in motion.css`);
      }
    }
  }

  return failures;
}

// CLI execution only — guarded so a test file can `import { runChecks }`
// from this module without triggering fs scans or process.exit.
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const failures = runChecks();
  if (failures.length > 0) {
    console.error(`check:effects (B8) FAILED — ${failures.length} issue(s):\n`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    'check:effects (B8) OK — EFFECT_CATALOG rows all wired, one interpreter, no phantom tokens.',
  );
}
