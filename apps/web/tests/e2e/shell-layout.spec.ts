import { test, expect } from '@playwright/test';

test.describe('shell layout', () => {
  test('site chrome and main landmark on home', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-site-chrome]')).toBeVisible();
    await expect(page.locator('#main')).toBeVisible();
  });

  test('skip link targets main', async ({ page }) => {
    await page.goto('/');
    const skip = page.locator('a[href="#main"]');
    await expect(skip).toHaveCount(1);
  });
});
