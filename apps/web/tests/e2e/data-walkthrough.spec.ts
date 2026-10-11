/**
 * Port of legacy data-walkthrough.spec.ts.
 * Paths come from docs/parity/qa-route-registry.json — never hardcode Q-201.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const registryPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../docs/parity/qa-route-registry.json',
);

type RegistryRoute = {
  label: string;
  path: string;
  expectText?: string;
  note?: string;
};

const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as {
  routes: RegistryRoute[];
};

test.describe('data walkthrough', () => {
  test('registry lists walkthrough routes from qa.jsonl', () => {
    expect(registry.routes.length).toBeGreaterThan(0);
  });

  test('home chrome + banner region mount', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-site-chrome]')).toBeVisible();
  });

  for (const route of registry.routes.slice(0, 8)) {
    test(`walk ${route.label} (${route.path})`, async ({ page }) => {
      const response = await page.goto(route.path);
      expect(response?.ok() || response?.status() === 304).toBeTruthy();
      await expect(page.locator('[data-site-chrome], [data-layout="editor-workspace"]')).toBeVisible({
        timeout: 15_000,
      });
      if (route.expectText) {
        await expect(page.getByText(route.expectText, { exact: false }).first()).toBeVisible({
          timeout: 15_000,
        });
      }
    });
  }
});
