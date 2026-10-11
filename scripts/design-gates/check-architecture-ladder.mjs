#!/usr/bin/env node
// Accepted transport → adapter → hook → view boundary, including feature-root UI.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const gateDir = dirname(fileURLToPath(import.meta.url));
const defaultSrc = join(gateDir, '../../apps/web/src');
const QUERY_HOOKS = new Set([
  'useQuery',
  'useMutation',
  'useInfiniteQuery',
  'useQueries',
  'useSuspenseQuery',
  'useSuspenseInfiniteQuery',
  'useSuspenseQueries',
]);
const DOM_GLOBALS = new Set([
  'window',
  'document',
  'localStorage',
  'sessionStorage',
  'navigator',
  'HTMLElement',
  'Element',
  'MutationObserver',
  'IntersectionObserver',
  'ResizeObserver',
  'DOMParser',
]);

function visit(node, fn) {
  fn(node);
  ts.forEachChild(node, (child) => visit(child, fn));
}
function unwrap(node) {
  while (
    node &&
    (ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isSatisfiesExpression(node))
  )
    node = node.expression;
  return node;
}
function importTarget(specifier, file) {
  if (specifier.startsWith('.'))
    return posix.normalize(posix.join(posix.dirname(file), specifier));
  if (specifier.startsWith('@/') || specifier.startsWith('~/'))
    return `src/${specifier.slice(2)}`;
  return specifier;
}
function moduleKind(target) {
  if (
    target === '@pi/contracts' ||
    target.startsWith('@pi/contracts/') ||
    /(?:^|\/)(?:generated|__generated__)(?:\/|$)/.test(target) ||
    /(?:^|\/)(?:openapi(?:\.gen)?|graphql\.gen|[^/]+\.generated|[^/]+\.gen)(?:\.|$)/.test(
      target,
    )
  )
    return 'wire';
  if (/(?:^|\/)adapters(?:\/|$)/.test(target)) return 'adapter';
  if (
    /(?:^|\/)api(?:\/|$)/.test(target) &&
    !/(?:^|\/)(?:queryKeys|endpoints)(?:\.|$)/.test(target)
  )
    return 'transport';
  return null;
}

/** Pure module scan; file is relative to apps/web (src/...). Adapter view-model
 * type imports are allowed, generated wire is not. UI hooks may manage DOM/local
 * storage, but hooks cannot render JSX or parse wire. */
