#!/usr/bin/env node
// A9 class-coverage gate. Every CSS class hook a shared component emits must
// be styled by at least one rule. The A-family gates already police tokens,
// layout mechanics, boundaries and duplication, but nothing caught a
// primitive whose markup drifted from its stylesheet (Chip emitting
// `chip--sm` while CSS selects `[data-size='sm']`, Listbox emitting
// `.listbox__opt` while CSS styles `.listbox-option`, AvatarGroup emitting
// `.av-group` with no rule at all).
//
// Scope: src/components/primitives/*.tsx and src/components/foundation/*.tsx
// (non-recursive, tests excluded). Static TypeScript AST scan, no browser.
//
// Emission rules (className JSX attributes and `className:` object props):
//   - string literals are split on whitespace into classes;
//   - cx/clsx/cn/classNames(...) args, [...].filter(Boolean).join(' ')
//     receivers, ternary branches, `a && 'b'` right-hand sides and `a || b`
//     / `a ?? b` both sides are followed;
//   - local `const x = ...` initializers are followed through identifiers;
//   - identifiers and template spans whose type is a string-literal union
//     (e.g. `chip--${tone}` with tone: 'neutral' | 'line' | ...) expand to
//     every member, each of which must be covered;
//   - an unresolvable template span leaves its static head as a prefix
//     (`card__${name}` -> `card__`), covered when any rule's class starts
//     with that prefix;
//   - comparison operands, unknown calls and props such as `className` are
//     never treated as emitted classes.
//
// Coverage: a class is covered when any selector (any combinator, pseudo or
// nesting) in the global closure — src/styles/index.css and its @import
// tree — or in a stylesheet the component imports itself (relative `.css`
// imports, or a sibling `<Name>.module.css`) names it. Utility/type/layout
// classes defined elsewhere in the closure therefore count as covered.
//
// Data-attribute value check (rule data-value-mismatch): for an intrinsic
// element emitting classes C and `data-x` whose values are statically known
// (literals, ternaries of literals, literal-union types), if the stylesheets
// select `.c[data-x='v']` for some c in C with exact values S and none of the
// emitted values is in S, the attribute styling can never apply. Prefix /
// substring attribute operators and spread attributes are not evaluated.
//
// Allowlist: allowlist.json "classCoverage" entries
//   { file, rule, class, reason }  (class holds the class, prefix or
//   `data-x=value` key; no line numbers, so unrelated edits do not churn it).
// Entries are documented exceptions with a reason; the section is ratcheted
// by ratchet-floor.json. Stale entries are reported (not failed) so a fix can
// land before the allowlist shrinks.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const gateDir = dirname(fileURLToPath(import.meta.url));
const defaultSrc = join(gateDir, '../../apps/web/src');
const COMPONENT_DIRS = ['components/primitives', 'components/foundation'];
const CLASS_HELPERS = new Set(['cx', 'clsx', 'cn', 'classNames', 'classnames']);
const PASS_THROUGH_METHODS = new Set(['join', 'filter', 'trim', 'concat']);
const SENTINEL = '\u0000';
const MAX_EXPANSION = 256;

// ---------------------------------------------------------------- CSS side

function stripCssNoise(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, (m) =>
      // keep attribute-selector values; strings never contain braces we need
      m.replace(/[{};]/g, ' '),
    );
}

/** Rule preludes (selector lists) of a stylesheet, at-rule preludes excluded. */
export function selectorPreludes(css) {
  const text = stripCssNoise(css);
  const out = [];
  let buf = '';
  for (const ch of text) {
    if (ch === '{') {
      const prelude = buf.trim();
      if (prelude && !prelude.startsWith('@')) out.push(prelude);
      buf = '';
    } else if (ch === '}' || ch === ';') buf = '';
    else buf += ch;
  }
  return out;
}

function splitTopLevel(text, isSeparator) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (depth === 0 && isSeparator(ch)) {
      if (cur.trim()) parts.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

const GLOBAL = Symbol('classless');
export function emptyIndex() {
  return { classes: new Set(), attrs: new Map() };
}
const CLASS_RE = /\.(-?[_a-zA-Z][\w-]*)/g;
const ATTR_RE =
  /\[\s*([\w-]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+))\s*(?:[iIsS])?\s*)?\]/g;

/** Index of class names and, per class, the exact data-* values selected on
 * the same compound selector. */
