#!/usr/bin/env node
// A10 custom-property coverage gate. Every `var(--name)` the web app reads
// must resolve to a custom property something defines. A5 (tokens) polices
// *which* colour values code may use; A9 (class-coverage) polices that every
// emitted class hook has a rule. Neither caught WeekGrid heat cells reading
// `color: var(--color-bg)` — a token defined nowhere — so the computed value
// was invalid, `color` fell back to the inherited light ink and the label
// vanished on light heat cells. This gate is the custom-property analogue of
// A9: a reference-integrity check, not a value policy.
//
// Scope: apps/web/src/**/*.css (including *.module.css) and
// apps/web/src/**/*.{ts,tsx}; generated files (*.gen.ts) and tests
// (*.test.*, *.spec.*, __tests__/) are neither scanned nor counted as
// definitions.
//
// References:
//   - CSS: every `var(--name` outside comments (nested fallbacks included).
//   - TS/TSX: every `var(--name` inside a string literal or template
//     (style objects, template strings, Tailwind arbitrary values); comments
//     never count. A template span inside the name (`var(--region-${x})`)
//     makes the static head a prefix (`--region-`); a name with no static
//     head (`var(${token})`) cannot be resolved and is only counted.
//
// Definitions (the union, app-wide — custom properties inherit, so a
// declaration anywhere may legitimately feed a reference elsewhere):
//   - CSS `--name:` declarations and `@property --name` registrations in any
//     scanned stylesheet;
//   - the imported package stylesheet @pi/react-imposition/styles.css,
//     resolved through node from apps/web (resolution failure is a failure,
//     never a silent pass);
//   - runtime writes in TS/TSX: object keys `'--name': …` / `['--name' as
//     string]: …` (style objects, CSS-in-JS), `.setProperty('--name', …)`,
//     and `--name: …` declarations inside string/template text. A dynamic
//     write (`[`--color-${k}`]`, `setProperty(`--cat-${c}`)`) defines its
//     static head as a prefix.
//
// Coverage: a name is covered when defined exactly or when it starts with a
// defined prefix; a reference prefix is covered when any defined name or
// defined prefix overlaps it. Prefixes shorter than one character after
// `--` never define or cover anything.
//
// Fallbacks: `var(--x, …)` with --x undefined resolves to the fallback by
// spec, so rendering is deterministic and author-chosen; it is also the
// standard idiom for an optional component knob a consumer may set. Those
// references are reported as warnings on every run (rules
// fallback-undefined-property / fallback-undefined-prefix) but do not fail,
// matching A9's posture of failing only on definitely-broken output. A
// reference without a fallback is invalid at computed-value time and fails
// (rules undefined-property / undefined-prefix).
//
// Allowlist: allowlist.json "customProperties" entries
//   { file, rule, name, reason }  (no line numbers, so unrelated edits do not
//   churn it). Entries need a reason and are ratcheted by ratchet-floor.json;
//   stale entries are reported (not failed) so a fix can land first.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const gateDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(gateDir, '../../apps/web');
const defaultSrc = join(webRoot, 'src');
export const PACKAGE_STYLESHEETS = ['@pi/react-imposition/styles.css'];
const SENTINEL = '\u0000';
const NAME_CHAR = /[\w-]/;

// ------------------------------------------------------------ text parsing

/** Parse a custom-property name starting at text[i] (which is `-`). Returns
 * { name, dynamic, end } where a SENTINEL inside the name cuts it to a
 * prefix. */
function readName(text, i) {
  let j = i;
  let dynamic = false;
  let cut = -1;
  while (j < text.length && (NAME_CHAR.test(text[j]) || text[j] === SENTINEL)) {
    if (text[j] === SENTINEL && cut === -1) {
      cut = j;
      dynamic = true;
    }
    j++;
  }
  return { name: text.slice(i, cut === -1 ? j : cut), dynamic, end: j };
}

