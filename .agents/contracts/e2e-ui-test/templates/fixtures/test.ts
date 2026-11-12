import { test as base, expect } from '@playwright/test';
import { validateEnvironment, type ValidatedEnvironment } from './environment-contract';
import { workerDataNamespace } from './data-namespace';
import { AppPage } from './app-page';

export type TestFixtures = {
  appPage: AppPage;
  dataNamespace: string;
};

export type WorkerFixtures = {
  environmentContract: ValidatedEnvironment;
  runId: string;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
  runId: ['local-authoring', { option: true, scope: 'worker' }],
  environmentContract: [
    async ({}, use, workerInfo) => {
      const contract = validateEnvironment(workerInfo);
      await use(contract);
    },
    { scope: 'worker', auto: true },
  ],
  appPage: async ({ page }, use) => {
    await use(new AppPage(page));
  },
  dataNamespace: async ({ runId }, use, testInfo) => {
    await use(workerDataNamespace(testInfo, runId));
  },
});

export { expect };
