import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkHeaderEqualWidths,
  checkHeaderNavigation,
  checkIndexPage,
  scanCss,
  scanSegments,
} from '../check-page-primitives.mjs';

test('feature CSS cannot redefine shared title typography or primitive dimensions', () => {
  const hits = scanCss(
    'src/features/quest/quest.module.css',
    `
    .page-header__title { font-size: 30px; }
    .segmented-track { height: 42px; padding: 4px; }
    .segmented-pill { padding-inline: 8px; }
    .page-toolbar__icon { height: 36px; }
    .unrelated { height: 36px; padding: 2px; }
  `,
  );
  assert.deepEqual(
    hits.map(({ rule, property }) => [rule, property]),
    [
      ['page-title-typography', 'font-size'],
      ['primitive-dimensions', 'height'],
      ['primitive-dimensions', 'padding'],
      ['primitive-dimensions', 'padding-inline'],
      ['primitive-dimensions', 'height'],
    ],
  );
});

test('non-feature title rules and primitive-owned styles remain valid', () => {
  assert.deepEqual(
    scanCss(
      'src/styles/primitives.css',
      '.segmented-track { height: 40px; padding: 4px; }',
    ),
    [],
  );
  assert.deepEqual(
    scanCss('src/styles/shell.css', '.page-header__title { font-size: 36px; }'),
    [],
  );
});

test('feature selectors remain protected through global, pseudo, and contextual selectors', () => {
  const hits = scanCss(
    'src/features/x/a.module.css',
    `
    :global(.page-header__title) { font-size: 12px; }
    .outer :global(.page-header__title) { line-height: 1; }
    :is(.page-header__title, .other) { font-family: serif; }
    .outer .page-header__title { font-size: 12px; }
    :global(.segmented-track) { height: 42px; padding: 4px; }
    .outer :is(.segmented-pill) { padding-inline: 8px; }
    .outer .page-toolbar__icon:hover { height: 36px; }
  `,
  );
  assert.deepEqual(
    hits.map(({ rule, property }) => [rule, property]),
    [
      ['page-title-typography', 'font-size'],
      ['page-title-typography', 'line-height'],
      ['page-title-typography', 'font-family'],
      ['page-title-typography', 'font-size'],
      ['primitive-dimensions', 'height'],
      ['primitive-dimensions', 'padding'],
      ['primitive-dimensions', 'padding-inline'],
      ['primitive-dimensions', 'height'],
    ],
  );
});

test('index page source must render the shared toolbar segmented surface', () => {
  assert.deepEqual(
    checkIndexPage('index.tsx', '<PageToolbar><PageToolbar.Segments /></PageToolbar>'),
    [],
  );
  assert.equal(checkIndexPage('index.tsx', '<FilterBar />').length, 2);
  assert.equal(
    checkIndexPage(
      'index.tsx',
      '{/* <PageToolbar><PageToolbar.Segments /></PageToolbar> */}<FilterBar />',
    ).length,
    2,
  );
});

test('header source keeps the shared top segmented navigation mounted in SiteChrome', () => {
  assert.deepEqual(
    checkHeaderNavigation(`
    function DestinationLinks() { return <SegmentedNav siteLinksPlacement="top" className="site-chrome__links" />; }
    export function SiteChrome() { return <header><DestinationLinks /></header>; }
  `),
    [],
  );
  assert.equal(checkHeaderNavigation('<header><nav>Links</nav></header>').length, 3);
});

test('header links participate in the shared equal-column segment grid', () => {
  assert.deepEqual(
    checkHeaderEqualWidths(
      '.segmented-track :is(.segmented-row, .segmented-options) { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; }',
    ),
    [],
  );
  assert.equal(
    checkHeaderEqualWidths(
      '.segmented-track:not([data-site-links]) :is(.segmented-row, .segmented-options) { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; }',
    ).length,
    1,
  );
  assert.equal(
    checkHeaderEqualWidths(
      '.segmented-track :is(.segmented-row, .segmented-options) { display: flex; }',
    ).length,
    1,
  );
});

test('toolbar checks ignore comments and strings that only mention shared components', () => {
  assert.equal(
    checkIndexPage(
      'page.tsx',
      `
    const example = '<PageToolbar><PageToolbar.Segments /></PageToolbar>';
    // <PageToolbar><PageToolbar.Segments /></PageToolbar>
    export const Page = () => <FilterBar />;
  `,
    ).length,
    2,
  );
});

test('Community and Map toolbars can compose shared panels and navigation', () => {
  for (const segment of ['Tabs', 'SegmentedNav', 'SegmentedControl']) {
    assert.deepEqual(
      checkIndexPage('page.tsx', `<PageToolbar segments={<${segment} />} />`, false),
      [],
    );
  }
  assert.equal(
    checkIndexPage('CommunityPage.tsx', '<Tabs items={tabs} />', false).length,
    1,
  );
  assert.equal(
    checkIndexPage('MapDirectory.tsx', '<SegmentedControl options={filters} />', false)
      .length,
    1,
  );
  assert.equal(checkIndexPage('CommunityPage.tsx', '<PageToolbar />', false).length, 1);
});