export function scanSource(
  source,
  file = 'src/features/example/pages/ExamplePage.tsx',
) {
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  // Binding distinguishes DOM globals from locals such as `const window = ...`
  // and wire object keys such as `{ document: unknown }`, without loading libs.
  const options = { noLib: true, noResolve: true, target: ts.ScriptTarget.Latest };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (name) => (name === file ? sf : undefined);
  const checker = ts.createProgram([file], options, host).getTypeChecker();
  const findings = [];
  const seen = new Set();
  const add = (node, rule, detail) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const key = `${line}:${rule}:${detail}`;
    if (!seen.has(key)) findings.push({ line, rule, detail });
    seen.add(key);
  };
  const hook =
    /(?:^|\/)hooks\//.test(file) || /(?:^|\/)use[A-Z][^/]*\.tsx?$/.test(file);
  const adapter = /(?:^|\/)adapters\//.test(file);
  let jsx = false;
  visit(sf, (node) => {
    if (
      ts.isJsxElement(node) ||
      ts.isJsxSelfClosingElement(node) ||
      ts.isJsxFragment(node)
    )
      jsx = true;
  });
  const chrome = file.startsWith('src/chrome/');
  const shared = file.startsWith('src/components/');
  const ui =
    !hook &&
    !adapter &&
    (jsx || /(?:^|\/)(?:pages|components|fields)\//.test(file) || chrome);
  const imports = new Map();
  const namespaces = new Map();

  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier))
      continue;
    const specifier = stmt.moduleSpecifier.text;
    const target = importTarget(specifier, file);
    const kind = moduleKind(target);
    const clause = stmt.importClause;
    const bindings = clause?.namedBindings;
    const imported = [];
    if (clause?.name)
      imported.push({
        local: clause.name.text,
        name: 'default',
        type: clause.isTypeOnly,
      });
    if (bindings && ts.isNamespaceImport(bindings)) {
      namespaces.set(bindings.name.text, { specifier, target, kind });
      imported.push({ local: bindings.name.text, name: '*', type: clause.isTypeOnly });
    } else if (bindings) {
      for (const el of bindings.elements)
        imported.push({
          local: el.name.text,
          name: el.propertyName?.text ?? el.name.text,
          type: clause.isTypeOnly || el.isTypeOnly,
        });
    }
    for (const item of imported)
      imports.set(item.local, { ...item, specifier, target, kind });
    const runtime = !clause || imported.some((item) => !item.type);
    if (ui && kind === 'adapter' && runtime)
      add(
        stmt,
        chrome
          ? 'no-adapter-in-chrome'
          : shared
            ? 'no-adapter-in-shared'
            : 'no-adapter-in-ui',
        `adapter import: ${specifier}`,
      );
    if (ui && kind === 'transport' && runtime)
      add(stmt, 'no-transport-in-ui', `transport import: ${specifier}`);
    if (ui && kind === 'wire')
      add(stmt, 'no-generated-wire-in-view', `wire import: ${specifier}`);
    if (
      ui &&
      specifier === '@tanstack/react-query' &&
      imported.some(
        (item) => !item.type && (QUERY_HOOKS.has(item.name) || item.name === '*'),
      )
    )
      add(stmt, 'no-fetch-in-ui', 'query/mutation import');
    if (adapter && /^(?:react(?:\/|$)|react-dom(?:\/|$))/.test(specifier))
      add(stmt, 'no-react-in-adapter', `React import: ${specifier}`);
    if (hook && kind === 'transport' && runtime)
      add(stmt, 'no-transport-in-hook', `hooks must call adapters: ${specifier}`);
    const feature = file.match(/^src\/features\/([^/]+)\//)?.[1];
    const other = target.match(/^src\/features\/([^/]+)\/hooks\//)?.[1];
    if (hook && feature && other && feature !== other)
      add(stmt, 'no-cross-feature-hook', `hook import from ${other}`);
  }

  const callInfo = (expr) => {
    expr = unwrap(expr);
    if (ts.isIdentifier(expr)) return imports.get(expr.text) ?? { name: expr.text };
    if (ts.isPropertyAccessExpression(expr)) {
      const base = unwrap(expr.expression);
      const ns = ts.isIdentifier(base) && namespaces.get(base.text);
      return ns
        ? { ...ns, name: expr.name.text }
        : { name: expr.name.text, receiver: base };
    }
    return { name: '' };
  };
  const fetchCall = (node) => {
    if (!ts.isCallExpression(node)) return false;
    const info = callInfo(node.expression);
    return (
      info.name === 'fetch' ||
      info.kind === 'transport' ||
      (info.kind === 'adapter' && !/^parse[A-Z]/.test(info.name)) ||
      [
        'refetch',
        'fetchNextPage',
        'fetchPreviousPage',
        'fetchQuery',
        'prefetchQuery',
        'ensureQueryData',
      ].includes(info.name)
    );
  };
  const storedJson = (node, seen = new Set()) => {
    node = unwrap(node);
    if (!node) return false;
    if (ts.isStringLiteralLike(node)) return true;
    if (ts.isIdentifier(node)) {
      const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration;
      if (!declaration || seen.has(declaration)) return false;
      return storedJson(declaration.initializer, new Set([...seen, declaration]));
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      return (
        ['localStorage', 'sessionStorage'].includes(
          node.expression.expression.getText(sf),
        ) && node.expression.name.text === 'getItem'
      );
    }
    if (ts.isBinaryExpression(node))
      return storedJson(node.left, seen) && storedJson(node.right, seen);
    if (ts.isConditionalExpression(node))
      return storedJson(node.whenTrue, seen) && storedJson(node.whenFalse, seen);
    return false;
  };
  visit(sf, (node) => {
    if (
      hook &&
      (ts.isJsxElement(node) ||
        ts.isJsxSelfClosingElement(node) ||
        ts.isJsxFragment(node)) &&
      !findings.some((finding) => finding.rule === 'no-jsx-in-hook')
    )
      add(node, 'no-jsx-in-hook', 'hooks return data/callbacks; views render JSX');
    if (
      adapter &&
      ts.isIdentifier(node) &&
      DOM_GLOBALS.has(node.text) &&
      !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) &&
      !(ts.isPropertyAssignment(node.parent) && node.parent.name === node) &&
      !checker
        .getSymbolAtLocation(node)
        ?.declarations?.some((declaration) => declaration.getSourceFile() === sf)
    )
      add(node, 'no-dom-in-adapter', `DOM/global access: ${node.text}`);
    if (
      ts.isImportTypeNode(node) &&
      ui &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal) &&
      moduleKind(importTarget(node.argument.literal.text, file)) === 'wire'
    )
      add(node, 'no-generated-wire-in-view', 'inline generated-wire type import');
    if (
      ui &&
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      moduleKind(importTarget(node.moduleSpecifier.text, file)) === 'wire'
    )
      add(node, 'no-generated-wire-in-view', 'generated-wire re-export');
    if (!ts.isCallExpression(node)) return;
    if (
      ui &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0]) &&
      moduleKind(importTarget(node.arguments[0].text, file)) === 'wire'
    )
      add(node, 'no-generated-wire-in-view', 'dynamic generated-wire import');
    const info = callInfo(node.expression);
    if (hook && info.name === 'fetch')
      add(node, 'no-transport-in-hook', 'hooks must call adapters, not fetch');
    if (ui && fetchCall(node))
      add(node, 'no-fetch-in-ui', `transport/adapter call: ${info.name}`);
    if (ui && QUERY_HOOKS.has(info.name) && info.specifier === '@tanstack/react-query')
      add(node, 'no-fetch-in-ui', `query/mutation call: ${info.name}`);
    const jsonParse =
      info.name === 'parse' &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(sf) === 'JSON';
    const zodParse =
      ['parse', 'safeParse', 'parseAsync', 'safeParseAsync'].includes(info.name) &&
      !jsonParse;
    const jsonWireParse = jsonParse && !node.arguments.every((arg) => storedJson(arg));
    if (
      hook &&
      ((info.kind === 'adapter' && /^parse[A-Z]/.test(info.name)) ||
        zodParse ||
        jsonWireParse)
    )
      add(
        node,
        'no-wire-parse-in-hook',
        `wire parsing belongs in adapters: ${info.name}`,
      );
    if (info.name === 'useEffect' && (info.specifier === 'react' || !info.specifier)) {
      let callback = unwrap(node.arguments[0]);
      if (callback && ts.isIdentifier(callback)) {
        const callbackName = callback.text;
        visit(sf, (candidate) => {
          if (
            ts.isVariableDeclaration(candidate) &&
            ts.isIdentifier(candidate.name) &&
            candidate.name.text === callbackName
          )
            callback = unwrap(candidate.initializer);
          if (
            ts.isFunctionDeclaration(candidate) &&
            candidate.name?.text === callbackName
          )
            callback = candidate;
        });
      }
      if (callback)
        visit(callback, (candidate) => {
          if (fetchCall(candidate))
            add(
              candidate,
              'no-effect-fetch',
              'useEffect starts transport/query fetching',
            );
        });
    }
  });
  for (const [name, canonical] of [
    ['Field', 'src/components/foundation/Field.tsx'],
    ['StubNotice', 'src/components/foundation/StubNotice.tsx'],
  ]) {
    if (
      posix.basename(file).replace(/\.(?:ts|tsx)$/, '') === name &&
      file !== canonical
    )
      add(sf, 'duplicate-primitive', `${name} must live at ${canonical}`);
  }
  return findings;
}

