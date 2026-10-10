#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const gates = [
  'check-tokens.mjs',
  'check-responsive.mjs',
  'check-boundary.mjs',
  'check-ratchet.mjs',
];

let failed = false;
for (const gate of gates) {
  const result = spawnSync(process.execPath, [join(__dirname, gate)], {
    stdio: 'inherit',
  });
  if (result.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
