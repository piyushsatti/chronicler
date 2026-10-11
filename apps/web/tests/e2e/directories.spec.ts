import { test, expect } from '@playwright/test';

test.describe('directories', () => {
  test('quests board loads', async ({ page }) => {
    await page.goto('/quests');
    await expect(page.locator('[data-site-chrome]')).toBeVisible();
  });

  test('characters directory loads', async ({ page }) => {
    await page.goto('/characters');
    await expect(page.locator('[data-site-chrome]')).toBeVisible();
  });

  test('codex directory loads', async ({ page }) => {
    await page.goto('/codex');
    await expect(page.locator('[data-site-chrome]')).toBeVisible();
  });
});
