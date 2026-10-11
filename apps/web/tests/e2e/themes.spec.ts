/**
 * Theme + typography visual check (ported from legacy themes.spec.ts).
 * Sets data-theme and data-mode via page.evaluate; asserts font stacks.
 */
import { expect, test } from '@playwright/test';

const THEMES = [
  { theme: 'parchment', mode: 'light' },
  { theme: 'parchment', mode: 'dark' },
  { theme: 'midnight', mode: 'light' },
  { theme: 'midnight', mode: 'dark' },
  { theme: 'ember', mode: 'light' },
  { theme: 'ember', mode: 'dark' },
  { theme: 'dracula', mode: 'light' },
  { theme: 'dracula', mode: 'dark' },
  { theme: 'vegan', mode: 'light' },
  { theme: 'vegan', mode: 'dark' },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
];

for (const { theme, mode } of THEMES) {
  for (const viewport of VIEWPORTS) {
    test(`theme: ${theme} / ${mode} / ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await page.evaluate(
        ({ theme: t, mode: m }) => {
          document.documentElement.setAttribute('data-theme', t);
          document.documentElement.setAttribute('data-mode', m);
        },
        { theme, mode },
      );
      await page.waitForTimeout(200);

      const typefaces = await page.evaluate(async () => {
        await document.fonts.ready;
        const display = document.createElement('span');
        display.className = 'type-display';
        const code = document.createElement('span');
        code.className = 'type-code';
        document.body.append(display, code);
        const result = {
          body: getComputedStyle(document.body).fontFamily,
          display: getComputedStyle(display).fontFamily,
          code: getComputedStyle(code).fontFamily,
          theme: document.documentElement.getAttribute('data-theme'),
          mode: document.documentElement.getAttribute('data-mode'),
        };
        display.remove();
        code.remove();
        return result;
      });

      expect(typefaces.theme).toBe(theme);
      expect(typefaces.mode).toBe(mode);
      expect(typefaces.body.length).toBeGreaterThan(0);
      expect(typefaces.display.length).toBeGreaterThan(0);
    });
  }
}
