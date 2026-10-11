import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyResult, runGates, summarize } from '../run-all.mjs';

test('zero-exit skipped gates do not certify executed coverage', () => {
  assert.equal(
    classifyResult({ status: 0, stdout: 'check:gallery SKIP — missing' }),
    'skipped',
  );
  const summary = summarize([{ status: 'passed' }, { status: 'skipped' }]);
  assert.equal(summary.complete, false);
  assert.equal(summary.counts.passed, 1);
});

test('failure takes precedence over skip text; absent process or pending coverage is unavailable', () => {
  assert.equal(
    classifyResult({ status: 1, stdout: 'SKIP', stderr: 'broken assertion' }),
    'failed',
  );
  assert.equal(
    classifyResult({ status: null, error: new Error('ENOENT') }),
    'unavailable',
  );
  assert.equal(
    classifyResult({ status: 0, stdout: 'PENDING: required primitive' }),
    'unavailable',
  );
});

test('all gates run after failure and each outcome remains distinct', () => {
  const calls = [];
  const outcomes = [
    { status: 1, stderr: 'actual failure' },
    { status: 0, stdout: 'SKIP: moved gallery' },
    { status: null, error: new Error('cannot launch') },
    { status: 0, stdout: 'executed checks passed' },
  ];
  const records = runGates(
    outcomes.map((_, index) => [`gate ${index}`, `gate-${index}.mjs`]),
    (_command, args) => {
      calls.push(args[0]);
      return outcomes[calls.length - 1];
    },
  );
  assert.equal(calls.length, 4);
  assert.deepEqual(
    records.map((record) => record.status),
    ['failed', 'skipped', 'unavailable', 'passed'],
  );
  assert.deepEqual(summarize(records), {
    counts: { passed: 1, failed: 1, skipped: 1, unavailable: 1 },
    complete: false,
  });
});

test('a fully executed suite can pass', () => {
  assert.equal(
    classifyResult({ status: 0, stdout: '15 assertions executed' }),
    'passed',
  );
  assert.equal(summarize([{ status: 'passed' }]).complete, true);
});
