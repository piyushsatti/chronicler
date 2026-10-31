import { expect, test, type Page, type TestInfo } from '@playwright/test';

const PREFS_KEY = 'chronicler-prefs';
const MOCK_CLOCK = new Date('2026-10-10T12:00:00.000Z');

const THEMES = [
  { theme: 'parchment', mode: 'light' },
  { theme: 'midnight', mode: 'dark' },
] as const;

type FoundationTheme = (typeof THEMES)[number];

async function seedFoundations(
  page: Page,
  { theme, mode }: FoundationTheme,
): Promise<void> {
  await page.clock.install({ time: MOCK_CLOCK });
  await page.addInitScript(
    ({ key, prefs }) => {
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, JSON.stringify(prefs));
      }
    },
    {
      key: PREFS_KEY,
      prefs: {
        mode,
        modeExplicit: true,
        theme,
        colorblindSafe: false,
        bgEffect: 'none',
      },
    },
  );
}

async function expectRenderedFont(
  page: Page,
  selector: string,
  family: 'Lexend Variable' | 'Fraunces Variable' | 'Lato' | 'Geist Mono',
): Promise<void> {
  const result = await page
    .locator(selector)
    .first()
    .evaluate(async (element) => {
      const style = getComputedStyle(element);
      const family = style.fontFamily
        .split(',')[0]
        ?.trim()
        .replaceAll('"', '')
        .replaceAll("'", '');
      const text = element.textContent?.trim() || 'Chronicler';
      const loadedFaces = await document.fonts.load(
        `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
        text,
      );
      return {
        computedFamily: family,
        loadedFamilies: loadedFaces
          .filter((face) => face.status === 'loaded')
          .map((face) => face.family.replaceAll('"', '').replaceAll("'", '')),
        faceStatuses: loadedFaces.map((face) => face.status),
      };
    });

  expect(result.computedFamily, `${selector} should use its intended face`).toBe(
    family,
  );
  expect(
    result.faceStatuses.length,
    `${family} should have a matching loaded @font-face`,
  ).toBeGreaterThan(0);
  expect(result.loadedFamilies).toContain(family);
}

for (const theme of THEMES) {
  test(`desktop foundations render ${theme.theme} ${theme.mode}`, async ({
    page,
  }, testInfo: TestInfo) => {
    await seedFoundations(page, theme);
    await page.goto('/');

    expect(page.viewportSize()).toEqual({ width: 1920, height: 1080 });
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Welcome to Chronicler.',
      }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Siege of Kraghold' })).toBeVisible();

    await expect(page.locator('[data-site-chrome]')).toHaveAttribute(
      'data-site-pattern',
      'inline-row',
    );
    const primaryNavigation = page.getByRole('navigation', { name: 'Primary' });
    await expect(primaryNavigation).toBeVisible();
    for (const destination of [
      'Home',
      'Quests',
      'Chronicles',
      'Codex',
      'Rules',
      'Community',
    ]) {
      await expect(
        primaryNavigation.getByRole('link', { name: destination }),
      ).toBeVisible();
    }
    await expect(
      page.getByRole('button', { name: 'Search the chronicle' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();

    const typography = await page.evaluate(() => {
      const title = document.querySelector('h1.type-display');
      const cardTitle = document.querySelector('.type-title');
      if (!title || !cardTitle)
        throw new Error('Expected rendered display and card title tiers');
      return {
        displaySize: Number.parseFloat(getComputedStyle(title).fontSize),
        cardTitleSize: Number.parseFloat(getComputedStyle(cardTitle).fontSize),
        bodyFamily: getComputedStyle(document.body).fontFamily,
        theme: document.documentElement.getAttribute('data-theme'),
        mode: document.documentElement.getAttribute('data-mode'),
        bodyBackground: getComputedStyle(document.body).backgroundColor,
      };
    });
    expect(typography.displaySize).toBeGreaterThan(typography.cardTitleSize);
    expect(typography.bodyFamily).toContain('Lato');
    expect(typography.theme).toBe(theme.theme);
    expect(typography.mode).toBe(theme.mode);
    expect(typography.bodyBackground).toMatch(/^rgb\(/);
    expect(typography.bodyBackground).not.toBe('rgba(0, 0, 0, 0)');

    await expectRenderedFont(page, 'h1.type-display', 'Lexend Variable');
    await expectRenderedFont(page, '.type-caption', 'Lato');
    await expectRenderedFont(page, '.site-chrome__search-kbd', 'Geist Mono');

    await page.screenshot({
      path: testInfo.outputPath(`desktop-foundations-${theme.theme}-${theme.mode}.png`),
      fullPage: false,
      animations: 'disabled',
    });
  });
}

test('parchment light and midnight dark paint distinct page backgrounds', async ({
  page,
}) => {
  await seedFoundations(page, THEMES[0]);
  await page.goto('/');
  const parchmentBackground = await page
    .locator('body')
    .evaluate((body) => getComputedStyle(body).backgroundColor);

  await page.evaluate(() => {
    localStorage.setItem(
      'chronicler-prefs',
      JSON.stringify({
        mode: 'dark',
        modeExplicit: true,
        theme: 'midnight',
        colorblindSafe: false,
        bgEffect: 'none',
      }),
    );
  });
  await page.reload();
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Welcome to Chronicler.',
    }),
  ).toBeVisible();
  const midnightBackground = await page
    .locator('body')
    .evaluate((body) => getComputedStyle(body).backgroundColor);

  expect(parchmentBackground).toMatch(/^rgb\(/);
  expect(midnightBackground).toMatch(/^rgb\(/);
  expect(midnightBackground).not.toBe(parchmentBackground);
});