export function indexCss(css, index = emptyIndex()) {
  for (const prelude of selectorPreludes(css)) {
    for (const selector of splitTopLevel(prelude, (c) => c === ',')) {
      for (const compound of splitTopLevel(selector, (c) => /[\s>+~]/.test(c))) {
        // Attribute values are stripped before class matching so `[href$='.pdf']`
        // never contributes a `.pdf` class.
        const withoutAttrs = compound.replace(/\[[^\]]*\]/g, '');
        const classes = [...withoutAttrs.matchAll(CLASS_RE)].map((m) => m[1]);
        for (const c of classes) index.classes.add(c);
        for (const m of compound.matchAll(ATTR_RE)) {
          const [, name, op] = m;
          if (!name.startsWith('data-') || !op) continue;
          const value = m[3] ?? m[4] ?? m[5];
          // A classless compound (`[data-gap='2']`) applies to every element.
          for (const c of classes.length ? classes : [GLOBAL]) {
            if (!index.attrs.has(c)) index.attrs.set(c, new Map());
            const byAttr = index.attrs.get(c);
            if (!byAttr.has(name))
              byAttr.set(name, { values: new Set(), wildcard: false });
            const entry = byAttr.get(name);
            if (op === '=') entry.values.add(value);
            else entry.wildcard = true;
          }
        }
      }
    }
  }
  return index;
}

