#!/usr/bin/env node
// C4: error → loading → empty → ready, including status unions and .ts
// composition hooks. Required query guards must expose an error while peers load.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const gateDir = dirname(fileURLToPath(import.meta.url));
const defaultSrc = join(gateDir, '../../apps/web/src');
const STATES = ['error', 'loading', 'empty', 'ready'];
const UNKNOWN = Symbol('unknown');

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
function walk(node, fn, skipFunctions = false) {
  fn(node);
  ts.forEachChild(node, (child) => {
    if (!skipFunctions || !ts.isFunctionLike(child)) walk(child, fn, skipFunctions);
  });
}
function literal(node) {
  node = unwrap(node);
  return node && ts.isStringLiteralLike(node) ? node.text : null;
}
function returnedState(node) {
  node = unwrap(node);
  if (!node) return null;
  if (STATES.includes(literal(node))) return literal(node);
  if (ts.isObjectLiteralExpression(node)) {
    const status = node.properties.find(
      (p) => ts.isPropertyAssignment(p) && p.name.getText() === 'status',
    );
    if (status && STATES.includes(literal(status.initializer)))
      return literal(status.initializer);
  }
  if (ts.isJsxElement(node)) node = node.openingElement;
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    const status = node.attributes.properties.find(
      (p) => ts.isJsxAttribute(p) && p.name.getText() === 'status',
    );
    if (status && STATES.includes(literal(status.initializer)))
      return literal(status.initializer);
    const name = node.tagName.getText();
    if (/Error(?:State|Panel)$/.test(name)) return 'error';
    if (/(?:Loading|Skeleton)(?:State|Panel)?$/.test(name)) return 'loading';
    if (/Empty(?:State|Panel)$/.test(name)) return 'empty';
  }
  return null;
}
function branchState(node) {
  let state = null;
  walk(
    node,
    (child) => {
      if (ts.isReturnStatement(child)) state ??= returnedState(child.expression);
    },
    true,
  );
  return state;
}

/** Pure AST scanner. It checks syntax-level state branch order, then evaluates
 * Boolean query guards with one required source errored and its peers loading.
 * Unknown arbitrary application expressions are not executed by this scanner.
 */
