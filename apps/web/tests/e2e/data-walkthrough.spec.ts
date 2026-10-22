import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';
import { installQaWalkthrough } from './support/scenarios.js';

test.use({ serviceWorkers: 'block' });

const registryPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../docs/parity/qa-route-registry.json',
);

const registry = z
  .object({
    routes: z.array(
      z.object({
        label: z.string(),
        path: z.string(),
        expectText: z.string().optional(),
      }),
    ),
  })
  .parse(JSON.parse(readFileSync(registryPath, 'utf8')));

const boardExpectation = registry.routes.find(
  (route) => route.path === '/quests',
)?.expectText;
if (!boardExpectation) throw new Error('Quest board registry expectation is required');

test.describe('data walkthrough', () => {
  test('registry lists walkthrough routes from qa.jsonl', () => {
    expect(registry.routes.length).toBeGreaterThan(0);
  });

  test('home chrome + banner region mount', async ({ page }) => {
    const assertRequests = await installQaWalkthrough(page);
    await page.goto('/');
    await expect(page.locator('[data-site-chrome]')).toBeVisible();
    await expect(page.getByTestId('home-featured-banner')).toContainText(
      'Season opener',
    );
    assertRequests();
  });

  for (const route of registry.routes.slice(0, 8)) {
    test(`walk ${route.label} (${route.path})`, async ({ page }) => {
      const assertRequests = await installQaWalkthrough(page);
      const response = await page.goto(route.path);
      expect(response?.ok() || response?.status() === 304).toBeTruthy();
      await expect(
        page.locator('[data-site-chrome], [data-layout="editor-workspace"]'),
      ).toBeVisible({
        timeout: 15_000,
      });
      await expect(page).toHaveURL(new RegExp(`${route.path}$`));
      if (route.path === '/') {
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: 'Welcome to Chronicler.',
          }),
        ).toBeVisible();
        const card = page.getByTestId('open-quest-card').filter({
          has: page.getByTestId('quest-title').filter({ hasText: boardExpectation }),
        });
        await expect(card.getByTestId('quest-title')).toContainText(boardExpectation);
        await card.getByRole('link', { name: new RegExp(boardExpectation) }).click();
        await expect(page).toHaveURL(/\/quests\/qa-the-salt-stair$/);
        await expect(
          page.getByRole('heading', { name: 'The Salt Stair', exact: true }),
        ).toBeVisible();
      } else if (route.path === '/quests') {
        const card = page.getByRole('article', { name: new RegExp(boardExpectation) });
        await expect(
          card.getByRole('heading', { name: new RegExp(boardExpectation) }),
        ).toBeVisible();
        await card
          .getByRole('button', { name: new RegExp(`Open .*${boardExpectation}`) })
          .click();
        await expect(page).toHaveURL(/\/quests\/qa-the-salt-stair$/);
        await expect(
          page.getByRole('heading', { name: 'The Salt Stair', exact: true }),
        ).toBeVisible();
      } else {
        expect(route.expectText, 'detail routes need an entity assertion').toBeTruthy();
        await expect(
          page.getByRole('heading', { name: route.expectText, exact: true }),
        ).toBeVisible();
        await expect(
          page.getByText(route.path.split('/').at(-1) ?? '', { exact: true }).first(),
        ).toBeVisible();
      }
      assertRequests();
    });
  }
});
