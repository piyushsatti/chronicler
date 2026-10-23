import assert from 'node:assert/strict';
import test from 'node:test';
import { checkStacking, runChecks } from '../check-stacking.mjs';
import { GATES } from '../run-all.mjs';

const files = [
  { file: 'src/styles/base.css', source: '.site-chrome__top { position: sticky; z-index: 35; } .nav-drawer-panel { z-index: 41; }' },
  { file: 'src/styles/primitives.css', source: '.segmented-track, .pr-avatar-group { isolation: isolate; } .pr-modal__dialog { z-index: 50; } .pr-toast__stack { z-index: 100; } .pop-positioner { z-index: 60; }' },
  { file: 'src/components/domain/questCard.module.css', source: '.boardCard { isolation: isolate; } .boardCardFooter { z-index: 2; }' },
  { file: 'src/features/home/pages/home.module.css', source: '.banner { isolation: isolate; } .bannerContent { z-index: 2; }' },
  { file: 'src/features/map/pages/map.module.css', source: '.explorer { isolation: isolate; } @container (max-width: 47.5rem) { .details { position: fixed; z-index: 30; } }' },
  { file: 'src/styles/editor.css', source: '.hf2 .le-widget { isolation: isolate; } .hf2 .le-toolbar { position: sticky; z-index: 15; } .hf2 .le-ac { z-index: 60; }' },
];

test('header covers map, editor and banner content while established overlays remain above it', () => {
  assert.deepEqual(checkStacking(files), []);
});

test('original header tie and higher map content fail', () => {
  const broken = files.map((file) => file.file === 'src/styles/base.css'
    ? { ...file, source: file.source.replace('35', '2') } : file);
  const failures = checkStacking(broken);
  assert.ok(failures.some((failure) => failure.includes('.bannerContent z-index 2 can cover site header 2')));
  assert.ok(failures.some((failure) => failure.includes('.details z-index 30 can cover site header 2')));
});

test('new page content cannot reuse an overlay class or introduce an unchecked z-index', () => {
  const failures = checkStacking([...files, { file: 'src/features/new/page.css', source: '.hero, .pr-modal__dialog { z-index: 50; } .toolbar { z-index: var(--unknown); }' }]);
  assert.ok(failures.some((failure) => failure.includes('.hero z-index 50 can cover')));
  assert.ok(failures.some((failure) => failure.includes('.pr-modal__dialog z-index 50 can cover')));
  assert.ok(failures.some((failure) => failure.includes('literal z-index')));
});

test('content owners must isolate their layers without trapping overlays in the page, main or editor Card', () => {
  const broken = files.map((file) => file.file.includes('/home/')
    ? { ...file, source: '.banner { isolation: auto; }' } : file);
  const failures = checkStacking([...broken, { file: 'src/styles/test.css', source: '#main { isolation: isolate; } .site-chrome__main { z-index: 0; } .card { isolation: isolate; }' }]);
  assert.ok(failures.some((failure) => failure.includes('.banner must isolate')));
  assert.equal(failures.filter((failure) => failure.includes('must not trap')).length, 3);
});

test('header stays below overlays and overlay levels cannot fall below 40', () => {
  const broken = files.map((file) => file.file === 'src/styles/base.css'
    ? { ...file, source: '.site-chrome__top { z-index: 40; } .nav-drawer-panel { z-index: 30; }' } : file);
  assert.ok(checkStacking(broken).some((failure) => failure.includes('below the overlay floor')));
  assert.ok(checkStacking(broken).some((failure) => failure.includes('overlay layer (40+)')));
});

test('repository stacking contract is enforced by the required design gates', () => {
  assert.ok(GATES.some(([, script]) => script === 'check-stacking.mjs'));
  assert.deepEqual(runChecks(), []);
});
