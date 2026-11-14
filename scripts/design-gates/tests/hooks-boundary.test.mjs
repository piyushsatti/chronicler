import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanFile } from '../check-boundary.mjs';

const fixtures = join(
  fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/hooks-boundary',
);
const webSrc = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../apps/web/src',
);

function hits(name) {
  const source = readFileSync(join(fixtures, name), 'utf8');
  const file = join(webSrc, 'hooks', name.replace(/\.txt$/, ''));
  return scanFile(file, source);
}

test('hooks importing a feature adapter is flagged', () => {
  const found = hits('adapter-import.ts.txt');
  assert.ok(
    found.some((v) => v.rule === 'shared-feature-import' && v.to === 'member'),
    `expected shared-feature-import into member; saw ${JSON.stringify(found)}`,
  );
});

test('hooks importing a feature-root file is flagged', () => {
  const found = hits('feature-root-import.ts.txt');
  assert.ok(
    found.some((v) => v.rule === 'shared-feature-import' && v.to === 'onboarding'),
    `expected shared-feature-import into onboarding; saw ${JSON.stringify(found)}`,
  );
});