export function scanSource(source, file = 'fixture.tsx') {
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const hits = [];
  const add = (node, rule, detail) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    if (
      !hits.some(
        (hit) => hit.line === line && hit.rule === rule && hit.detail === detail,
      )
    )
      hits.push({ line, rule, detail });
  };
  walk(sf, (fn) => {
    if (!ts.isFunctionLike(fn) || !fn.body) return;
    const aliases = new Map();
    walk(
      fn.body,
      (node) => {
        if (!ts.isVariableDeclaration(node) || !node.initializer) return;
        if (ts.isIdentifier(node.name)) aliases.set(node.name.text, node.initializer);
        else if (ts.isObjectBindingPattern(node.name)) {
          for (const element of node.name.elements) {
            if (ts.isIdentifier(element.name))
              aliases.set(
                element.name.text,
                ts.factory.createPropertyAccessExpression(
                  node.initializer,
                  element.propertyName ?? element.name,
                ),
              );
          }
        }
      },
      true,
    );
    const resolve = (node, seen = new Set()) => {
      node = unwrap(node);
      if (
        node &&
        ts.isIdentifier(node) &&
        aliases.has(node.text) &&
        !seen.has(node.text)
      ) {
        seen.add(node.text);
        return resolve(aliases.get(node.text), seen);
      }
      return node;
    };
    const property = (node) => {
      node = resolve(node);
      if (!node || !ts.isPropertyAccessExpression(node)) return null;
      return { root: node.expression.getText(sf), name: node.name.text };
    };
    const markers = (expr) => {
      const found = [];
      const visit = (node, seen = new Set()) => {
        node = unwrap(node);
        if (!node) return;
        if (ts.isIdentifier(node) && aliases.has(node.text) && !seen.has(node.text)) {
          visit(aliases.get(node.text), new Set([...seen, node.text]));
          return;
        }
        const prop = property(node);
        if (prop && /^(?:isError|isLoading|isPending)$/.test(prop.name))
          found.push({
            ...prop,
            state: prop.name === 'isError' ? 'error' : 'loading',
            node,
          });
        else if (
          ts.isIdentifier(node) &&
          /^(?:isError|isLoading|isPending)$/.test(node.text)
        )
          found.push({
            root: '$query',
            name: node.text,
            state: node.text === 'isError' ? 'error' : 'loading',
            node,
          });
        if (
          ts.isBinaryExpression(node) &&
          [
            ts.SyntaxKind.EqualsEqualsEqualsToken,
            ts.SyntaxKind.EqualsEqualsToken,
          ].includes(node.operatorToken.kind)
        ) {
          const lhs = property(node.left);
          const rhs = property(node.right);
          const status =
            lhs?.name === 'status'
              ? literal(node.right)
              : rhs?.name === 'status'
                ? literal(node.left)
                : null;
          if (STATES.includes(status) || status === 'pending')
            found.push({
              root: (lhs?.name === 'status' ? lhs : rhs).root,
              name: 'status',
              state: status === 'pending' ? 'loading' : status,
              node,
            });
        }
        if (ts.isPropertyAccessExpression(node)) visit(node.expression, seen);
        else
          ts.forEachChild(node, (child) => {
            if (!ts.isFunctionLike(child)) visit(child, seen);
          });
      };
      visit(expr);
      return found;
    };
    const events = [];
    const insideJsx = (node) => {
      for (let parent = node.parent; parent && parent !== fn; parent = parent.parent)
        if (ts.isJsxExpression(parent)) return true;
      return false;
    };
    const addEvent = (node, condition, body) => {
      const found = markers(condition);
      const result = branchState(body);
      const guardStates = new Set(found.map((marker) => marker.state));
      if (result && guardStates.size === 1 && !guardStates.has(result))
        add(
          node,
          'state-guard-result-mismatch',
          `${[...guardStates][0]} guard returns ${result}`,
        );
      let renders = false;
      let hasData = false;
      walk(
        body,
        (child) => {
          const expr = ts.isReturnStatement(child) && unwrap(child.expression);
          if (
            expr &&
            (ts.isJsxElement(expr) ||
              ts.isJsxSelfClosingElement(expr) ||
              ts.isJsxFragment(expr))
          )
            renders = true;
        },
        true,
      );
      walk(
        condition,
        (child) => {
          if (property(child)?.name === 'data') hasData = true;
        },
        true,
      );
      const empty =
        /\b(?:isEmpty|allEmpty|empty)\b/i.test(condition.getText(sf)) ||
        /\.length\s*===?\s*0\b/.test(condition.getText(sf));
      const state =
        result ??
        found[0]?.state ??
        (empty ? 'empty' : hasData && renders ? 'ready' : null);
      let meaningful = false;
      walk(
        body,
        (child) => {
          if (
            ts.isReturnStatement(child) ||
            (ts.isBinaryExpression(child) &&
              child.operatorToken.kind === ts.SyntaxKind.EqualsToken)
          )
            meaningful = true;
        },
        true,
      );
      if (state && meaningful) events.push({ node, condition, state, markers: found });
    };
    walk(
      fn.body,
      (node) => {
        if (ts.isIfStatement(node)) addEvent(node, node.expression, node.thenStatement);
        // Ternaries used only to derive an ID or a label are not render branches.
        if (
          ts.isConditionalExpression(node) &&
          !insideJsx(node) &&
          (returnedState(node.whenTrue) ||
            ts.isJsxElement(unwrap(node.whenTrue)) ||
            ts.isJsxSelfClosingElement(unwrap(node.whenTrue)))
        )
          addEvent(
            node,
            node.condition,
            ts.factory.createReturnStatement(node.whenTrue),
          );
        if (
          ts.isSwitchStatement(node) &&
          property(node.expression)?.name === 'status'
        ) {
          for (const clause of node.caseBlock.clauses) {
            if (
              ts.isCaseClause(clause) &&
              STATES.includes(literal(clause.expression))
            ) {
              events.push({
                node: clause,
                state: literal(clause.expression),
                markers: [],
                condition: null,
              });
            }
          }
        }
        if (ts.isReturnStatement(node) && returnedState(node.expression) === 'ready') {
          // A guarded ready branch is already represented by its guard.
          if (
            !events.some(
              (event) =>
                event.state === 'ready' &&
                node.pos >= event.node.pos &&
                node.end <= event.node.end,
            )
          )
            events.push({ node, state: 'ready', condition: null, markers: [] });
        }
      },
      true,
    );
    events.sort((a, b) => a.node.pos - b.node.pos);
    for (let i = 0; i < events.length; i++) {
      const first = events[i];
      for (const later of events.slice(i + 1)) {
        if (STATES.indexOf(first.state) <= STATES.indexOf(later.state)) continue;
        const rule =
          later.state === 'error'
            ? `error-before-${first.state}`
            : later.state === 'loading'
              ? `loading-before-${first.state}`
              : 'empty-before-ready';
        add(
          first.node,
          rule,
          `${first.state} branch precedes ${later.state} in the same function`,
        );
        break;
      }
    }

    const errorGuards = events.filter(
      (event) => event.state === 'error' && event.condition,
    );
    const required = new Set(
      events
        .filter((event) => ['error', 'loading'].includes(event.state))
        .flatMap((event) =>
          event.markers
            .filter((marker) => ['error', 'loading'].includes(marker.state))
            .map((marker) => marker.root),
        ),
    );
    if (required.size < 2) return;
    if (!errorGuards.length) {
      add(
        events.find((event) => event.state === 'loading').node,
        'eager-required-query-error',
        'required queries can load without any error branch',
      );
      return;
    }
    const evaluate = (expr, states, seen = new Set()) => {
      expr = unwrap(expr);
      if (!expr) return UNKNOWN;
      if (ts.isIdentifier(expr)) {
        if (expr.text === 'undefined') return undefined;
        if (aliases.has(expr.text) && !seen.has(expr.text))
          return evaluate(
            aliases.get(expr.text),
            states,
            new Set([...seen, expr.text]),
          );
        if (['isError', 'isLoading', 'isPending'].includes(expr.text))
          return evaluateProperty('$query', expr.text, states);
        return UNKNOWN;
      }
      if (ts.isStringLiteralLike(expr)) return expr.text;
      if (expr.kind === ts.SyntaxKind.TrueKeyword) return true;
      if (expr.kind === ts.SyntaxKind.FalseKeyword) return false;
      if (expr.kind === ts.SyntaxKind.NullKeyword) return null;
      if (ts.isPropertyAccessExpression(expr))
        return evaluateProperty(expr.expression.getText(sf), expr.name.text, states);
      if (
        ts.isPrefixUnaryExpression(expr) &&
        expr.operator === ts.SyntaxKind.ExclamationToken
      ) {
        const val = evaluate(expr.operand, states, seen);
        return val === UNKNOWN ? UNKNOWN : !val;
      }
      if (ts.isBinaryExpression(expr)) {
        const lhs = evaluate(expr.left, states, seen),
          rhs = evaluate(expr.right, states, seen);
        const op = expr.operatorToken.kind;
        if (op === ts.SyntaxKind.BarBarToken)
          return lhs === true || rhs === true
            ? true
            : lhs === UNKNOWN || rhs === UNKNOWN
              ? UNKNOWN
              : Boolean(lhs || rhs);
        if (op === ts.SyntaxKind.AmpersandAmpersandToken)
          return lhs === false || rhs === false
            ? false
            : lhs === UNKNOWN || rhs === UNKNOWN
              ? UNKNOWN
              : Boolean(lhs && rhs);
        if (lhs === UNKNOWN || rhs === UNKNOWN) return UNKNOWN;
        if (
          [
            ts.SyntaxKind.EqualsEqualsEqualsToken,
            ts.SyntaxKind.EqualsEqualsToken,
          ].includes(op)
        )
          return lhs === rhs;
        if (
          [
            ts.SyntaxKind.ExclamationEqualsEqualsToken,
            ts.SyntaxKind.ExclamationEqualsToken,
          ].includes(op)
        )
          return lhs !== rhs;
      }
      return UNKNOWN;
    };
    function evaluateProperty(root, name, states) {
      const state = states.get(root);
      if (!state) return UNKNOWN;
      if (name === 'status') return state === 'loading' ? 'pending' : state;
      if (name === 'isError') return state === 'error';
      if (name === 'isLoading' || name === 'isPending') return state === 'loading';
      if (name === 'data') return undefined;
      if (name === 'error')
        return state === 'error' ? { message: 'fixture failure' } : null;
      return UNKNOWN;
    }
    for (const failed of required) {
      const states = new Map(
        Array.from(required, (root) => [root, root === failed ? 'error' : 'loading']),
      );
      const results = errorGuards.map((guard) => evaluate(guard.condition, states));
      if (results.some((result) => result === true)) continue;
      if (results.every((result) => result !== UNKNOWN))
        add(
          errorGuards[0].node,
          'eager-required-query-error',
          `${failed} can error while required peers load without taking an error branch`,
        );
      else
        add(
          errorGuards[0].node,
          'unverifiable-required-query-error',
          `${failed} error guard uses an unsupported application predicate; eager exposure requires review`,
        );
    }
  });
  return hits;
}

