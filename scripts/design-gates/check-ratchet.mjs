#!/usr/bin/env node
/**
 * Allowlist sections may only shrink relative to ratchet-floor.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const allowlistPath = join(__dirname, 'allowlist.json');
const floorPath = join(__dirname, 'ratchet-floor.json');
const updateMode = process.argv.includes('--update');

const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8'));
const floor = JSON.parse(readFileSync(floorPath, 'utf8'));
const sections = Object.keys(floor).filter((k) => k !== '_comment');

let failed = false;
for (const section of sections) {
  const length = (allowlist[section] || []).length;
  const ceiling = floor[section];
  if (length > ceiling) {
    failed = true;
    console.error(
      `check:ratchet FAILED — ${section} grew to ${length} (ceiling ${ceiling})`,
    );
  } else if (updateMode && length < ceiling) {
    floor[section] = length;
    console.log(`check:ratchet lowered ${section}: ${ceiling} -> ${length}`);
  }
}

if (updateMode) {
  writeFileSync(floorPath, JSON.stringify(floor, null, 2) + '\n');
}

if (failed) process.exit(1);
console.log('check:ratchet OK');
