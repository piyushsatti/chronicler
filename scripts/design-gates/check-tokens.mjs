#!/usr/bin/env node
/**
 * Ban raw hex / rgb / hsl literals outside tokens.css under apps/web/src.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const srcRoot = join(repoRoot, 'apps', 'web', 'src');
const allowlistPath = join(__dirname, 'allowlist.json');

const HEX_QUOTED = /(['"])#[0-9a-fA-F]{3,8}\1/g;
const CSS_HEX = /#[0-9a-fA-F]{3,8}\b/g;
const RGB_HSL = /\b(rgb|rgba|hsl|hsla)\(\s*[\d.]/g;

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
const allowed = new Set((allowlist.tokens || []).map((e) => `${e.file}:${e.line}`));

const violations = [];
for (const file of walk(srcRoot)) {
  const rel = relative(join(repoRoot, 'apps', 'web'), file).replace(/\\/g, '/');
  if (rel === 'src/styles/tokens.css') continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, idx) => {
    const hits = [];
    if (HEX_QUOTED.test(line) || CSS_HEX.test(line) || RGB_HSL.test(line)) {
      hits.push('raw-color');
    }
    HEX_QUOTED.lastIndex = 0;
    CSS_HEX.lastIndex = 0;
    RGB_HSL.lastIndex = 0;
    if (hits.length && !allowed.has(`${rel}:${idx + 1}`)) {
      violations.push({ file: rel, line: idx + 1, rule: hits[0] });
    }
  });
}

if (violations.length) {
  console.error('check:tokens FAILED — raw colors outside tokens.css:');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]`);
  }
  process.exit(1);
}
console.log('check:tokens OK');
