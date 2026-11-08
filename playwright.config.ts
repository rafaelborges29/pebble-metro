import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // Hosted 1/2/4-worker measurements are recorded in docs/e2e.md.
  workers: process.env.CI ? 4 : 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  updateSnapshots: 'none',
  snapshotPathTemplate: '{testDir}/screenshots/{arg}{ext}',
  reporter: [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }]],
  projects: [{ name: 'emery' }, { name: 'gabbro' }],
  use: { browserName: 'chromium', headless: true, trace: 'retain-on-failure' },
});
