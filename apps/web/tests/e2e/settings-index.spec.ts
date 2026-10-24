import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const styles = ['tokens', 'base', 'typography', 'atlas', 'primitives'].map((name) =>
  readFileSync(new URL(`../../src/styles/${name}.css`, import.meta.url), 'utf8'),
).join('\n');
const settingsStyles = readFileSync(
  new URL('../../src/chrome/settingsForm.module.css', import.meta.url), 'utf8',
).replaceAll(":global([data-width-class='compact'])", "[data-width-class='compact']");

for (const mode of ['dark', 'light']) {
  test(`every Settings index destination is fully visible at 390px in ${mode} mode`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setContent(`<!doctype html><html data-theme="parchment" data-mode="${mode}">
      <head><style>${styles}\n${settingsStyles}</style></head><body>
      <div class="site-chrome" data-width-class="compact"><main class="page">
        <form class="form"><div class="layout"><aside class="rail">
          <nav class="index" aria-label="Settings sections">
            <div class="card indexCard" data-pad="5" data-tone="1">
              <p class="type-label">On this page</p>
              <a class="type-link" href="#settings-dates">Dates and times</a>
              <a class="type-link" href="#settings-accessibility">Accessibility</a>
              <a class="type-link" href="#settings-notifications">Notifications</a>
            </div>
          </nav>
        </aside></div></form>
      </main></div></body></html>`);
    const index = page.getByRole('navigation', { name: 'Settings sections' });
    const links = index.getByRole('link');
    await expect(links).toHaveCount(3);
    for (const link of await links.all()) {
      await expect(link).toBeInViewport({ ratio: 1 });
      const contained = await link.evaluate((element) => {
        const card = element.closest('.indexCard');
        if (!card) throw new Error('Settings index links must belong to the index card');
        const bounds = element.getBoundingClientRect();
        const parent = card.getBoundingClientRect();
        return bounds.left >= parent.left && bounds.right <= parent.right
          && bounds.top >= parent.top && bounds.bottom <= parent.bottom;
      });
      expect(contained).toBe(true);
    }
    expect(await index.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  });
}