function importsOf(css) {
  const out = [];
  const re = /@import\s+(?:url\(\s*)?["']([^"']+)["']/g;
  for (const m of stripCssNoiseKeepStrings(css).matchAll(re)) out.push(m[1]);
  return out;
}
function stripCssNoiseKeepStrings(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Index a stylesheet and its relative @import tree. */
export function indexCssFile(entry, index, seen = new Set()) {
  index ??= emptyIndex();
  const full = resolve(entry);
  if (seen.has(full) || !existsSync(full)) return index;
  seen.add(full);
  const css = readFileSync(full, 'utf8');
  indexCss(css, index);
  for (const spec of importsOf(css)) {
    if (/^(?:[a-z]+:)?\/\//i.test(spec) || !spec.startsWith('.')) continue;
    indexCssFile(join(dirname(full), spec), index, seen);
  }
  return index;
}

function mergeIndex(a, b) {
  const out = emptyIndex();
  for (const c of [...a.classes, ...b.classes]) out.classes.add(c);
  for (const src of [a, b])
    for (const [cls, byAttr] of src.attrs) {
      if (!out.attrs.has(cls)) out.attrs.set(cls, new Map());
      for (const [name, entry] of byAttr) {
        const target = out.attrs.get(cls);
        if (!target.has(name)) target.set(name, { values: new Set(), wildcard: false });
        const t = target.get(name);
        for (const v of entry.values) t.values.add(v);
        t.wildcard ||= entry.wildcard;
      }
    }
  return out;
}

// ---------------------------------------------------------- component side

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

function literalValues(type) {
  const parts = type.isUnion() ? type.types : [type];
  const values = [];
  for (const t of parts) {
    if (t.isStringLiteral()) values.push(t.value);
    else if (t.isNumberLiteral()) values.push(String(t.value));
    else if (t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)) continue;
    else if (t.flags & ts.TypeFlags.BooleanLiteral)
      continue; // `cond && 'x'` false arm
    else return null;
  }
  return values.length ? values : null;
}

/** Pure scan of one component module. Returns the emitted class/prefix
 * requirements and statically known data-* values per intrinsic element. */
export function extractEmissions(source, file = 'Fixture.tsx') {
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const options = {
    noLib: true,
    noResolve: true,
    target: ts.ScriptTarget.Latest,
    jsx: ts.JsxEmit.Preserve,
  };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (name) => (name === file ? sf : undefined);
  const checker = ts.createProgram([file], options, host).getTypeChecker();
  const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  const typeValues = (node) => {
    try {
      return literalValues(checker.getTypeAtLocation(node));
    } catch {
      return null;
    }
  };
  const localInitializer = (identifier) => {
    const symbol = checker.getSymbolAtLocation(identifier);
    const decl = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
    if (
      decl &&
      ts.isVariableDeclaration(decl) &&
      decl.initializer &&
      decl.getSourceFile() === sf
    )
      return decl.initializer;
    return null;
  };

  /** Possible string values of an expression: arrays of strings where
   * SENTINEL marks an unknown fragment. null means wholly unknown. */
  function strings(node, seen) {
    node = unwrap(node);
    if (!node) return null;
    if (ts.isStringLiteralLike(node)) return [node.text];
    if (ts.isNumericLiteral(node)) return [node.text];
    if (ts.isTemplateExpression(node)) {
      let acc = [node.head.text];
      for (const span of node.templateSpans) {
        const values = strings(span.expression, seen) ?? [SENTINEL];
        const next = [];
        for (const a of acc)
          for (const v of values) next.push(a + v + span.literal.text);
        acc = next.length > MAX_EXPANSION ? acc.map((a) => a + SENTINEL) : next;
      }
      return acc;
    }
    if (ts.isConditionalExpression(node)) {
      const t = strings(node.whenTrue, seen);
      const f = strings(node.whenFalse, seen);
      return t || f ? [...(t ?? [SENTINEL]), ...(f ?? [SENTINEL])] : null;
    }
    if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) {
      const values = typeValues(node);
      if (values) return values;
      if (ts.isIdentifier(node) && !seen.has(node.text)) {
        const init = localInitializer(node);
        if (init) return strings(init, new Set([...seen, node.text]));
      }
      return null;
    }
    return null;
  }

  /** Class tokens / prefixes contributed by a className expression. */
  function classes(node, seen = new Set(), out = []) {
    node = unwrap(node);
    if (!node) return out;
    if (ts.isArrayLiteralExpression(node)) {
      for (const el of node.elements)
        classes(ts.isSpreadElement(el) ? el.expression : el, seen, out);
      return out;
    }
    if (ts.isConditionalExpression(node)) {
      classes(node.whenTrue, seen, out);
      classes(node.whenFalse, seen, out);
      return out;
    }
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) classes(node.right, seen, out);
      else if (
        op === ts.SyntaxKind.BarBarToken ||
        op === ts.SyntaxKind.QuestionQuestionToken
      ) {
        classes(node.left, seen, out);
        classes(node.right, seen, out);
      }
      return out;
    }
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      if (ts.isIdentifier(callee) && CLASS_HELPERS.has(callee.text))
        for (const arg of node.arguments) classes(arg, seen, out);
      else if (
        ts.isPropertyAccessExpression(callee) &&
        PASS_THROUGH_METHODS.has(callee.name.text)
      ) {
        classes(callee.expression, seen, out);
        if (callee.name.text === 'concat')
          for (const arg of node.arguments) classes(arg, seen, out);
      }
      return out;
    }
    if (ts.isIdentifier(node) && !typeValues(node) && !seen.has(node.text)) {
      const init = localInitializer(node);
      if (init) classes(init, new Set([...seen, node.text]), out);
      return out;
    }
    const values = strings(node, seen);
    if (!values) return out;
    for (const value of values)
      for (const token of value.split(/\s+/).filter(Boolean)) {
        const cut = token.indexOf(SENTINEL);
        if (cut === -1) out.push({ kind: 'class', name: token, line: lineOf(node) });
        else if (cut > 0)
          out.push({ kind: 'prefix', name: token.slice(0, cut), line: lineOf(node) });
      }
    return out;
  }

  const requirements = [];
  const elements = [];
  const cssImports = [];
  const visit = (node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text.startsWith('.') &&
      node.moduleSpecifier.text.endsWith('.css')
    )
      cssImports.push(node.moduleSpecifier.text);
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(sf) === 'className' &&
      node.initializer
    ) {
      const expr = ts.isJsxExpression(node.initializer)
        ? node.initializer.expression
        : node.initializer;
      requirements.push(...classes(expr));
    }
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      node.name.text === 'className'
    )
      requirements.push(...classes(node.initializer));
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sf);
      if (/^[a-z]/.test(tag)) {
        let elementClasses = [];
        const data = [];
        for (const attr of node.attributes.properties) {
          if (!ts.isJsxAttribute(attr) || !attr.initializer) continue;
          const name = attr.name.getText(sf);
          const expr = ts.isJsxExpression(attr.initializer)
            ? attr.initializer.expression
            : attr.initializer;
          if (name === 'className')
            elementClasses = classes(expr)
              .filter((r) => r.kind === 'class')
              .map((r) => r.name);
          else if (name.startsWith('data-')) {
            const values = strings(expr, new Set());
            if (values && values.every((v) => !v.includes(SENTINEL)))
              data.push({ name, values: [...new Set(values)], line: lineOf(attr) });
          }
        }
        if (elementClasses.length && data.length)
          elements.push({ classes: elementClasses, data });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { requirements, elements, cssImports };
}

