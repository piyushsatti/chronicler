import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { scanSource } from '../check-architecture-ladder.mjs';

const fixture = (name) =>
  readFileSync(new URL(`./fixtures/query-key-origin/${name}`, import.meta.url), 'utf8');

test('inline queryKey is flagged', () => {
  const hits = scanSource(
    fixture('inline.ts.txt'),
    'src/features/items/hooks/useItems.ts',
  );
  assert.ok(
    hits.some((hit) => hit.rule === 'query-key-origin'),
    `expected query-key-origin; saw ${JSON.stringify(hits)}`,
  );
});

test('factory queryKey passes', () => {
  const hits = scanSource(
    fixture('factory.ts.txt'),
    'src/features/items/hooks/useItems.ts',
  );
  assert.equal(
    hits.filter((hit) => hit.rule === 'query-key-origin').length,
    0,
  );
});
