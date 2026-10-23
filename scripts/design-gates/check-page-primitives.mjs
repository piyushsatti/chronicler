#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const gateDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(gateDir, '..', '..');
const webRoot = join(repoRoot, 'apps', 'web');
const sourceRoot = join(webRoot, 'src');
const primitiveStyles = 'src/styles/primitives.css';
const indexPages = [
  'src/features/quest/components/QuestBoardView.tsx',
  'src/features/chronicle/pages/ChroniclesListPage.tsx',
  'src/features/codex/pages/CodexPage.tsx',
  'src/features/rules/pages/RulesPage.tsx',
];
const toolbarPages = [
  ...indexPages,
  'src/features/community/pages/CommunityPage.tsx',
  'src/features/map/components/MapDirectory.tsx',
  'src/features/map/components/PointcrawlViewport.tsx',
];
const segmentedTags = new Set(['PageToolbar.Segments', 'SegmentedControl', 'SegmentedNav', 'Tabs', 'Tabs.Nav', 'TabNav']);

function walk(dir, extensions) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...walk(path, extensions));
    else if (extensions.some((extension) => entry.endsWith(extension))) files.push(path);
  }
  return files;
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

export function scanCss(relPath, source) {
  const hits = [];
  if (relPath === primitiveStyles) return hits;
  const blocks = stripComments(source).matchAll(/([^{}]+)\{([^{}]*)\}/g);
  for (const [, selectorText, body] of blocks) {
    const selectors = selectorText.split(',').map((selector) => selector.trim());
    const declarations = [...body.matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g)];
    for (const selector of selectors) {
      const title = /(?<![\w-])\.page-header__title(?![\w-])/i.test(selector);
      const protectedPrimitive = /(?<![\w-])\.(?:segmented-track|segmented-pill|page-toolbar__icon)(?![\w-])/i.test(selector);
      for (const [, property] of declarations) {
        const prop = property.toLowerCase();
        if (title && ['font-size', 'line-height', 'font-family'].includes(prop) && relPath.startsWith('src/features/')) {
          hits.push({ file: relPath, selector, property: prop, rule: 'page-title-typography' });
        }
        if (protectedPrimitive && ['height', 'padding', 'padding-block', 'padding-inline', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left'].includes(prop)) {
          hits.push({ file: relPath, selector, property: prop, rule: 'primitive-dimensions' });
        }
      }
    }
  }
  return hits;
}

function walkSyntax(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walkSyntax(child, visit));
}

function opening(node) {
  return ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
}

function attribute(node, name) {
  const value = opening(node)?.attributes.properties.find((prop) => ts.isJsxAttribute(prop) && prop.name.getText() === name)?.initializer;
  return value && ts.isJsxExpression(value) ? value.expression : value;
}

