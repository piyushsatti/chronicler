import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import { scanSource, scanScope } from '../check-architecture-ladder.mjs';

const fixture = (name) =>
  readFileSync(new URL(`./fixtures/p0-architecture/${name}`, import.meta.url), 'utf8');
const rules = (source, file) =>
  new Set(scanSource(source, file).map((hit) => hit.rule));
const negativeCases = [
  [
    'editor-route.tsx.txt',
    'src/features/editor/EditorRoute.tsx',
    ['no-adapter-in-ui', 'no-effect-fetch', 'no-fetch-in-ui'],
  ],
  [
    'editor-workspace.tsx.txt',
    'src/features/editor/EditorWorkspace.tsx',
    ['no-adapter-in-ui', 'no-fetch-in-ui'],
  ],
  [
    'editor-fields.tsx.txt',
    'src/features/editor/fields/FieldControls.tsx',
    ['no-adapter-in-ui', 'no-fetch-in-ui'],
  ],
  [
    'jsx-hook.tsx.txt',
    'src/features/character/hooks/useOwnerActions.tsx',
    ['no-jsx-in-hook'],
  ],
  [
    'wire-hook.ts.txt',
    'src/features/map/hooks/useMapPage.ts',
    ['no-wire-parse-in-hook'],
  ],
  [
    'generated-view.tsx.txt',
    'src/features/quest/pages/QuestPage.tsx',
    ['no-generated-wire-in-view'],
  ],
  [
    'react-dom-adapter.ts.txt',
    'src/features/items/adapters/itemsAdapter.ts',
    ['no-react-in-adapter', 'no-dom-in-adapter'],
  ],
  ['effect-hook.ts.txt', 'src/features/items/hooks/useItems.ts', ['no-effect-fetch']],
  [
    'effect-invalidate-queries.ts.txt',
    'src/features/items/hooks/useItems.ts',
    ['no-effect-fetch'],
  ],
];
for (const [name, path, expected] of negativeCases) {
  test(`reject ${name} at ${path}`, () => {
    const actual = rules(fixture(name), path);
    for (const rule of expected)
      assert.ok(actual.has(rule), `missing ${rule}; saw ${[...actual]}`);
  });
}
const positiveCases = [
  ['valid-view.tsx.txt', 'src/features/items/components/ItemsView.tsx'],
  ['valid-query-hook.ts.txt', 'src/features/items/hooks/useItems.ts'],
  ['valid-composition-hook.ts.txt', 'src/features/items/hooks/useItemsPage.ts'],
  ['valid-dom-hook.ts.txt', 'src/components/hooks/useFocus.ts'],
  ['valid-adapter.ts.txt', 'src/features/items/adapters/itemsAdapter.ts'],
  ['mutation-invalidate-queries.ts.txt', 'src/features/items/hooks/useSaveItem.ts'],
];
for (const [name, path] of positiveCases) {
  test(`accept ${name}`, () => assert.deepEqual(scanSource(fixture(name), path), []));
}
test('generated type, inline type, export and dynamic import are all view violations', () => {
  const hits = scanSource(
    fixture('generated-view.tsx.txt'),
    'src/features/quest/pages/QuestPage.tsx',
  );
  assert.equal(
    hits.filter((hit) => hit.rule === 'no-generated-wire-in-view').length,
    5,
  );
});
test('chrome calls a public hook and rejects an adapter import', () => {
  assert.deepEqual(
    scanSource(
      "import { useUnreadCount } from '../features/notifications/hooks/useUnreadCount.js'; export const Bell = () => <span>{useUnreadCount().data}</span>;",
      'src/chrome/Bell.tsx',
    ),
    [],
  );
  assert.ok(
    rules(
      "import { loadUnread } from '../features/notifications/adapters/notificationsAdapter.js'; export const Bell = () => <span>{loadUnread()}</span>;",
      'src/chrome/Bell.tsx',
    ).has('no-adapter-in-chrome'),
  );
});
test('transport is confined to adapters, including inline queryFn and effect fetch', () => {
  const source =
    "import { useEffect as effect } from 'react'; import { useQuery } from '@tanstack/react-query'; export function useItems() { effect(() => { void fetch('/items'); }, []); return useQuery({queryKey: ['items'], queryFn: () => fetch('/items')}); }";
  const actual = rules(source, 'src/features/items/hooks/useItems.ts');
  assert.ok(actual.has('no-transport-in-hook'));
  assert.ok(actual.has('no-effect-fetch'));
});
test('hook calls a parser imported under an alias; local draft JSON remains permitted', () => {
  const bad =
    "import { parseItems as convert } from '../adapters/itemsAdapter.js'; export const useItems = (wire: unknown) => convert(wire);";
  assert.ok(
    rules(bad, 'src/features/items/hooks/useItems.ts').has('no-wire-parse-in-hook'),
  );
  assert.ok(
    rules(
      'export const useItems = (response: string) => JSON.parse(response);',
      'src/features/items/hooks/useItems.ts',
    ).has('no-wire-parse-in-hook'),
  );
  assert.ok(
    rules(
      'export const useItems = (q) => JSON.parse(q.data);',
      'src/features/items/hooks/useItems.ts',
    ).has('no-wire-parse-in-hook'),
  );
  assert.ok(
    rules(
      "import { schema } from '../schema.js'; export const useItems = (q) => schema.parse(q.data);",
      'src/features/items/hooks/useItems.ts',
    ).has('no-wire-parse-in-hook'),
  );
  assert.deepEqual(
    scanSource(
      "export const useDraft = () => { const raw = localStorage.getItem('draft'); return raw ? JSON.parse(raw) : null; };",
      'src/features/editor/hooks/useEditorDraft.ts',
    ),
    [],
  );
});
test('foreign feature hooks are rejected; same-feature composition is allowed', () => {
  assert.ok(
    rules(
      "import { useItems } from '../../items/hooks/useItems.js'; export const useOtherPage = () => useItems();",
      'src/features/other/hooks/useOtherPage.ts',
    ).has('no-cross-feature-hook'),
  );
});
test('DOM globals are rejected but locals and wire keys called window/document are allowed', () => {
  assert.ok(
    rules(
      'export const load = () => document.body.textContent;',
      'src/features/items/adapters/itemsAdapter.ts',
    ).has('no-dom-in-adapter'),
  );
  assert.deepEqual(
    scanSource(
      'export const parse = (document: { name: string }) => document.name; export const load = () => { const window = { document: 1 }; return window.document; };',
      'src/features/items/adapters/itemsAdapter.ts',
    ),
    [],
  );
  assert.ok(
    rules(
      "import type { ReactNode } from 'react'; export type View = ReactNode;",
      'src/features/items/adapters/itemsAdapter.ts',
    ).has('no-react-in-adapter'),
  );
});
test('scanScope includes feature-root editor UI and skips test/declaration files', () => {
  const root = mkdtempSync(join(tmpdir(), 'p0-architecture-'));
  try {
    const dir = join(root, 'features/editor');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'EditorRoute.tsx'), fixture('editor-route.tsx.txt'));
    writeFileSync(join(dir, 'EditorRoute.test.tsx'), fixture('editor-route.tsx.txt'));
    writeFileSync(join(dir, 'EditorRoute.d.ts'), fixture('generated-view.tsx.txt'));
    const hits = scanScope(root);
    assert.ok(
      hits.some(
        (hit) =>
          hit.file === 'src/features/editor/EditorRoute.tsx' &&
          hit.rule === 'no-effect-fetch',
      ),
    );
    assert.ok(hits.every((hit) => hit.file === 'src/features/editor/EditorRoute.tsx'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
