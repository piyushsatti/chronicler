import { expect, test } from '@playwright/test';
import { installGallerySession } from '../support/scenarios.js';

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

  test.describe('authenticated gallery', () => {
    test.use({ serviceWorkers: 'block' });
  test('gallery route renders entry sections', async ({ page }) => {
    const assertRequests = await installGallerySession(page);
    await page.goto('/gallery');
    await expect(page.getByRole('heading', { name: 'Gallery', exact: true })).toBeVisible();
    await expect(page.locator('#gallery-modal')).toBeVisible();
    assertRequests();
  });
  });
});