function walkFiles(dir, out = []) {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return out;
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkFiles(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.(?:test|spec|d)\.tsx?$/.test(entry))
      out.push(full);
  }
  return out;
}
export function scanScope(webSrc = defaultSrc) {
  return walkFiles(webSrc).flatMap((file) => {
    const rel = `src/${relative(webSrc, file).replace(/\\/g, '/')}`;
    if (/(?:^|\/)(?:adapters|api|generated|mocks)\//.test(rel)) return [];
    return scanSource(readFileSync(file, 'utf8'), rel).map((hit) => ({
      file: rel,
      ...hit,
    }));
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const hits = scanScope();
  if (process.argv.includes('--list')) console.log(JSON.stringify(hits, null, 2));
  else {
    const allowlist = JSON.parse(readFileSync(join(gateDir, 'allowlist.json'), 'utf8'));
    const allowed = new Set(
      (allowlist.stateTrio ?? []).map(
        (entry) => `${entry.file}:${entry.line}:${entry.rule}`,
      ),
    );
    const fresh = hits.filter(
      (hit) => !allowed.has(`${hit.file}:${hit.line}:${hit.rule}`),
    );
    for (const hit of fresh)
      console.error(`  ${hit.file}:${hit.line} [${hit.rule}] ${hit.detail}`);
    if (fresh.length)
      console.error(
        `check:state-trio FAILED — ${fresh.length} state precedence violation(s).`,
      );
    else
      console.log(
        `check:state-trio OK — error/loading/empty/ready order and eager required-query guards (${hits.length} allowlisted).`,
      );
    process.exitCode = fresh.length ? 1 : 0;
  }
}
