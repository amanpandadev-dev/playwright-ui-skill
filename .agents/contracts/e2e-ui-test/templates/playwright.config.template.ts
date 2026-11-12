import path from 'node:path';
__CONFIG_DIR_IMPORT__
import dotenv from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

__CONFIG_DIR_DECLARATION__
dotenv.config({ path: path.join(configDir, '.env.e2e'), override: false });

// Replace all __...__ sentinels from confirmed repository, module-format, and environment evidence.
const confirmedTarget = '__APPLICATION_TARGET__';
const target = process.env.E2E_TARGET?.trim() || confirmedTarget;
const rawBaseURL = process.env.E2E_BASE_URL?.trim();
const rawApiBaseURL = process.env.E2E_API_BASE_URL?.trim();
const baseURL = rawBaseURL || '__DISCOVERY_SAFE_FRONTEND_URL__';
const apiBaseURL = rawApiBaseURL || '__DISCOVERY_SAFE_API_URL__';

export const discoveryEnvironment = {
  target,
  rawTarget: process.env.E2E_TARGET,
  environment: process.env.E2E_ENVIRONMENT,
  rawBaseURL,
  rawApiBaseURL,
  baseURL,
  apiBaseURL,
} as const;

export default defineConfig({
  testDir: '__TEST_DIR__',
  testMatch: '__TEST_MATCH__',
  testIgnore: '__TEST_IGNORE__',
  fullyParallel: true,
  workers: 2,
  retries: 0,
  forbidOnly: true,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  testIdAttribute: '__EVIDENCED_TEST_ID_ATTRIBUTE__',
  outputDir: '__OUTPUT_DIR__',
  reporter: [
    ['list'],
    ['html', { outputFolder: '__HTML_REPORT_DIR__', open: 'never' }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: '__PROJECT_NAME__',
      use: {
        ...devices['__DEVICE_DESCRIPTOR__'],
        // Add channel only for an explicitly selected branded browser.
      },
    },
  ],
  // Applications are started manually; intentionally no webServer block.
});
