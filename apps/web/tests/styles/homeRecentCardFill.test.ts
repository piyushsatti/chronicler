import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// M4-07: the "Recently happened" card is one link. It must stretch to fill its
// grid cell, or the empty strip under a short card is not clickable.
describe('home recent chronicle cards', () => {
  it('stretches a link card to the full height of its grid cell', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/features/home/pages/home.module.css'),
      'utf8',
    );
    const rule = css.match(/\.cardItem > article,\s*\.cardItem > a,\s*\.cardItem > button\s*\{([^}]*)\}/);
    expect(rule?.[1]).toMatch(/flex:\s*1/);
  });

  // Phase 7: the Sched tile is a button card; it stretches too so the tiles in
  // a row share one height and their bottom row lines up.
  it('stretches a button card (Sched tile) and pins its bottom row', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/features/home/pages/home.module.css'),
      'utf8',
    );
    const pin = css.match(/\.root \[data-el='schedCard\.bottomRow'\]\s*\{([^}]*)\}/);
    expect(pin?.[1]).toMatch(/margin-block-start:\s*auto/);
  });
});
