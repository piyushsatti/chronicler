import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { scanSource } from '../check-architecture-ladder.mjs';

const fixture = (name) =>
  readFileSync(
    new URL(`./fixtures/idempotency-key-origin/${name}`, import.meta.url),
    'utf8',
  );

test('crypto.randomUUID outside the fence hook is flagged', () => {
  const hits = scanSource(
    fixture('outside.ts.txt'),
    'src/features/items/hooks/useItems.ts',
  );
  assert.ok(
    hits.some((hit) => hit.rule === 'idempotency-key-origin'),
    `expected idempotency-key-origin; saw ${JSON.stringify(hits)}`,
  );
});

test('crypto.randomUUID inside useFencedMutation passes', () => {
  const hits = scanSource(fixture('inside.ts.txt'), 'src/hooks/useFencedMutation.ts');
  assert.equal(hits.filter((hit) => hit.rule === 'idempotency-key-origin').length, 0);
});

test('crypto.randomUUID inside the client-id helper passes', () => {
  const hits = scanSource(fixture('inside.ts.txt'), 'src/utils/clientId.ts');
  assert.equal(hits.filter((hit) => hit.rule === 'idempotency-key-origin').length, 0);
});
