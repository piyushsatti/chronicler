import { expect, test } from '@playwright/test';

const DESTINATIONS = ['Home', 'Quests', 'Chronicles', 'Codex', 'Rules', 'Community'];

for (const width of [390, 900, 1920]) {
  test(`primary navigation remains painted and keyboard reachable at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/codex');
    const navigation = page.getByRole('navigation', { name: 'Primary', exact: true });
    await expect(navigation).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Codex', exact: true }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(navigation).toBeInViewport({ ratio: 1 });
    await page.screenshot({
      path: testInfo.outputPath(`primary-nav-initial-${width}.png`),
    });
    if (width === 390) {
      await page.evaluate(() =>
        window.scrollTo(0, document.documentElement.scrollHeight),
      );
      await expect(navigation).toBeInViewport({ ratio: 1 });
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    const first = navigation.getByRole('link', { name: DESTINATIONS[0], exact: true });
    await first.focus();
    const measurements = [];
    for (const name of DESTINATIONS) {
      const link = navigation.getByRole('link', { name, exact: true });
      await expect(link).toBeFocused();
      const measure = () =>
        link.evaluate((element) => {
          const nav = element.closest('nav');
          if (!nav) throw new Error('Navigation container missing');
          const range = document.createRange();
          range.selectNodeContents(element);
          const text = range.getBoundingClientRect();
          const target = element.getBoundingClientRect();
          const clip = nav.getBoundingClientRect();
          const left = Math.max(target.left, clip.left, 0);
          const right = Math.min(
            target.right,
            clip.right,
            document.documentElement.clientWidth,
          );
          const top = Math.max(target.top, clip.top, 0);
          const bottom = Math.min(target.bottom, clip.bottom, window.innerHeight);
          return {
            text: {
              left: text.left,
              right: text.right,
              top: text.top,
              bottom: text.bottom,
            },
            target: {
              left: target.left,
              right: target.right,
              top: target.top,
              bottom: target.bottom,
            },
            clip: {
              left: clip.left,
              right: clip.right,
              top: clip.top,
              bottom: clip.bottom,
            },
            scrollLeft: nav.scrollLeft,
            scrollWidth: nav.scrollWidth,
            clientWidth: nav.clientWidth,
            shrink: getComputedStyle(element).flexShrink,
            flex: getComputedStyle(element).flex,
            width: getComputedStyle(element).width,
            minWidth: getComputedStyle(element).minWidth,
            maxWidth: getComputedStyle(element).maxWidth,
            svgWidth: element.querySelector('svg')?.getBoundingClientRect().width,
            labelFits:
              text.left >= left - 0.5 &&
              text.right <= right + 0.5 &&
              text.top >= top - 0.5 &&
              text.bottom <= bottom + 0.5,
            paintedTarget:
              document
                .elementFromPoint(
                  (text.left + text.right) / 2,
                  (text.top + text.bottom) / 2,
                )
                ?.closest('a') === element,
          };
        });
      await testInfo.attach(`navigation-measurement-${width}-${name}`, {
        body: JSON.stringify(await measure(), null, 2),
        contentType: 'application/json',
      });
      await expect
        .poll(measure, { message: `${name} remains painted after keyboard scrolling` })
        .toMatchObject({ labelFits: true, paintedTarget: true });
      measurements.push({ name, ...(await measure()) });
      if (name !== DESTINATIONS.at(-1)) await page.keyboard.press('ArrowRight');
    }
    await testInfo.attach(`navigation-measurements-${width}`, {
      body: JSON.stringify(measurements, null, 2),
      contentType: 'application/json',
    });
    await page.screenshot({ path: testInfo.outputPath(`primary-nav-${width}.png`) });
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/community$/);
    await expect(
      page
        .getByRole('navigation', { name: 'Primary', exact: true })
        .getByRole('link', { name: 'Community', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
  });
}
