import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectViolations, scanFile } from '../check-boundary.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures/hooks-boundary');
const webSrc = join(here, '../../../apps/web/src');

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

test('collectViolations walks shared folders outside features', () => {
  const found = collectViolations();
  assert.ok(
    found.some(
      (v) => v.rule === 'shared-feature-import' && v.file.startsWith('src/hooks/'),
    ),
    `expected shared-feature-import under src/hooks/; saw none among ${found.filter((v) => v.rule === 'shared-feature-import').length} shared hits`,
  );
});
