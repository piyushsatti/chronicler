import { expect, test } from '@playwright/test';

test('desktop project uses a 1920 by 1080 viewport and loads the mocked home page', async ({
  page,
}) => {
  await page.goto('/');

  expect(page.viewportSize()).toEqual({ width: 1920, height: 1080 });
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: /Good (morning|afternoon|evening|night), Mortal\./,
    }),
  ).toBeVisible();
  await expect(page.getByText('Siege of Kraghold').first()).toBeVisible();
});