function walk(dir, out = []) {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return out;
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(?:ts|tsx)$/.test(entry) && !/\.(?:test|spec|d)\.tsx?$/.test(entry))
      out.push(full);
  }
  return out;
}
export function scanScope(webSrc = defaultSrc) {
  return walk(webSrc).flatMap((file) => {
    const rel = `src/${relative(webSrc, file).replace(/\\/g, '/')}`;
    return scanSource(readFileSync(file, 'utf8'), rel).map((finding) => ({
      file: rel,
      ...finding,
    }));
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const hits = scanScope();
  if (process.argv.includes('--list')) console.log(JSON.stringify(hits, null, 2));
  else {
    const allowlist = JSON.parse(readFileSync(join(gateDir, 'allowlist.json'), 'utf8'));
    const exceptions = allowlist.architectureLadder ?? [];
    if (exceptions.length)
      console.error(
        'check:architecture-ladder FAILED — architectureLadder must remain empty.',
      );
    for (const hit of hits)
      console.error(`  ${hit.file}:${hit.line} [${hit.rule}] ${hit.detail}`);
    if (hits.length)
      console.error(
        `check:architecture-ladder FAILED — ${hits.length} violation(s); fix their owning layer.`,
      );
    if (!hits.length && !exceptions.length)
      console.log('check:architecture-ladder OK — no violations; allowlist empty.');
    process.exitCode = hits.length || exceptions.length ? 1 : 0;
  }
}
