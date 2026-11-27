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

test('featureParts may import a feature parts entry, nothing deeper', () => {
  const file = join(webSrc, 'chrome', 'featureParts.ts');
  const ok = scanFile(file, "import * as member from '../features/member/parts.js';\n");
  assert.deepEqual(ok, []);
  const deep = scanFile(
    file,
    "import { useMemberHub } from '../features/member/hooks/useMemberHub.js';\n",
  );
  assert.equal(deep.length, 1);
  assert.equal(deep[0].rule, 'shared-feature-import');
});

test('featureRegistry may not import a parts entry, and other chrome may not import either', () => {
  const registry = scanFile(
    join(webSrc, 'chrome', 'featureRegistry.ts'),
    "import * as member from '../features/member/parts.js';\n",
  );
  assert.equal(registry.length, 1);
  const chrome = scanFile(
    join(webSrc, 'chrome', 'SiteChrome.tsx'),
    "import * as member from '../features/member/parts.js';\n",
  );
  assert.equal(chrome.length, 1);
});

test('a feature importing another feature parts entry is cross-feature', () => {
  const found = scanFile(
    join(webSrc, 'features', 'member', 'pages', 'MePage.tsx'),
    "import { parts } from '../../admin/parts.js';\n",
  );
  assert.equal(found.length, 1);
  assert.equal(found[0].rule, 'cross-feature');
});

test('shared folders reach features only through the composition roots', () => {
  const shared = collectViolations().filter((v) => v.rule === 'shared-feature-import');
  assert.deepEqual(shared, []);
});