function sourceTree(relPath, source) {
  return ts.createSourceFile(relPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

export function checkIndexPage(relPath, source, requireSegments = true) {
  const tags = new Set();
  walkSyntax(sourceTree(relPath, source), (node) => {
    if (opening(node)) tags.add(opening(node).tagName.getText());
  });
  const failures = [];
  if (!tags.has('PageToolbar')) {
    failures.push(`${relPath}: index page must render the shared PageToolbar`);
  }
  if (requireSegments ? !tags.has('PageToolbar.Segments') : ![...tags].some((tag) => segmentedTags.has(tag))) {
    failures.push(`${relPath}: index page must render ${requireSegments ? 'PageToolbar.Segments' : 'shared segmented controls'}`);
  }
  return failures;
}

export function scanSegments(relPath, source) {
  const tree = sourceTree(relPath, source);
  const bindings = new Map();
  const failures = new Set();
  const scope = (node) => {
    while (node && !ts.isBlock(node) && !ts.isSourceFile(node) && !ts.isFunctionLike(node)) node = node.parent;
    return node;
  };
  walkSyntax(tree, (node) => {
    if ((ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) || (ts.isFunctionDeclaration(node) && node.name)) {
      const owner = scope(node.parent);
      if (!bindings.has(owner)) bindings.set(owner, new Map());
      bindings.get(owner).set(node.name.text, node.initializer ?? node);
    }
  });
  const resolve = (node) => {
    for (let owner = scope(node.parent); owner; owner = scope(owner.parent)) {
      const value = bindings.get(owner)?.get(node.text);
      if (value) return value;
    }
    return null;
  };
  const numeric = /^(?:\d[\d,.]*|\(\d[\d,.]*\))$/;
  const countName = /^(?:count|total|length)$|(?:Count|Total)$|_(?:count|total)$/;
  const hasCount = (node, seen = new Set()) => {
    if (!node || seen.has(node)) return false;
    seen = new Set([...seen, node]);
    if (ts.isIdentifier(node)) return hasCount(resolve(node), seen) || countName.test(node.text);
    if (ts.isNumericLiteral(node)) return true;
    if (ts.isStringLiteralLike(node) || ts.isJsxText(node)) return numeric.test(node.text.trim());
    if (ts.isPropertyAccessExpression(node)) {
      if (countName.test(node.name.text)) return true;
      const owner = ts.isIdentifier(node.expression) ? resolve(node.expression) : node.expression;
      if (owner && ts.isObjectLiteralExpression(owner)) {
        const property = owner.properties.find((prop) => ts.isPropertyAssignment(prop) && prop.name.getText() === node.name.text);
        return hasCount(property?.initializer, seen);
      }
      return !ts.isIdentifier(node.expression) && hasCount(node.expression, seen);
    }
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) return node.children.some((child) => hasCount(child, seen));
    if (ts.isJsxSelfClosingElement(node)) return ['count', 'value'].some((name) => hasCount(attribute(node, name), seen));
    if (ts.isFunctionLike(node) && node.body) {
      if (!ts.isBlock(node.body)) return hasCount(node.body, seen);
      let found = false;
      walkSyntax(node.body, (child) => {
        if (ts.isReturnStatement(child) && hasCount(child.expression, seen)) found = true;
      });
      return found;
    }
    return ts.forEachChild(node, (child) => hasCount(child, seen)) === true;
  };
  const checkLabels = (node, seen = new Set()) => {
    if (!node || seen.has(node)) return;
    seen = new Set([...seen, node]);
    if (ts.isIdentifier(node)) {
      checkLabels(resolve(node), seen);
      return;
    }
    if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) {
      const name = ts.isStringLiteralLike(node.name) ? node.name.text : node.name.getText();
      if (name === 'label' && hasCount(node.initializer ?? node.name)) failures.add(`${relPath}: count badges are not allowed inside segmented labels`);
      return;
    }
    ts.forEachChild(node, (child) => checkLabels(child, seen));
  };
  walkSyntax(tree, (node) => {
    const element = opening(node);
    if (!element) return;
    const tag = element.tagName.getText();
    if (segmentedTags.has(tag)) {
      for (const name of ['options', 'moreOptions', 'items']) checkLabels(attribute(node, name));
      if (tag === 'SegmentedControl' && ts.isJsxElement(node) && node.children.some((child) => hasCount(child))) failures.add(`${relPath}: count badges are not allowed inside segmented labels`);
    }
    const role = attribute(node, 'role');
    const className = attribute(node, 'className')?.getText() ?? '';
    const pageRole = role && ts.isStringLiteralLike(role) && role.text === 'toolbar' && !/\ble-toolbar\b/.test(className);
    const customToolbar = pageRole || /\b(?:pageToolbar|toolbar)\b/i.test(className);
    let containsSegments = false;
    let containsSharedToolbar = false;
    if (customToolbar) walkSyntax(node, (child) => {
      if (opening(child) && segmentedTags.has(opening(child).tagName.getText())) containsSegments = true;
      if (opening(child)?.tagName.getText() === 'PageToolbar') containsSharedToolbar = true;
    });
    if (tag !== 'PageToolbar' && !containsSharedToolbar && (pageRole || (customToolbar && containsSegments) || /\bpage-toolbar\b/.test(className))) {
      failures.add(`${relPath}: page toolbars must render the shared PageToolbar`);
    }
  });
  return [...failures];
}

export function runChecks() {
  const failures = [];
  for (const relPath of toolbarPages) {
    const path = join(webRoot, relPath);
    if (!existsSync(path)) {
      failures.push(`${relPath}: required index page is missing`);
      continue;
    }
    failures.push(...checkIndexPage(relPath, readFileSync(path, 'utf8'), indexPages.includes(relPath)));
  }
  for (const path of walk(join(sourceRoot, 'features'), ['.tsx'])) {
    const relPath = relative(webRoot, path).replace(/\\/g, '/');
    failures.push(...scanSegments(relPath, readFileSync(path, 'utf8')));
  }
  for (const path of walk(sourceRoot, ['.css'])) {
    const relPath = relative(webRoot, path).replace(/\\/g, '/');
    failures.push(...scanCss(relPath, readFileSync(path, 'utf8')).map((hit) =>
      `${hit.file}: ${hit.rule} ${hit.property} on ${hit.selector}`,
    ));
  }
  return failures;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const failures = runChecks();
  if (failures.length) {
    console.error(`check:page-primitives (P1) FAILED — ${failures.length} issue(s):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`check:page-primitives (P1) OK — ${toolbarPages.length} pages use shared toolbars; segmented labels and CSS ownership hold.`);
}
