import { test, expect } from '@playwright/test';

test.describe('editor smoke @dev', () => {
  test('editor demo mounts workspace shell', async ({ page }) => {
    await page.goto('/editor-demo');
    await expect(page.locator('[data-layout="editor-workspace"]')).toBeVisible();
    await expect(page.locator('[data-component="EditorShell"]')).toBeVisible();
    await expect(page.locator('[data-component="LiveEditor"]')).toBeVisible();
  });
});

test('production does not serve the developer editor demo @prod', async ({ page }) => {
  await page.goto('/editor-demo');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.locator('[data-layout="editor-workspace"]')).toHaveCount(0);
});
