#!/usr/bin/env node
// B9 cosmetic-effect gate (#470). Regex-scrape style, same technique as
// check-effects.mjs (no TS loader). Proves the cosmetic registry stays
// data-not-code, the two registries (ambient/entity) stay unmixed, and
// primitives never branch on identity.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const feRoot = join(repoRoot, 'apps', 'web');
const appRoot = join(feRoot, 'src');
const viewModelsPath = join(appRoot, 'view-models', 'cosmeticEffects.ts');
const cosmeticCssPath = join(appRoot, 'styles', 'cosmetic.css');
const effectsCssPath = join(appRoot, 'styles', 'effects.css');
const motionCssPath = join(appRoot, 'styles', 'motion.css');
const motionCatalogPath = join(appRoot, 'motion', 'catalog.ts');
const tokensCssPath = join(appRoot, 'styles', 'tokens.css');
const featuresDir = join(appRoot, 'features');
const primitivesDir = join(appRoot, 'components', 'primitives');

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

export function runChecks() {
  const failures = [];
  function fail(rule, msg) {
    failures.push(`[${rule}] ${msg}`);
  }

  if (!existsSync(viewModelsPath)) {
    // T020 soft-skip: cosmetic registry ports with T230.
    console.log(
      'check:cosmetic (B9) SKIP — cosmeticEffects.ts missing (pending T230).',
    );
    process.exit(0);
  }

  const vmSrc = readFileSync(viewModelsPath, 'utf8');
  const cosmeticCss = existsSync(cosmeticCssPath)
    ? readFileSync(cosmeticCssPath, 'utf8')
    : '';
  const effectsCss = existsSync(effectsCssPath)
    ? readFileSync(effectsCssPath, 'utf8')
    : '';
  const motionCss = existsSync(motionCssPath)
    ? readFileSync(motionCssPath, 'utf8')
    : '';
  const motionCatalogSrc = existsSync(motionCatalogPath)
    ? readFileSync(motionCatalogPath, 'utf8')
    : '';
  const tokensCss = existsSync(tokensCssPath)
    ? readFileSync(tokensCssPath, 'utf8')
    : '';

  const entryRe = /\{\s*id:\s*'([\w-]+)',[\s\S]*?\n\s{2}\},/g;
  const rawEntries = [...vmSrc.matchAll(entryRe)].map((m) => m[0]);
  if (rawEntries.length === 0) {
    fail(
      'parse',
      'could not scrape any rows out of src/view-models/cosmeticEffects.ts — regex or file moved?',
    );
    return failures;
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
    driver: field(raw, 'driver'),
    launch: boolField(raw, 'launch'),
    colorTokens: arrField(raw, 'colorTokens'),
    loopTokens: arrField(raw, 'loopTokens'),
    motionPreset: /motionPreset:\s*null/.test(raw) ? null : field(raw, 'motionPreset'),
  }));
  const launchEntries = entries.filter((e) => e.launch);

  // ---------------------------------------------------------------------
  // CE1: every launch row has a .cosmetic-<id> rule; bidirectional orphan
  // check against .cosmetic-* classes.
  // ---------------------------------------------------------------------
  for (const e of launchEntries) {
    const classRe = new RegExp(`\\.cosmetic-${e.id}\\b`);
    if (!classRe.test(cosmeticCss))
      fail('CE1', `${e.id}: no .cosmetic-${e.id} rule in cosmetic.css`);
  }
  const cssClassIds = new Set(
    [...cosmeticCss.matchAll(/\.cosmetic-([\w-]+)/g)].map((m) => m[1]),
  );
  const catalogIds = new Set(entries.map((e) => e.id));
  for (const id of cssClassIds) {
    if (!catalogIds.has(id))
      fail('CE1', `cosmetic.css has .cosmetic-${id} with no matching catalog row`);
  }

  // ---------------------------------------------------------------------
  // CE2: every `animation:` block carries BOTH the motion-collapse guard +
  // escape AND the density escape.
  // ---------------------------------------------------------------------
  const blockRe = /([^\n{]+)\{([^}]*)\}/g;
  for (const m of cosmeticCss.matchAll(blockRe)) {
    const [, selector, body] = m;
    if (!/animation:/.test(body)) continue;
    const guarded = /\[data-motion-collapse='off'\]/.test(selector);
    const escaped = /:not\(\[data-motion-collapse='on'\]\s*\*\)/.test(selector);
    const densityEscaped = /:not\(\[data-cosmetic-density='dense'\]\s*\*\)/.test(
      selector,
    );
    if (!guarded || !escaped || !densityEscaped) {
      fail('CE2', `unguarded/leaky animation rule: "${selector.trim()}"`);
    }
  }

  // ---------------------------------------------------------------------
  // CE3: priority is derived from driver, never a per-row literal.
  // ---------------------------------------------------------------------
  if (/priority:\s*\d/.test(vmSrc)) {
    fail(
      'CE3',
      'cosmeticEffects.ts contains a numeric priority: field literal — derive from driver instead',
    );
  }
  if (!/DRIVER_PRIORITY/.test(vmSrc)) {
    fail('CE3', 'cosmeticEffects.ts has no single driver->rank map (DRIVER_PRIORITY)');
  }

  // ---------------------------------------------------------------------
  // CE4: zero color literals in cosmetic.css / cosmeticEffects.ts.
  // ---------------------------------------------------------------------
  const colorLiteralRe = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|--p-[\w-]+/;
  if (colorLiteralRe.test(cosmeticCss))
    fail('CE4', 'cosmetic.css: hardcoded color literal found');
  if (colorLiteralRe.test(vmSrc))
    fail('CE4', 'cosmeticEffects.ts: hardcoded color literal found');

  // ---------------------------------------------------------------------
  // CE5: every colorTokens entry is a --color-* declared in tokens.css.
  // ---------------------------------------------------------------------
  for (const e of entries) {
    for (const tok of e.colorTokens) {
      if (!tok.startsWith('--color-')) {
        fail('CE5', `${e.id}: colorTokens entry "${tok}" is not a --color-* token`);
        continue;
      }
      if (!new RegExp(`${tok}\\s*:`).test(tokensCss)) {
        fail(
          'CE5',
          `${e.id}: colorTokens entry "${tok}" has no tokens.css declaration — phantom token`,
        );
      }
    }
  }

  // ---------------------------------------------------------------------
  // CE6: every non-null motionPreset matches an id: in motion/catalog.ts;
  // every loopTokens entry declared in motion.css.
  // ---------------------------------------------------------------------
  const motionCatalogIds = new Set(
    [...motionCatalogSrc.matchAll(/id:\s*'([\w-]+)'/g)].map((m) => m[1]),
  );
  for (const e of entries) {
    if (e.motionPreset && !motionCatalogIds.has(e.motionPreset)) {
      fail(
        'CE6',
        `${e.id}: motionPreset "${e.motionPreset}" has no matching id: in src/motion/catalog.ts`,
      );
    }
    for (const tok of e.loopTokens) {
      if (!new RegExp(`${tok}\\s*:`).test(motionCss)) {
        fail('CE6', `${e.id}: loopTokens entry "${tok}" not declared in motion.css`);
      }
    }
  }

  // ---------------------------------------------------------------------
  // CE7: no-layout proof — cosmetic.css declares none of the banned props.
  // ---------------------------------------------------------------------
  const bannedPropRe =
    /(?<![\w-])(border-width|padding|margin|width|height|display|font-size|top\s*:|left\s*:)\s*:?/;
  const cssLines = cosmeticCss
    .split('\n')
    .filter((l) => !l.trim().startsWith('/*') && !l.trim().startsWith('*'));
  for (const line of cssLines) {
    if (bannedPropRe.test(line) && /:/.test(line)) {
      // avoid false positive on selector text like ".cosmetic-x:hover" — only
      // flag when it looks like a declaration (`prop: value;`)
      if (/^\s*[\w-]+\s*:\s*[^{]+;/.test(line)) {
        fail('CE7', `cosmetic.css: banned no-layout property in "${line.trim()}"`);
      }
    }
  }

  // ---------------------------------------------------------------------
  // CE8: Avatar/Chip/ListRow contain no cosmetic-effect id literal and no
  // role-name literal.
  // ---------------------------------------------------------------------
  const roleNames = ['admin', 'verifier', 'dm', 'archon', 'lieutenant'];
  for (const name of ['Avatar.tsx', 'Chip.tsx', 'ListRow.tsx']) {
    const p = join(primitivesDir, name);
    if (!existsSync(p)) continue;
    const src = readFileSync(p, 'utf8');
    for (const e of entries) {
      if (new RegExp(`['"\`]${e.id}['"\`]`).test(src)) {
        fail('CE8', `${name}: contains cosmetic-effect id literal "${e.id}"`);
      }
    }
    for (const role of roleNames) {
      if (new RegExp(`['"\`]${role}['"\`]`).test(src)) {
        fail(
          'CE8',
          `${name}: contains role-name literal "${role}" — primitives must not branch on identity`,
        );
      }
    }
  }

  // ---------------------------------------------------------------------
  // CE9: no src/features/** file imports COSMETIC_CATALOG.
  // ---------------------------------------------------------------------
  const featureFiles = walk(featuresDir, ['.ts', '.tsx']).filter(
    (f) => !f.includes('.test.'),
  );
  for (const file of featureFiles) {
    const src = readFileSync(file, 'utf8');
    if (/COSMETIC_CATALOG/.test(src)) {
      fail(
        'CE9',
        `${relative(feRoot, file)}: imports COSMETIC_CATALOG directly — feature adoption is a later wave`,
      );
    }
  }

  // ---------------------------------------------------------------------
  // CE10: cosmeticEffects.ts contains no prefers-reduced-motion / matchMedia.
  // ---------------------------------------------------------------------
  if (/prefers-reduced-motion/.test(vmSrc)) {
    fail(
      'CE10',
      'cosmeticEffects.ts references prefers-reduced-motion — second collapse predicate',
    );
  }
  if (/matchMedia/.test(vmSrc)) {
    fail('CE10', 'cosmeticEffects.ts calls matchMedia — second collapse predicate');
  }

  // ---------------------------------------------------------------------
  // CE11: .cosmetic-* classes absent from effects.css; .effect-* absent
  // from cosmetic.css.
  // ---------------------------------------------------------------------
  if (/\.cosmetic-[\w-]+/.test(effectsCss)) {
    fail(
      'CE11',
      'effects.css contains a .cosmetic-* class — registries must stay unmixed',
    );
  }
  if (/\.effect-[\w-]+/.test(cosmeticCss)) {
    fail(
      'CE11',
      'cosmetic.css contains a .effect-* class — registries must stay unmixed',
    );
  }

  // ---------------------------------------------------------------------
  // CE12: cosmeticEffects.ts contains no role string literal OUTSIDE the
  // roleMatch arrays (a crude but effective proxy: strip roleMatch: [...]
  // spans before scanning for role literals).
  // ---------------------------------------------------------------------
  const withoutRoleMatch = vmSrc.replace(
    /roleMatch:\s*(\[[^\]]*\]|null)/g,
    'roleMatch: ELIDED',
  );
  for (const role of roleNames) {
    if (new RegExp(`['"\`]${role}['"\`]`).test(withoutRoleMatch)) {
      fail(
        'CE12',
        `cosmeticEffects.ts: role literal "${role}" found outside a roleMatch array`,
      );
    }
  }
  if (!/hasRole/.test(vmSrc)) {
    fail(
      'CE12',
      'cosmeticEffects.ts does not import/use hasRole from utils/permissions.ts',
    );
  }

  // ---------------------------------------------------------------------
  // CE13: every @keyframes in cosmetic.css is named cosmetic-<id>* and maps
  // to an animated launch row; no animation: shorthand names a keyframe
  // defined outside cosmetic.css.
  // ---------------------------------------------------------------------
  const kfNames = [...cosmeticCss.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
  for (const kf of kfNames) {
    if (!kf.startsWith('cosmetic-')) {
      fail('CE13', `cosmetic.css: @keyframes "${kf}" is not named cosmetic-<id>*`);
      continue;
    }
    const id = kf.replace(/^cosmetic-/, '');
    const row = entries.find((e) => e.id === id);
    if (!row || !row.launch) {
      fail(
        'CE13',
        `cosmetic.css: @keyframes "${kf}" has no matching animated launch row`,
      );
    }
  }
  const animNames = [...cosmeticCss.matchAll(/animation:\s*([\w-]+)/g)].map(
    (m) => m[1],
  );
  for (const name of animNames) {
    if (!kfNames.includes(name)) {
      fail(
        'CE13',
        `cosmetic.css: animation: shorthand references "${name}", not defined in cosmetic.css`,
      );
    }
  }

  // ---------------------------------------------------------------------
  // CE14: ListRow/Table register no scroll/mousemove/mouseenter listener
  // attributable to cosmetics; data-cosmetic-density set on container only.
  // ---------------------------------------------------------------------
  for (const name of ['ListRow.tsx', 'Table.tsx']) {
    const p = join(primitivesDir, name);
    if (!existsSync(p)) continue;
    const src = readFileSync(p, 'utf8');
    const cosmeticListenerRe =
      /cosmetic[\s\S]{0,200}(onMouseMove|onMouseEnter|addEventListener\(\s*['"](scroll|mousemove|mouseenter)['"])/i;
    if (cosmeticListenerRe.test(src)) {
      fail('CE14', `${name}: appears to register a per-row cosmetic listener`);
    }
  }

  return failures;
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const failures = runChecks();
  if (failures.length > 0) {
    console.error(`check:cosmetic (B9) FAILED — ${failures.length} issue(s):\n`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    'check:cosmetic (B9) OK — COSMETIC_CATALOG rows all wired, one resolver, no phantom tokens.',
  );
}
