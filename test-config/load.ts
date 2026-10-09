import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

export interface Target {
  baseUrl: string;
  environment: string;
  buildVersion: string;
  allowDestructive: boolean;
  prodDomains: string[];
  loginPath?: string;
  roles: Record<string, { userEnv: string; passEnv: string }>;
  journeys: { id: string; name: string; role: string; priority: string }[];
  searchData: { hits: string[]; misses: string[] };
  expectations: string[];
  outOfScope: string[];
}

export function loadTarget(): Target {
  const file = path.join(__dirname, 'target.yaml');
  return parse(fs.readFileSync(file, 'utf8')) as Target;
}

export const isTodo = (v: unknown): boolean =>
  v === undefined || v === null || (typeof v === 'string' && v.trim().startsWith('TODO'));
