import { expect, test } from '@playwright/test';
import { installGallerySession } from './support/scenarios.js';

test.use({ serviceWorkers: 'block' });

test.describe('component contracts @dev', () => {
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
    expect(assertRequests()).toContain('CurrentAdminAccess');
  });

  test('toast demo dispatches live toast', async ({ page }) => {
    const assertRequests = await installGallerySession(page);
    await page.goto('/gallery');
    await expect(page.getByRole('heading', { name: 'Gallery', exact: true })).toBeVisible();
    await page.locator('#gallery-toast').getByRole('button', { name: 'Success', exact: true }).click();
    const host = page.locator('[data-el="toast.host"]');
    await expect(host).toHaveCount(1);
    await expect(
      host.getByRole('status').getByText('Success toast', { exact: true }),
    ).toBeVisible();
    expect(assertRequests()).toContain('CurrentAdminAccess');
  });

  for (const role of ['anonymous', 'player', 'forged-admin'] as const) {
    test(`gallery denies ${role}`, async ({ page }) => {
      const assertRequests = await installGallerySession(page, role);
      await page.goto('/gallery');
      if (role === 'anonymous') {
        await expect(page).toHaveURL(/\/login$/);
        await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
      } else {
        await expect(page).toHaveURL(/\/gallery$/);
        await expect(page.getByRole('alert')).toHaveAttribute('data-state', 'denied');
        await expect(page.getByText('The gallery is for staff.', { exact: true })).toBeVisible();
      }
      await expect(page.getByRole('heading', { name: 'Gallery', exact: true })).toHaveCount(0);
      await expect(page.locator('[data-el^="gallery.demo."]')).toHaveCount(0);
      if (role === 'anonymous')
        expect(assertRequests()).not.toContain('CurrentAdminAccess');
      else expect(assertRequests()).toContain('CurrentAdminAccess');
    });
  }
});

test('production does not serve the developer gallery @prod', async ({ page }) => {
  await page.goto('/gallery');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.locator('[data-el^="gallery.demo."]')).toHaveCount(0);
});
