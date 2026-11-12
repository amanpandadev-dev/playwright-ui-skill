import type { WorkerInfo } from '@playwright/test';

export type ValidatedEnvironment = {
  target: 'local' | 'azure' | 'aws' | 'gcp' | 'other';
  environment?: string;
  baseURL: string;
  apiBaseURL: string;
};

const REMOTE_TARGETS = new Set(['azure', 'aws', 'gcp', 'other']);

function requiredUrl(name: string, value: string | undefined, remote: boolean): string {
  if (isBlank(value)) throw new Error(`${name} is required at runtime`);
  const url = new URL(value!);
  if (url.hostname.endsWith('.invalid')) throw new Error(`${name} cannot use a discovery placeholder`);
  if (remote && url.protocol !== 'https:') throw new Error(`${name} must use HTTPS for remote targets`);
  return url.toString().replace(/\/$/, '');
}

function isBlank(value: string | undefined): boolean {
  return !value?.trim();
}

export function validateEnvironment(_workerInfo: WorkerInfo): ValidatedEnvironment {
  const target = process.env.E2E_TARGET?.trim().toLowerCase();
  if (!target || !['local', 'azure', 'aws', 'gcp', 'other'].includes(target)) {
    throw new Error('E2E_TARGET must be one of local, azure, aws, gcp, or other');
  }
  const remote = REMOTE_TARGETS.has(target);
  const environment = process.env.E2E_ENVIRONMENT?.trim();
  if (remote && isBlank(environment)) {
    throw new Error('E2E_ENVIRONMENT is required for remote targets');
  }
  return {
    target: target as ValidatedEnvironment['target'],
    environment,
    baseURL: requiredUrl('E2E_BASE_URL', process.env.E2E_BASE_URL, remote),
    apiBaseURL: requiredUrl('E2E_API_BASE_URL', process.env.E2E_API_BASE_URL, remote),
  };
}
