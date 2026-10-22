import { defineConfig } from '@playwright/test';
import path from 'node:path';
import process from 'node:process';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for coordinated live acceptance`);
  return value;
}
const origin = new URL(required('QA_WEB_ORIGIN'));
if (
  origin.protocol !== 'http:' ||
  !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)
)
  throw new Error('Live acceptance requires the authorized local frontend origin');
const output = path.resolve(import.meta.dirname, required('QA_EVIDENCE_DIR'));

export default defineConfig({
  testDir: './tests/live',
  testMatch: 'route-acceptance.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  outputDir: path.join(output, 'browser-results'),
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(output, 'playwright-report.json') }],
  ],
  metadata: {
    frontend: required('QA_FRONTEND_EPOCH'),
    api: required('QA_API_EPOCH'),
    scope:
      'Guest read-only route checks; independent acceptance review remains required',
  },
  use: {
    baseURL: origin.origin,
    headless: true,
    serviceWorkers: 'block',
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [390, 900, 1920].map((width) => ({
    name: `guest-chromium-${width}`,
    use: { browserName: 'chromium', viewport: { width, height: 1000 } },
  })),
});
