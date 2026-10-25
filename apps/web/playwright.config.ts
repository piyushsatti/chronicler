import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      name: 'production preview',
      // CI's earlier typecheck step already ran tsc, so skip it in the build.
      command: `${process.env.CI ? 'bun run vite build' : 'bun run build'} && bun run preview -- --host 127.0.0.1 --port 4173`,
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { ...process.env, VITE_API_MODE: 'mock' },
    },
    {
      name: 'development server',
      command: 'bun run dev -- --host 127.0.0.1 --port 4174',
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { ...process.env, VITE_API_MODE: 'mock' },
    },
  ],
  projects: [
    {
      name: 'phone-chromium',
      testIgnore: '**/desktop/**',
      grepInvert: /@dev/,
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'desktop-chromium',
      testMatch: '**/desktop/**/*.spec.ts',
      grepInvert: /@dev/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: 'dev-chromium',
      testMatch: [
        '**/component-contracts.spec.ts',
        '**/editor-smoke.spec.ts',
        '**/v03-fidelity/fidelity.spec.ts',
      ],
      grep: /@dev/,
      use: {
        ...devices['Pixel 5'],
        baseURL: 'http://127.0.0.1:4174',
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
