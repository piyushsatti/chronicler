import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const styles = ['tokens', 'base', 'motion', 'atlas', 'atlas-vendor/atlas-components', 'primitives']
  .map((name) => readFileSync(new URL(`../../src/styles/${name}.css`, import.meta.url), 'utf8'))
  .join('\n');

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  for (const scoped of [false, true]) {
    test(`quest action keeps contrast through theme changes, ${reducedMotion}, scoped=${scoped}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion });
      await page.setContent(`<style>${styles}</style><main class="${scoped ? 'hf2' : ''}"><a class="btn btn--secondary btn--sm" href="/quests">Find a quest</a></main>`);
      await page.evaluate(() => {
        document.documentElement.dataset.theme = 'parchment';
        document.documentElement.dataset.mode = 'light';
      });
      await page.waitForTimeout(200);
      const action = page.getByRole('link', { name: 'Find a quest' });
      for (const state of ['rest', 'hover', 'focus', 'active']) {
        await page.mouse.move(0, 0);
        await action.blur();
        if (state === 'hover' || state === 'active') await action.hover();
        if (state === 'focus') {
          await page.keyboard.press('Tab');
          await action.focus();
          expect(await action.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
        }
        if (state === 'active') await page.mouse.down();
        for (const mode of ['dark', 'light']) {
          const contrasts = await action.evaluate(async (element, nextMode) => {
            function luminance(color: string): number {
              const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
              if (!channels || channels.length !== 3) throw new Error(`Expected an opaque RGB color, got ${color}`);
              const linear = channels.map((channel) => {
                const value = channel / 255;
                return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
              });
              return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
            }
            document.documentElement.dataset.mode = nextMode;
            const samples: number[] = [];
            const started = performance.now();
            do {
              const style = getComputedStyle(element);
              const foreground = luminance(style.color);
              const background = luminance(style.backgroundColor);
              samples.push((Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05));
              await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            } while (performance.now() - started < 200);
            return samples;
          }, mode);
          expect(contrasts.length, `${state}, ${mode}`).toBeGreaterThan(1);
          expect(Math.min(...contrasts), `${state}, ${mode}`).toBeGreaterThanOrEqual(4.5);
        }
        if (state === 'active') await page.mouse.up();
      }
    });
  }
}
