/**
 * v03 fidelity scaffold — production chrome spot-checks.
 * Expand with seedqa screenshots when live walkthrough runs.
 */
import { expect, test } from '@playwright/test';

test.describe('v03 fidelity', () => {
  test('home exposes brand and main landmark', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#main')).toBeVisible();
    await expect(page.locator('[data-site-chrome]')).toBeVisible();
  });

  test('quests board route renders', async ({ page }) => {
    await page.goto('/quests');
    await expect(page.locator('#main')).toBeVisible();
  });

  test('gallery route renders entry sections', async ({ page }) => {
    await page.goto('/gallery');
    await expect(page.getByRole('heading', { name: /Gallery/i })).toBeVisible();
  });
});
