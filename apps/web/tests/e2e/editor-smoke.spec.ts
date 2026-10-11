import { test, expect } from '@playwright/test';

test.describe('editor smoke', () => {
  test('editor demo mounts workspace shell', async ({ page }) => {
    await page.goto('/editor-demo');
    await expect(page.locator('[data-layout="editor-workspace"]')).toBeVisible();
    await expect(page.locator('[data-component="EditorShell"]')).toBeVisible();
    await expect(page.locator('[data-component="LiveEditor"]')).toBeVisible();
  });
});
