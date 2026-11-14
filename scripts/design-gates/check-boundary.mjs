#!/usr/bin/env node
/**
 * features/<X> must not import features/<Y>.
 * Shared folders (hooks/chrome/auth/src top-level) must not import into features/<X>/,
 * except features/<x>/feature(.js) from chrome/featureRegistry.ts or routes.tsx.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const webSrc = join(repoRoot, 'apps', 'web', 'src');
const featuresRoot = join(webSrc, 'features');
const allowlistPath = join(__dirname, 'allowlist.json');

const COMPOSITION_ROOTS = new Set(['src/chrome/featureRegistry.ts', 'src/routes.tsx']);

function walk(dir) {
  const out = [];
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry) && !entry.includes('.test.')) out.push(full);
  }
  return out;
}

function webRel(file) {
  return relative(join(repoRoot, 'apps', 'web'), file).replace(/\\/g, '/');
}

function targetFeature(file, spec) {
  if (spec.includes('/features/')) {
    const m = spec.match(/\/features\/([^/]+)/);
    return m
      ? {
          feature: m[1],
          resolved: resolve(dirname(file), spec).replace(/\\/g, '/'),
        }
      : null;
  }
  if (spec.startsWith('.')) {
    const resolved = resolve(dirname(file), spec).replace(/\\/g, '/');
    const root = featuresRoot.replace(/\\/g, '/');
    if (resolved.startsWith(root + '/')) {
      return {
        feature: resolved.slice(root.length + 1).split('/')[0],
        resolved,
      };
    }
  }
  return null;
}

function isFeatureEntry(resolved) {
  return /\/features\/[^/]+\/feature(\.js)?$/.test(resolved);
}

const importFromRe = /from\s+['"]([^'"]+)['"]/g;

/** Cross-feature imports inside features/, or shared→feature imports outside. */
export function scanFile(file, content = readFileSync(file, 'utf8')) {
  const rel = webRel(file);
  const underFeatures = rel.startsWith('src/features/');
  const selfFeature = underFeatures
    ? rel.slice('src/features/'.length).split('/')[0]
    : null;
  const violations = [];
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    importFromRe.lastIndex = 0;
    let match;
    while ((match = importFromRe.exec(line))) {
      const hit = targetFeature(file, match[1]);
      if (!hit) continue;
      if (underFeatures) {
        if (selfFeature && hit.feature !== selfFeature) {
          violations.push({
            file: rel,
            line: idx + 1,
            rule: 'cross-feature',
            from: selfFeature,
            to: hit.feature,
          });
        }
        continue;
      }
      if (COMPOSITION_ROOTS.has(rel) && isFeatureEntry(hit.resolved)) continue;
      violations.push({
        file: rel,
        line: idx + 1,
        rule: 'shared-feature-import',
        from: rel.split('/')[1] ?? 'src',
        to: hit.feature,
      });
    }
  });
  return violations;
}

function sharedScanRoots() {
  const files = [
    ...walk(join(webSrc, 'hooks')),
    ...walk(join(webSrc, 'chrome')),
    ...walk(join(webSrc, 'auth')),
  ];
  for (const entry of readdirSync(webSrc)) {
    if (!/\.(ts|tsx)$/.test(entry) || entry.includes('.test.')) continue;
    files.push(join(webSrc, entry));
  }
  return files;
}

export function collectViolations() {
  const files = [...walk(featuresRoot), ...sharedScanRoots()];
  return files.flatMap((file) => scanFile(file));
}

function main() {
  const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8'));
  const crossAllowed = new Set(
    (allowlist.boundary || [])
      .filter((e) => e.rule === 'cross-feature')
      .map((e) => `${e.file}:${e.line}`),
  );
  const sharedAllowed = new Set(
    (allowlist.hooksBoundary || []).map((e) => `${e.file}:${e.line}`),
  );

  const violations = collectViolations();
  const fresh = violations.filter((v) => {
    const key = `${v.file}:${v.line}`;
    if (v.rule === 'cross-feature') return !crossAllowed.has(key);
    return !sharedAllowed.has(key);
  });

  if (fresh.length) {
    console.error('check:boundary FAILED — feature-boundary imports:');
    for (const v of fresh) {
      console.error(`  ${v.file}:${v.line}  ${v.from} -> ${v.to}  (${v.rule})`);
    }
    process.exit(1);
  }
  console.log('check:boundary OK');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
