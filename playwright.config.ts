import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import { loadTarget, isTodo } from './test-config/load';

dotenv.config({ path: '.env.test' });
const target = loadTarget();
const baseURL = isTodo(target.baseUrl) ? undefined : target.baseUrl;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: 1, // one retry for timing only; a pass-on-retry is reported FLAKY
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'reports/playwright-results.json' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    serviceWorkers: 'block', // avoid stale-build caching (B-STALE)
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'], testMatch: /generated\/.*\.spec\.ts/ },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, dependencies: ['setup'], testMatch: /generated\/.*\.spec\.ts/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, dependencies: ['setup'], testMatch: /generated\/.*\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['iPhone 15'] }, dependencies: ['setup'], testMatch: /generated\/.*\.spec\.ts/ },
  ],
});