test('numeric badges fail for each shared segmented item API', () => {
  for (const [tag, prop] of [
    ['PageToolbar.Segments', 'options'],
    ['SegmentedControl', 'options'],
    ['SegmentedControl', 'moreOptions'],
    ['SegmentedNav', 'items'],
    ['Tabs', 'items'],
    ['Tabs.Nav', 'items'],
    ['TabNav', 'items'],
  ]) {
    const failures = scanSegments(
      'page.tsx',
      `<${tag} ${prop}={[{ value: 'lore', label: <>Lore <span>12</span></> }]} />`,
    );
    assert.equal(failures.length, 1, `${tag}.${prop} must reject a numeric badge`);
    assert.match(failures[0], /count badges/);
  }
});

test('referenced options, spreads and mapped item counts fail', () => {
  const failures = scanSegments(
    'MapDirectory.tsx',
    `
    const filters = [
      { value: '', label: <>All maps <span>{directory.maps.length}</span></> },
      ...regions.map((region) => ({
        value: region.id,
        label: <>{region.name} <span>{directory.maps.filter((map) => map.regionId === region.id).length}</span></>,
      })),
    ];
    export const Page = () => <PageToolbar segments={<SegmentedControl options={filters} />} count={directory.maps.length} />;
  `,
  );
  assert.equal(failures.length, 1);
  assert.match(failures[0], /count badges/);
});

test('label functions, aliased JSX, shorthand labels and aliased count expressions fail', () => {
  for (const source of [
    `function categoryLabel(option) { return <>{option.label} <span>{option.count}</span></>; }
     const choices = categories.map((category) => ({ value: category.name, label: categoryLabel(category) }));
     const Page = () => <PageToolbar.Segments options={choices} />;`,
    `const amount = entries.length;
     const original = <>Lore <span>{amount}</span></>;
     const label = original;
     const choices = [{ value: 'lore', label }];
     const Page = () => <SegmentedControl options={choices} />;`,
    'const totalEntries = entries.length; const choices = [{ value: "all", label: `All (${totalEntries})` }]; const Page = () => <Tabs items={choices} />;',
  ]) {
    assert.equal(scanSegments('page.tsx', source).length, 1);
  }
});

test('label scope resolves the nearest binding', () => {
  assert.deepEqual(
    scanSegments(
      'page.tsx',
      `
    const label = <span>12</span>;
    function Page() {
      const label = 'Lore';
      return <PageToolbar.Segments options={[{ value: 'lore', label }]} />;
    }
  `,
    ),
    [],
  );
});

test('toolbar result counts, panel contents and unrelated badges remain valid', () => {
  assert.deepEqual(
    scanSegments(
      'page.tsx',
      `
    const choices = [{ value: 'lore', label: 'Lore', count: 12 }];
    const account = 'Account';
    const category = { name: 'Lore', count: 12 };
    const panels = [{ id: 'characters', label: 'Characters', panel: <span>{characters.length}</span> }];
    const Page = () => <>
      <PageToolbar count={entries.length} segments={<PageToolbar.Segments options={choices} />} />
      <Tabs items={panels} />
      <SegmentedControl options={[{ value: 'account', label: account }, { value: 'lore', label: category.name }]} />
      <span className="badge">12</span>
      <SiteNav items={links} />
      <FilterBar count={12}><FilterBar.Picker options={choices} /></FilterBar>
      <div className="le-toolbar" role="toolbar" aria-label="Text formatting"><button>Bold</button></div>
    </>;
  `,
    ),
    [],
  );
});

test('custom page toolbar wrappers fail while shared PageToolbar passes', () => {
  for (const source of [
    '<section className="page-toolbar"><SegmentedControl options={options} /></section>',
    '<div role="toolbar"><SegmentedNav items={items} /></div>',
    '<div className={styles.toolbar}><Tabs items={items} /></div>',
    '<div className={styles.pageToolbar}><SegmentedControl options={options} /></div>',
    '<div role="toolbar"><button>Refresh</button></div>',
  ]) {
    assert.match(scanSegments('page.tsx', source)[0], /shared PageToolbar/);
  }
  assert.deepEqual(
    scanSegments(
      'page.tsx',
      '<PageToolbar segments={<SegmentedControl options={options} />} />',
    ),
    [],
  );
  assert.deepEqual(
    scanSegments(
      'page.tsx',
      '<div className={styles.toolbar}><PageToolbar segments={<SegmentedControl options={options} />} /></div>',
    ),
    [],
  );
});
