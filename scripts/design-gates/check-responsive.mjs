#!/usr/bin/env node
/**
 * No viewport @media in apps/web/src (imposition layout doctrine).
 * Scans apps/web/src only.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const srcRoot = join(repoRoot, 'apps', 'web', 'src');
const allowlistPath = join(__dirname, 'allowlist.json');

/** Ban layout breakpoints; allow preference media such as prefers-color-scheme. */
const MEDIA_RE =
  /@media\s*[^{]*\b(max-width|min-width|width|max-height|min-height|height|orientation)\b/i;

function walk(dir) {
  const out = [];
  if (!statSync(srcRoot, { throwIfNoEntry: false })?.isDirectory()) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      out.push(...walk(full));
    } else if (/\.(css|ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8'));
const allowed = new Set((allowlist.responsive || []).map((e) => `${e.file}:${e.line}`));

const violations = [];
for (const file of walk(srcRoot)) {
  const rel = relative(join(repoRoot, 'apps', 'web'), file).replace(/\\/g, '/');
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, idx) => {
    if (MEDIA_RE.test(line)) {
      const key = `${rel}:${idx + 1}`;
      if (!allowed.has(key)) {
        violations.push({ file: rel, line: idx + 1, rule: 'no-viewport-media' });
      }
    }
  });
}

if (violations.length) {
  console.error('check:responsive FAILED — viewport @media in apps/web/src:');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]`);
  }
  process.exit(1);
}
console.log('check:responsive OK');