/** Findings for one component against a CSS index. */
export function scanSource(source, file, cssIndex) {
  const { requirements, elements } = extractEmissions(source, file);
  const findings = [];
  const seen = new Set();
  const add = (line, rule, cls, detail) => {
    const key = `${rule}:${cls}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ line, rule, class: cls, detail });
  };
  const known = [...cssIndex.classes];
  for (const req of requirements) {
    if (req.kind === 'class' && !cssIndex.classes.has(req.name))
      add(
        req.line,
        'uncovered-class',
        req.name,
        `.${req.name} has no rule in the stylesheet closure`,
      );
    if (
      req.kind === 'prefix' &&
      !known.some((c) => c.startsWith(req.name) && c.length > req.name.length)
    )
      add(
        req.line,
        'uncovered-prefix',
        req.name,
        `no rule styles any .${req.name}* class`,
      );
  }
  for (const el of elements)
    for (const attr of el.data)
      for (const cls of el.classes) {
        const entry = cssIndex.attrs.get(cls)?.get(attr.name);
        if (!entry || entry.wildcard || !entry.values.size) continue;
        const global = cssIndex.attrs.get(GLOBAL)?.get(attr.name);
        if (global?.wildcard) continue;
        if (attr.values.some((v) => entry.values.has(v) || global?.values.has(v)))
          continue;
        add(
          attr.line,
          'data-value-mismatch',
          `${cls}[${attr.name}]`,
          `emits ${attr.name}=${attr.values.map((v) => `'${v}'`).join('|')} but CSS selects .${cls}[${attr.name}=${[...entry.values].map((v) => `'${v}'`).join('|')}]`,
        );
      }
  return findings;
}

function componentFiles(webSrc) {
  const out = [];
  for (const dir of COMPONENT_DIRS) {
    const full = join(webSrc, dir);
    if (!statSync(full, { throwIfNoEntry: false })?.isDirectory()) continue;
    for (const entry of readdirSync(full).sort())
      if (/\.tsx$/.test(entry) && !/\.(?:test|spec)\.tsx$/.test(entry))
        out.push(join(full, entry));
  }
  return out;
}

export function scanScope(webSrc = defaultSrc) {
  const globalIndex = indexCssFile(join(webSrc, 'styles/index.css'));
  return componentFiles(webSrc).flatMap((full) => {
    const rel = `src/${relative(webSrc, full).replace(/\\/g, '/')}`;
    const source = readFileSync(full, 'utf8');
    const local = emptyIndex();
    const moduleCss = join(dirname(full), `${basename(full, '.tsx')}.module.css`);
    const extra = [
      moduleCss,
      ...extractEmissions(source, rel).cssImports.map((s) => join(dirname(full), s)),
    ];
    for (const css of extra) indexCssFile(css, local);
    const index = local.classes.size ? mergeIndex(globalIndex, local) : globalIndex;
    return scanSource(source, rel, index).map((f) => ({ file: rel, ...f }));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const hits = scanScope();
  if (process.argv.includes('--list')) console.log(JSON.stringify(hits, null, 2));
  else {
    const allowlist = JSON.parse(readFileSync(join(gateDir, 'allowlist.json'), 'utf8'));
    const entries = allowlist.classCoverage ?? [];
    const key = (e) => `${e.file}:${e.rule}:${e.class}`;
    const allowed = new Set(entries.map(key));
    const hitKeys = new Set(hits.map(key));
    const fresh = hits.filter((hit) => !allowed.has(key(hit)));
    const stale = entries.filter((e) => !hitKeys.has(key(e)));
    const unreasoned = entries.filter((e) => !e.reason);
    const listed = hits.filter((hit) => allowed.has(key(hit)));
    for (const hit of listed)
      console.log(
        `  allowlisted ${hit.file}:${hit.line} [${hit.rule}] ${hit.class} — ${hit.detail}`,
      );
    for (const e of stale)
      console.log(
        `  stale allowlist entry (now covered; remove it): ${e.file} [${e.rule}] ${e.class}`,
      );
    for (const e of unreasoned)
      console.error(
        `  allowlist entry without reason: ${e.file} [${e.rule}] ${e.class}`,
      );
    for (const hit of fresh)
      console.error(
        `  ${hit.file}:${hit.line} [${hit.rule}] ${hit.class} — ${hit.detail}`,
      );
    if (fresh.length || unreasoned.length) {
      console.error(
        `check:class-coverage (A9) FAILED — ${fresh.length} unstyled class hook(s) not in scripts/design-gates/allowlist.json` +
          (unreasoned.length
            ? `, ${unreasoned.length} allowlist entr(y/ies) missing a reason`
            : '') +
          '.\nAdd the rule to the component stylesheet (or rename the emitted hook to the styled one); defer only with an allowlist.json "classCoverage" entry carrying a reason.',
      );
      process.exitCode = 1;
    } else
      console.log(
        `check:class-coverage (A9) OK — no unlisted unstyled class hooks (${listed.length} allowlisted, ${stale.length} stale).`,
      );
  }
}
