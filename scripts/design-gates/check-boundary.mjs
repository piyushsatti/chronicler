#!/usr/bin/env node
/**
 * features/<X> must not import features/<Y>. Scans apps/web/src/features.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const featuresRoot = join(repoRoot, 'apps', 'web', 'src', 'features');
const allowlistPath = join(__dirname, 'allowlist.json');

function walk(dir) {
  const out = [];
  if (!statSync(featuresRoot, { throwIfNoEntry: false })?.isDirectory()) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry) && !entry.includes('.test.')) out.push(full);
  }
  return out;
}

const importFromRe = /from\s+['"]([^'"]+)['"]/g;
const violations = [];

for (const file of walk(featuresRoot)) {
  const relFromFeatures = relative(featuresRoot, file).replace(/\\/g, '/');
  const selfFeature = relFromFeatures.split('/')[0];
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    importFromRe.lastIndex = 0;
    let match;
    while ((match = importFromRe.exec(line))) {
      const spec = match[1];
      let targetFeature = null;
      if (spec.includes('/features/')) {
        const m = spec.match(/\/features\/([^/]+)/);
        targetFeature = m ? m[1] : null;
      } else if (spec.startsWith('.')) {
        const resolved = resolve(dirname(file), spec).replace(/\\/g, '/');
        const root = featuresRoot.replace(/\\/g, '/');
        if (resolved.startsWith(root + '/')) {
          targetFeature = resolved.slice(root.length + 1).split('/')[0];
        }
      }
      if (targetFeature && selfFeature && targetFeature !== selfFeature) {
        const rel = relative(join(repoRoot, 'apps', 'web'), file).replace(/\\/g, '/');
        violations.push({
          file: rel,
          line: idx + 1,
          rule: 'cross-feature',
          from: selfFeature,
          to: targetFeature,
        });
      }
    }
  });
}

const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8'));
const allowed = new Set(
  (allowlist.boundary || [])
    .filter((e) => e.rule === 'cross-feature')
    .map((e) => `${e.file}:${e.line}`),
);

const fresh = violations.filter((v) => !allowed.has(`${v.file}:${v.line}`));
if (fresh.length) {
  console.error('check:boundary FAILED — cross-feature imports:');
  for (const v of fresh) {
    console.error(`  ${v.file}:${v.line}  ${v.from} -> ${v.to}`);
  }
  process.exit(1);
}
console.log('check:boundary OK');
