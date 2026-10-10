import { expect, test } from '@playwright/test';

const LIVE_LINKS = ['Home', 'Quests', 'Chronicles', 'Codex', 'Rules', 'Community'];

test('phone home uses bottom-bar and home regions', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-app-root]')).toHaveAttribute(
    'data-nav-pattern',
    'bottom-bar',
  );
  await expect(page.locator('[data-shell-nav]')).toBeHidden();
  const links = page.locator('[data-site-links]');
  await expect(links).toHaveAttribute('data-site-links-placement', 'bottom');
  await expect(links.locator('[data-nav-item]')).toHaveCount(6);
  for (const name of LIVE_LINKS) {
    await expect(links.getByRole('link', { name })).toBeVisible();
  }
  await expect(links.getByRole('link', { name: 'Search the chronicle' })).toHaveCount(0);
  await expect(links.getByRole('link', { name: 'Log in' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Search the chronicle' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
  await expect(page.locator('[data-page="home"]')).toBeVisible();
  await expect(page.locator('[data-page-region="heading"]')).toBeVisible();
  await expect(page.locator('[data-page-region="lane-recruiting"]')).toBeVisible();
});
