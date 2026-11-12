import type { TestInfo } from '@playwright/test';

const FIXED_SEED = 20260903;

export function workerDataNamespace(testInfo: TestInfo, runId: string): string {
  const safeRun = runId.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 32);
  return `e2e-${safeRun}-w${testInfo.parallelIndex}-s${FIXED_SEED}`;
}
