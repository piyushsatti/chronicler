import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const styles = ['tokens', 'base', 'primitives'].map((name) =>
  readFileSync(new URL(`../../src/styles/${name}.css`, import.meta.url), 'utf8'),
).join('\n');
// Bun preserves React's JSX runtime when Playwright transforms imported TSX for component mounting.
const markup = execFileSync('bun', ['-e', `
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { SegmentedControl } from './src/components/primitives/SegmentedControl.tsx';
import { SegmentedNav } from './src/components/primitives/SegmentedNav.tsx';
import { Tabs } from './src/components/primitives/Tabs.tsx';
const labels = ['All', 'This week', 'Longer category name'];
const links = labels.map((label, index) => ({ to: '/section-' + index, label, current: index === 0 }));
process.stdout.write(renderToStaticMarkup(createElement(MemoryRouter, null,
  createElement(SegmentedControl, {
    'aria-label': 'Filters',
    options: labels.map((label) => ({ value: label, label })),
    moreOptions: [{ value: 'Other', label: 'Other' }],
    defaultValue: labels[0],
  }),
  createElement(SegmentedNav, { label: 'Sections', items: links }),
  createElement(Tabs, {
    'aria-label': 'Panels',
    items: labels.map((label) => ({ id: label, label, panel: label + ' content' })),
  }),
  createElement(SegmentedNav, { label: 'Primary', items: links, siteLinksPlacement: 'top' }),
)));
`], { cwd: new URL('../..', import.meta.url), encoding: 'utf8' });

for (const width of [1440, 390]) {
  test(`rendered segments share the widest intrinsic width at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.setContent(`<style>${styles}</style>${markup}`);
    const tracks = await page.locator('.segmented-track').evaluateAll((elements) =>
      elements.map((track) => {
        const segments = Array.from(track.querySelectorAll<HTMLElement>('.segmented-option'));
        const widths = segments.map((segment) => segment.getBoundingClientRect().width);
        const intrinsicWidths = segments.map((segment) => {
          const clone = segment.cloneNode(true);
          if (!(clone instanceof HTMLElement)) throw new Error('Segment must be an HTML element');
          clone.style.width = 'max-content';
          document.body.append(clone);
          const intrinsicWidth = clone.getBoundingClientRect().width;
          clone.remove();
          return intrinsicWidth;
        });
        const bounds = track.getBoundingClientRect();
        const first = segments[0].getBoundingClientRect();
        const pill = track.querySelector('.segmented-pill');
        if (!pill) throw new Error('Segmented tracks must render their highlight pill');
        return {
          header: track.hasAttribute('data-site-links'),
          widths,
          intrinsicWidths,
          height: bounds.height,
          pillHeight: Number.parseFloat(getComputedStyle(pill).height),
          inset: first.top - bounds.top,
          scrollWidth: track.scrollWidth,
          clientWidth: track.clientWidth,
        };
      }),
    );
    expect(tracks).toHaveLength(4);
    expect(tracks.map((track) => track.widths.length)).toEqual([4, 3, 3, 3]);
    for (const track of tracks) {
      expect(track.height).toBe(40);
      expect(track.pillHeight).toBe(32);
      expect(track.inset).toBe(4);
      expect(Math.max(...track.widths) - Math.min(...track.widths)).toBeLessThanOrEqual(0.5);
      for (const segmentWidth of track.widths) {
        expect(Math.abs(segmentWidth - Math.max(...track.intrinsicWidths))).toBeLessThanOrEqual(0.5);
      }
      if (width === 390) expect(track.scrollWidth).toBeGreaterThan(track.clientWidth);
    }
  });
}
