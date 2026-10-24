import { expect, test } from '@playwright/test';

const LIVE_LINKS = ['Home', 'Quests', 'Chronicles', 'Codex', 'Rules', 'Community'];

test('phone home uses only the scrollable header menu and home regions', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-app-root]')).toHaveAttribute(
    'data-nav-pattern',
    'bottom-bar',
  );
  await expect(page.locator('[data-shell-nav]')).toBeHidden();
  const links = page.locator('[data-site-links]');
  await expect(links).toHaveCount(1);
  await expect(links).toHaveAttribute('data-site-links-placement', 'top');
  await expect(page.getByRole('banner').locator('[data-site-links]')).toHaveCount(1);
  await expect(page.locator('.app-shell__bottomnav, .site-chrome__bottom')).toHaveCount(0);
  await expect(page.locator('[data-shell-main]')).toHaveCSS('padding-bottom', '0px');
  await expect(links.locator('[data-nav-item]')).toHaveCount(6);
  for (const name of LIVE_LINKS) {
    await expect(links.getByRole('link', { name })).toBeVisible();
  }
  await expect(links.getByRole('button', { name: 'Search the chronicle' })).toHaveCount(0);
  await expect(links.getByRole('link', { name: 'Log in' })).toHaveCount(0);
  const search = page.getByRole('button', { name: 'Search the chronicle' });
  await expect(search).toBeVisible();
  await search.click();
  const dialog = page.getByRole('dialog', { name: 'Search the chronicle' });
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole('textbox', { name: 'Search the chronicle' });
  await expect(input).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(search).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
  await expect(page.locator('[data-page="home"]')).toBeVisible();
  await expect(page.locator('[data-page-region="heading"]')).toBeVisible();
  await expect(page.locator('[data-page-region="lane-recruiting"]')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 390 });
  await expect(page.locator('[data-app-root]')).toHaveAttribute('data-height-class', 'compact');
  await expect(page.getByRole('button', { name: 'Menu', exact: true })).toHaveCount(0);
  await expect(links).toHaveAttribute('data-site-links-placement', 'top');
});

test('phone panel tabs stay on one row and reveal every touch or keyboard selection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/community');
  const list = page.getByRole('tablist', { name: 'Community sections' });
  const track = page.locator('.tabs__track');
  const names = ['Free this week', 'Members', 'Characters'];
  await expect(list).toBeVisible();
  await expect(list.getByRole('tab')).toHaveCount(names.length);
  await expect.poll(() => track.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const tabs = Array.from(element.querySelectorAll('[role="tab"]'), (tab) => tab.getBoundingClientRect());
    return {
      oneRow: tabs.every((tab) => Math.abs(tab.top - tabs[0].top) <= 1),
      verticallyVisible: tabs.every((tab) => tab.top >= bounds.top && tab.bottom <= bounds.bottom),
      horizontalOverflow: element.scrollWidth > element.clientWidth,
      verticalOverflow: element.scrollHeight > element.clientHeight,
    };
  })).toEqual({ oneRow: true, verticallyVisible: true, horizontalOverflow: true, verticalOverflow: false });
  await expect(track).toHaveClass(/can-scroll-right/);
  await expect(track).toHaveCSS('mask-image', /linear-gradient/);

  const bounds = await track.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) throw new Error('The Community tab track must be visible');
  const session = await page.context().newCDPSession(page);
  const x = Math.round(bounds.x + bounds.width / 2);
  const y = Math.round(bounds.y + bounds.height / 2);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 8; step += 1) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - step * 16, y }] });
    await page.waitForTimeout(30);
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
  await expect.poll(() => track.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await list.getByRole('tab', { name: 'Characters', exact: true }).tap();
  await expect(page.getByRole('tabpanel', { name: 'Characters', exact: true })).toBeVisible();
  await expect(track).toHaveClass(/can-scroll-left/);
  await expect(track).not.toHaveClass(/can-scroll-right/);

  for (const name of names) {
    await list.getByRole('tab', { name, exact: true }).tap();
    await expect(page.getByRole('tabpanel', { name, exact: true })).toBeVisible();
  }
  const first = list.getByRole('tab', { name: names[0], exact: true });
  await first.focus();
  for (const name of names) {
    const tab = list.getByRole('tab', { name, exact: true });
    await expect(tab).toBeFocused();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => tab.evaluate((element) => {
      const tabBounds = element.getBoundingClientRect();
      const trackBounds = element.closest('.segmented-track')?.getBoundingClientRect();
      return !!trackBounds && tabBounds.left >= trackBounds.left + 3 && tabBounds.right <= trackBounds.right - 3;
    })).toBe(true);
    await page.keyboard.press('ArrowRight');
  }
  await expect(first).toBeFocused();
  await expect(track).not.toHaveClass(/can-scroll-left/);
});
