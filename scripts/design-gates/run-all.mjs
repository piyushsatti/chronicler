#!/usr/bin/env node
// Required gates run independently; a skipped check is never a passing check.
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const gateDirectory = dirname(fileURLToPath(import.meta.url));

export const GATES = [
  ['A4 boundary', 'check-boundary.mjs'],
  ['A4b architecture-ladder', 'check-architecture-ladder.mjs'],
  ['A5 tokens', 'check-tokens.mjs'],
  ['A8 layout', 'check-layout.mjs'],
  ['A9 class-coverage', 'check-class-coverage.mjs'],
  ['A10 custom-properties', 'check-custom-properties.mjs'],
  ['A6 duplication', 'check-duplication.mjs'],
  ['A6 orphan', 'check-orphan.mjs'],
  ['A6 theme-schema', 'check-theme-schema.mjs'],
  ['B7 contrast', 'check-contrast.mjs'],
  ['A7 ratchet', 'check-ratchet.mjs'],
  ['B6 gallery', 'check-gallery.mjs'],
  ['C4 state-trio', 'check-state-trio.mjs'],
  ['B10 motion', 'check-motion.mjs'],
  ['B8 effects', 'check-effects.mjs'],
  ['B9 cosmetic', 'check-cosmetic.mjs'],
  ['I1 responsive', 'check-responsive.mjs'],
];

export function classifyResult(result) {
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.error || result.status === null || result.status === undefined)
    return 'unavailable';
  if (result.status !== 0) return 'failed';
  if (/\bSKIP(?:PED)?\b/.test(output)) return 'skipped';
  if (/\bPENDING\b/.test(output)) return 'unavailable';
  return 'passed';
}

export function summarize(records) {
  const counts = { passed: 0, failed: 0, skipped: 0, unavailable: 0 };
  for (const record of records) counts[record.status] += 1;
  return { counts, complete: counts.passed === records.length };
}

export function runGates(gates = GATES, execute = spawnSync) {
  return gates.map(([label, script]) => {
    const result = execute(process.execPath, [join(gateDirectory, script)], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
    return {
      label,
      script,
      status: classifyResult(result),
      exitCode: result.status,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      error: result.error?.message ?? null,
    };
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const records = runGates();
  const summary = summarize(records);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ records, ...summary }, null, 2));
  } else {
    for (const record of records) {
      console.log(`\n${record.label} (${record.script}): ${record.status}`);
      if (record.stdout) process.stdout.write(record.stdout);
      if (record.stderr) process.stderr.write(record.stderr);
      if (record.error) console.error(record.error);
    }
    const { passed, failed, skipped, unavailable } = summary.counts;
    console.log(
      `\ndesign-gates: ${passed} passed, ${failed} failed, ${skipped} skipped, ${unavailable} unavailable`,
    );
  }
  process.exitCode = summary.complete ? 0 : 1;
}