/** Every `var(` reference in a text (SENTINEL marks unknown fragments). */
export function referencesIn(text) {
  const out = [];
  const re = /var\(\s*/g;
  let m;
  while ((m = re.exec(text))) {
    const start = m.index + m[0].length;
    let name = '';
    let dynamic = false;
    let end = start;
    if (text.startsWith('--', start)) ({ name, dynamic, end } = readName(text, start));
    else if (text[start] === SENTINEL) {
      dynamic = true;
      end = start;
      while (end < text.length && (NAME_CHAR.test(text[end]) || text[end] === SENTINEL))
        end++;
    } else continue; // not a custom-property reference (e.g. `var(` in prose)
    let k = end;
    while (k < text.length && /\s/.test(text[k])) k++;
    out.push({ name, dynamic, fallback: text[k] === ',', index: m.index });
  }
  return out;
}

/** `--name:` declarations (and `@property --name`) in a text. */
export function declarationsIn(text) {
  const out = [];
  const re = /(?<![\w-])--(?=[\w\u0000-])/g;
  let m;
  while ((m = re.exec(text))) {
    const { name, dynamic, end } = readName(text, m.index);
    let k = end;
    while (k < text.length && /\s/.test(text[k])) k++;
    const before = text.slice(Math.max(0, m.index - 12), m.index);
    if (text[k] === ':' || /@property\s+$/.test(before))
      out.push({ name, dynamic, index: m.index });
    re.lastIndex = Math.max(end, m.index + 2);
  }
  return out;
}

/** Blank comments while keeping offsets/newlines stable. */
function blankCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
}

const lineAt = (text, index) => text.slice(0, index).split('\n').length;

export function scanCss(css) {
  const text = blankCssComments(css);
  return {
    references: referencesIn(text).map((r) => ({ ...r, line: lineAt(text, r.index) })),
    definitions: declarationsIn(text).map((d) => ({
      ...d,
      line: lineAt(text, d.index),
    })),
  };
}

// --------------------------------------------------------------- TS side

function unwrap(node) {
  while (
    node &&
    (ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isTypeAssertionExpression?.(node))
  )
    node = node.expression;
  return node;
}

/** Static text of a string/template node with SENTINEL for each span. */
function textOf(node) {
  node = unwrap(node);
  if (!node) return null;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node))
    return (
      node.head.text + node.templateSpans.map((s) => SENTINEL + s.literal.text).join('')
    );
  return null;
}

/** A property-name text that writes a custom property, or null. */
function writtenName(text) {
  if (text === null || !text.startsWith('--')) return null;
  const { name, dynamic, end } = readName(text, 0);
  return end === text.length ? { name, dynamic } : null;
}

export function scanTs(source, file = 'Fixture.tsx') {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const references = [];
  const definitions = [];
  const define = (node, written) => {
    if (written) definitions.push({ ...written, line: lineOf(node.getStart(sf)) });
  };
  const visit = (node) => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) {
      const text = textOf(node);
      const line = lineOf(node.getStart(sf));
      for (const r of referencesIn(text)) references.push({ ...r, line });
      for (const d of declarationsIn(text)) definitions.push({ ...d, line });
    }
    if (ts.isPropertyAssignment(node) || ts.isMethodDeclaration(node)) {
      const nameNode = node.name;
      if (ts.isStringLiteral(nameNode)) define(nameNode, writtenName(nameNode.text));
      else if (ts.isComputedPropertyName(nameNode))
        define(nameNode, writtenName(textOf(nameNode.expression)));
    }
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      if (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === 'setProperty' &&
        node.arguments.length
      )
        define(node.arguments[0], writtenName(textOf(node.arguments[0])));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { references, definitions };
}

// ----------------------------------------------------------- definitions

export function emptyDefinitions() {
  return { names: new Set(), prefixes: new Set() };
}

function addDefinitions(defs, list) {
  for (const d of list) {
    if (d.dynamic) {
      if (d.name.length > 2) defs.prefixes.add(d.name);
    } else if (d.name.length > 2) defs.names.add(d.name);
  }
  return defs;
}

export function isCovered(defs, ref) {
  const prefixes = [...defs.prefixes];
  if (!ref.dynamic)
    return defs.names.has(ref.name) || prefixes.some((p) => ref.name.startsWith(p));
  return (
    [...defs.names].some((n) => n.startsWith(ref.name) && n.length > ref.name.length) ||
    prefixes.some((p) => p.startsWith(ref.name) || ref.name.startsWith(p))
  );
}

function ruleFor(ref) {
  const base = ref.dynamic ? 'undefined-prefix' : 'undefined-property';
  return ref.fallback ? `fallback-${base}` : base;
}

export const FAILING_RULES = new Set(['undefined-property', 'undefined-prefix']);

/** Findings for already-scanned files against a definition set. Each file
 * entry is { file, references }. One finding per (file, rule, name). */
export function findings(files, defs) {
  const out = [];
  let unresolved = 0;
  for (const { file, references } of files) {
    const byKey = new Map();
    for (const ref of references) {
      if (ref.dynamic && ref.name.length <= 2) {
        unresolved++;
        continue;
      }
      if (isCovered(defs, ref)) continue;
      const rule = ruleFor(ref);
      const key = `${rule}:${ref.name}`;
      if (!byKey.has(key))
        byKey.set(key, { file, line: ref.line, lines: [], rule, name: ref.name });
      const hit = byKey.get(key);
      if (!hit.lines.includes(ref.line)) hit.lines.push(ref.line);
    }
    out.push(...byKey.values());
  }
  return { findings: out, unresolved };
}

