import { test, expect } from '@playwright/test';

test.describe('locked screens', () => {
  test('notifications redirects unauthenticated users toward login', async ({
    page,
  }) => {
    await page.goto('/notifications');
    await expect(page).toHaveURL(/login|welcome|notifications/);
  });

  test('quest new editor is behind auth gate', async ({ page }) => {
    await page.goto('/quests/new');
    await expect(page).toHaveURL(/login|welcome|quests\/new/);
  });
});
