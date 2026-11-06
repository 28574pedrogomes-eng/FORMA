import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: { baseURL: process.env.TEST_BASE_URL || 'http://127.0.0.1:8091', browserName: 'chromium', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  reporter: 'list',
});
