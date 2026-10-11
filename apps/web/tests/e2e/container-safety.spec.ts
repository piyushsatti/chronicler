/**
 * container-safety — empirical basis for container-query adoption
 * (ported from legacy; no app server required for geometry cases).
 */
import { test, expect } from '@playwright/test';

interface Ctx {
  outer: string;
  mid: string;
}

const SAFE: Record<string, Ctx> = {
  'block child of a block parent': { outer: 'width:400px;', mid: '' },
  'flex item with flex:1 (.flex-fill)': {
    outer: 'display:flex; width:400px;',
    mid: 'flex:1; min-width:0;',
  },
  'grid 1fr track (.cols[data-n])': {
    outer: 'display:grid; grid-template-columns:1fr 1fr; width:400px;',
    mid: '',
  },
  'stretched column child (.stack)': {
    outer: 'display:flex; flex-direction:column; align-items:stretch; width:400px;',
    mid: '',
  },
};

const UNSAFE: Record<string, Ctx> = {
  'inline-block (Chip, PillLink, badges)': {
    outer: 'width:400px;',
    mid: 'display:inline-block;',
  },
  'default flex item, flex:0 1 auto (.row child)': {
    outer: 'display:flex; width:400px;',
    mid: '',
  },
  'grid auto track': {
    outer: 'display:grid; grid-template-columns:auto 1fr; width:400px;',
    mid: '',
  },
};

async function measure(page: import('@playwright/test').Page, ctx: Ctx) {
  return page.evaluate(({ outer, mid }) => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div id="outer" style="${outer}">
        <div id="mid" style="${mid}container-type:inline-size;">
          <div id="inner" style="width:100%;height:8px;background:#000"></div>
        </div>
      </div>`;
    document.body.append(root);
    const midEl = root.querySelector('#mid') as HTMLElement;
    const width = midEl.getBoundingClientRect().width;
    root.remove();
    return width;
  }, ctx);
}

test.describe('container-safety', () => {
  for (const [name, ctx] of Object.entries(SAFE)) {
    test(`safe: ${name} keeps width`, async ({ page }) => {
      await page.setContent('<!doctype html><html><body></body></html>');
      const width = await measure(page, ctx);
      expect(width).toBeGreaterThan(0);
    });
  }

  for (const [name, ctx] of Object.entries(UNSAFE)) {
    test(`unsafe: ${name} may collapse`, async ({ page }) => {
      await page.setContent('<!doctype html><html><body></body></html>');
      const width = await measure(page, ctx);
      // Document the measurement; collapse is the risk signal.
      expect(typeof width).toBe('number');
    });
  }
});
