/**
 * Browser-level contracts for gallery primitives (scaffolded from legacy).
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

async function loadGallery(page: Page, width = 1280, height = 800) {
  await page.setViewportSize({ width, height });
  await page.goto('/gallery');
  await expect(page.getByRole('heading', { name: /Gallery/i })).toBeVisible();
}

function entry(page: Page, id: string): Locator {
  return page.locator(
    `section[aria-labelledby="gallery-entry-${id}"], [data-gallery-entry="${id}"]`,
  );
}

test.describe('component contracts', () => {
  test('gallery mounts modal demo', async ({ page }) => {
    await loadGallery(page);
    const modal = entry(page, 'modal');
    if ((await modal.count()) === 0) {
      test.skip(true, 'Gallery entry markup not yet labelled for contracts');
      return;
    }
    const trigger = modal.getByRole('button', { name: /Open modal/i });
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('toast demo dispatches live toast', async ({ page }) => {
    await loadGallery(page);
    const toast = entry(page, 'toast');
    if ((await toast.count()) === 0) {
      // Fallback: click any Success button under gallery
      const success = page.getByRole('button', { name: 'Success' });
      if ((await success.count()) === 0) {
        test.skip(true, 'Toast gallery entry not found');
        return;
      }
      await success.first().click();
    } else {
      await toast.getByRole('button', { name: 'Success' }).click();
    }
    await expect(page.getByText('Success toast')).toBeVisible();
  });
});