// ----------------------------------------------------------------- scope

const EXCLUDED = /(?:\.gen\.ts$|\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)__tests__\/)/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(?:css|tsx?)$/.test(entry) && !entry.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

export function resolvePackageStylesheets(root = webRoot, specs = PACKAGE_STYLESHEETS) {
  const require = createRequire(join(root, 'package.json'));
  return specs.map((spec) => require.resolve(spec));
}

export function scanScope(
  webSrc = defaultSrc,
  packageCss = resolvePackageStylesheets(),
) {
  const defs = emptyDefinitions();
  for (const css of packageCss) {
    if (!existsSync(css)) throw new Error(`package stylesheet missing: ${css}`);
    addDefinitions(defs, scanCss(readFileSync(css, 'utf8')).definitions);
  }
  const files = [];
  for (const full of walk(webSrc)) {
    const rel = `src/${relative(webSrc, full).replace(/\\/g, '/')}`;
    if (EXCLUDED.test(rel)) continue;
    const source = readFileSync(full, 'utf8');
    const scanned = full.endsWith('.css') ? scanCss(source) : scanTs(source, rel);
    addDefinitions(defs, scanned.definitions);
    files.push({ file: rel, references: scanned.references });
  }
  const references = files.reduce((n, f) => n + f.references.length, 0);
  return { ...findings(files, defs), references, defs };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let result;
  try {
    result = scanScope();
  } catch (error) {
    console.error(`check:custom-properties (A10) FAILED — ${error.message}`);
    process.exit(1);
  }
  const hits = result.findings;
  if (process.argv.includes('--list')) console.log(JSON.stringify(hits, null, 2));
  else {
    const allowlist = JSON.parse(readFileSync(join(gateDir, 'allowlist.json'), 'utf8'));
    const entries = allowlist.customProperties ?? [];
    const key = (e) => `${e.file}:${e.rule}:${e.name}`;
    const allowed = new Set(entries.map(key));
    const failing = hits.filter((hit) => FAILING_RULES.has(hit.rule));
    const warnings = hits.filter((hit) => !FAILING_RULES.has(hit.rule));
    const hitKeys = new Set(failing.map(key));
    const fresh = failing.filter((hit) => !allowed.has(key(hit)));
    const listed = failing.filter((hit) => allowed.has(key(hit)));
    const stale = entries.filter((e) => !hitKeys.has(key(e)));
    const unreasoned = entries.filter((e) => !e.reason);
    const at = (hit) => `${hit.file}:${hit.lines.join(',')}`;
    for (const hit of warnings)
      console.log(
        `  warning ${at(hit)} [${hit.rule}] ${hit.name} — undefined; renders its var() fallback`,
      );
    for (const hit of listed)
      console.log(`  allowlisted ${at(hit)} [${hit.rule}] ${hit.name}`);
    for (const e of stale)
      console.log(
        `  stale allowlist entry (now defined; remove it): ${e.file} [${e.rule}] ${e.name}`,
      );
    for (const e of unreasoned)
      console.error(
        `  allowlist entry without reason: ${e.file} [${e.rule}] ${e.name}`,
      );
    for (const hit of fresh)
      console.error(
        `  ${at(hit)} [${hit.rule}] ${hit.name} — defined nowhere, no fallback`,
      );
    const summary = `${result.references} var() reference(s), ${result.defs.names.size} defined name(s) + ${result.defs.prefixes.size} runtime prefix(es); ${warnings.length} fallback warning(s), ${listed.length} allowlisted, ${stale.length} stale, ${result.unresolved} fully dynamic name(s) unchecked`;
    if (fresh.length || unreasoned.length) {
      console.error(
        `check:custom-properties (A10) FAILED — ${fresh.length} undefined custom propert(y/ies) not in scripts/design-gates/allowlist.json` +
          (unreasoned.length
            ? `, ${unreasoned.length} allowlist entr(y/ies) missing a reason`
            : '') +
          ` (${summary}).\nReference a defined token (src/styles/tokens.css or the @pi/react-imposition sheet), define the property, or add a var() fallback; defer only with an allowlist.json "customProperties" entry carrying a reason.`,
      );
      process.exitCode = 1;
    } else console.log(`check:custom-properties (A10) OK — ${summary}.`);
  }
}
