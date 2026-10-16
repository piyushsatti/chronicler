import { expect, test } from '@playwright/test';
import { installGallerySession } from './support/scenarios.js';

test.use({ serviceWorkers: 'block' });

test.describe('component contracts', () => {
  test('gallery mounts modal demo', async ({ page }) => {
    const assertRequests = await installGallerySession(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/gallery');
    await expect(page.getByRole('heading', { name: 'Gallery', exact: true })).toBeVisible();
    await page.locator('#gallery-modal').getByRole('button', { name: 'Open modal' }).click();
    const dialog = page.getByRole('dialog', { name: 'Gallery modal' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    assertRequests();
  });

  test('toast demo dispatches live toast', async ({ page }) => {
    const assertRequests = await installGallerySession(page);
    await page.goto('/gallery');
    await expect(page.getByRole('heading', { name: 'Gallery', exact: true })).toBeVisible();
    await page.locator('#gallery-toast').getByRole('button', { name: 'Success', exact: true }).click();
    await expect(page.getByText('Success toast', { exact: true })).toBeVisible();
    assertRequests();
  });

  for (const role of ['anonymous', 'player', 'forged-admin'] as const) {
    test(`gallery denies ${role}`, async ({ page }) => {
      const assertRequests = await installGallerySession(page, role);
      await page.goto('/gallery');
      await expect(page).toHaveURL(role === 'anonymous' ? /\/login$/ : /\/$/);
      await expect(page.getByRole('heading', { name: 'Gallery', exact: true })).toHaveCount(0);
      assertRequests();
    });
  }
});
