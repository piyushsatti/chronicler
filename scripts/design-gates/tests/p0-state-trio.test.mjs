import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { scanSource, scanScope } from '../check-state-trio.mjs';

const fixture = (name) =>
  readFileSync(new URL(`./fixtures/p0-state/${name}.ts.txt`, import.meta.url), 'utf8');
function project(name) {
  const context = { exports: {} };
  const output = ts.transpileModule(fixture(name), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(output, context, { timeout: 1000 });
  return context.exports.project;
}
const query = (state, items = ['item']) => ({
  isError: state === 'error',
  isLoading: state === 'loading',
  data: state === 'ready' ? items : undefined,
});
for (const name of ['eager-valid', 'eager-alias-valid']) {
  test(`${name}: real composition returns error while either required peer loads`, () => {
    const render = project(name);
    assert.equal(render(query('error'), query('loading')).status, 'error');
    assert.equal(render(query('loading'), query('error')).status, 'error');
    assert.equal(render(query('ready'), query('loading')).status, 'loading');
    assert.equal(render(query('loading'), query('ready')).status, 'loading');
    assert.equal(render(query('ready', []), query('ready')).status, 'empty');
    assert.equal(render(query('ready'), query('ready')).status, 'ready');
    assert.deepEqual(
      scanSource(fixture(name), 'src/features/home/hooks/useHomePage.ts'),
      [],
    );
  });
}
test('loading-first fixture actually masks an independent error, and scanner rejects it', () => {
  assert.equal(
    project('loading-first')(query('error'), query('loading')).status,
    'loading',
  );
  assert.ok(
    scanSource(fixture('loading-first')).some(
      (hit) => hit.rule === 'error-before-loading',
    ),
  );
});
for (const name of ['error-waits-for-peer', 'error-requires-both']) {
  test(`${name}: order alone passes but delayed errors fail behavior and eager guard`, () => {
    const render = project(name);
    assert.equal(render(query('error'), query('loading')).status, 'loading');
    assert.equal(render(query('loading'), query('error')).status, 'loading');
    const hits = scanSource(fixture(name));
    assert.equal(
      hits.filter((hit) => hit.rule === 'eager-required-query-error').length,
      2,
    );
    assert.ok(!hits.some((hit) => hit.rule === 'error-before-loading'));
  });
}
test('content-first fixture actually renders empty content as ready, and scanner rejects it', () => {
  assert.equal(
    project('content-first')(query('ready', []), query('ready')).status,
    'ready',
  );
  assert.ok(
    scanSource(fixture('content-first')).some(
      (hit) => hit.rule === 'empty-before-ready',
    ),
  );
});
test('status-union page order is enforced for if/else, arrow functions and switch', () => {
  const valid =
    "const Page = (page) => { if (page.status === 'error') return <ErrorState />; else if (page.status === 'loading') return <LoadingState />; else if (page.status === 'empty') return <EmptyState />; return <Content />; };";
  assert.deepEqual(scanSource(valid), []);
  const invalid = valid.replace(
    "if (page.status === 'error') return <ErrorState />; else if (page.status === 'loading') return <LoadingState />;",
    "if (page.status === 'loading') return <LoadingState />; else if (page.status === 'error') return <ErrorState />;",
  );
  assert.ok(scanSource(invalid).some((hit) => hit.rule === 'error-before-loading'));
  const badSwitch =
    "function Page(page) { switch(page.status) { case 'ready': return <Content/>; case 'empty': return <EmptyState/>; case 'loading': return <LoadingState/>; case 'error': return <ErrorState/>; } }";
  assert.ok(scanSource(badSwitch).some((hit) => hit.rule === 'empty-before-ready'));
});
test('braces in strings/comments and independent nested functions do not join guards', () => {
  const source =
    "function Outer(a) { const message = '{ isLoading }'; /* } */ function Inner(b) { if(b.isError) return <ErrorState/>; return <Content/>; } if(a.isLoading) return <LoadingState/>; return <Content title={message} />; }";
  assert.deepEqual(scanSource(source), []);
});
test('ready ID derivation and mutation error feedback inside JSX do not masquerade as page guards', () => {
  const source =
    "function Page(page, mutation) { const id = page.status === 'ready' ? page.view.id : ''; if(page.status === 'error') return <ErrorState/>; if(page.status === 'loading') return <LoadingState/>; if(page.status === 'empty') return <EmptyState/>; return <Content id={id}>{mutation.isError ? <ErrorState/> : null}</Content>; }";
  assert.deepEqual(scanSource(source), []);
});
test('an error from a required query omitted from the error guard is rejected', () => {
  const source = fixture('eager-valid').replace(
    'heading.isError || details.isError',
    'heading.isError',
  );
  assert.ok(
    scanSource(source).some(
      (hit) =>
        hit.rule === 'eager-required-query-error' && hit.detail.startsWith('details '),
    ),
  );
});
test('multiple separate error branches satisfy eager errors', () => {
  const source = fixture('eager-valid').replace(
    "if (heading.isError || details.isError) return { status: 'error' };",
    "if (heading.isError) return { status: 'error' }; if (details.isError) return { status: 'error' };",
  );
  assert.deepEqual(scanSource(source), []);
});
test('two required queries without an error branch cannot silently pass', () => {
  const source = fixture('eager-valid').replace(
    "if (heading.isError || details.isError) return { status: 'error' };",
    '',
  );
  assert.ok(
    scanSource(source).some((hit) => hit.rule === 'eager-required-query-error'),
  );
});
test('TanStack pending status guards contribute required queries to eager error coverage', () => {
  const source =
    "function page(a, b) { if (a.status === 'error') return {status: 'error'}; if (a.status === 'pending' || b.status === 'pending') return {status: 'loading'}; return {status: 'ready'}; }";
  assert.ok(
    scanSource(source).some(
      (hit) => hit.rule === 'eager-required-query-error' && hit.detail.startsWith('b '),
    ),
  );
});
test('empty must precede an explicit ready JSX branch', () => {
  const source =
    "function Page(page) { if(page.status === 'error') return <ErrorState/>; if(page.status === 'loading') return <LoadingState/>; if(page.status === 'ready') return <Content/>; if(page.status === 'empty') return <EmptyState/>; }";
  assert.ok(scanSource(source).some((hit) => hit.rule === 'empty-before-ready'));
  const broadReady =
    'function Page(q) { if(q.isError) return <ErrorState/>; if(q.isLoading) return <LoadingState/>; if(q.data) return <Content/>; if(q.data.length === 0) return <EmptyState/>; }';
  assert.ok(scanSource(broadReady).some((hit) => hit.rule === 'empty-before-ready'));
});
test('arbitrary error predicates need review instead of quietly passing eager coverage', () => {
  const source = fixture('eager-valid').replace(
    'heading.isError || details.isError',
    '(heading.isError || details.isError) && canShowError()',
  );
  assert.ok(
    scanSource(source).some((hit) => hit.rule === 'unverifiable-required-query-error'),
  );
});
test('an error guard returning ready is rejected instead of being mistaken for eager handling', () => {
  const source = fixture('eager-valid').replace(
    "return { status: 'error' }",
    "return { status: 'ready' }",
  );
  assert.ok(
    scanSource(source).some((hit) => hit.rule === 'state-guard-result-mismatch'),
  );
});
test('scanScope includes .ts composition hooks and feature-root editor routes', () => {
  const root = mkdtempSync(join(tmpdir(), 'p0-state-'));
  try {
    const dir = join(root, 'features/home/hooks');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'useHomePage.ts'), fixture('error-waits-for-peer'));
    writeFileSync(join(dir, 'useHomePage.test.ts'), fixture('loading-first'));
    const hits = scanScope(root);
    assert.equal(hits.length, 2);
    assert.ok(
      hits.every((hit) => hit.file === 'src/features/home/hooks/useHomePage.ts'),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
