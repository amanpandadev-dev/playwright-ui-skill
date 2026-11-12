import fs from 'node:fs';
import path from 'node:path';

// Persona-keyed auth state. One artifact per approved identity, never one shared account:
//   <E2E_AUTH_STATE_DIR>/<stateKey>.json         reusable browser state
//   <E2E_AUTH_STATE_DIR>/<stateKey>.meta.json    binding metadata, validated before use
// E2E_AUTH_STATE_PATH remains a compatibility alias only when the lane has exactly one identity-bearing persona.
// Files hold tokens: keep the directory ignored, mode 0o600, and out of traces, videos and attachments.

export type AuthStateBinding = {
  persona: string;
  stateKey: string;
  origin: string;
  tenant?: string;
  clientId?: string;
  scope?: string;
  accountHint?: string;
};

export type AuthStateInputs = {
  stateDir?: string;
  legacyStatePath?: string;
  identityPersonas: number;
};

export function resolveAuthStateInputs(env: Readonly<Record<string, string | undefined>> = process.env, identityPersonas = 1): AuthStateInputs {
  return { stateDir: env.E2E_AUTH_STATE_DIR?.trim(), legacyStatePath: env.E2E_AUTH_STATE_PATH?.trim(), identityPersonas };
}

export function authStatePath(inputs: AuthStateInputs, stateKey: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(stateKey)) throw new Error(`Invalid auth state key "${stateKey}"`);
  if (inputs.stateDir) return path.resolve(inputs.stateDir, `${stateKey}.json`);
  if (inputs.legacyStatePath && inputs.identityPersonas === 1) return path.resolve(inputs.legacyStatePath);
  throw new Error(
    inputs.identityPersonas > 1
      ? 'E2E_AUTH_STATE_DIR is required: this lane has several identity-bearing personas and E2E_AUTH_STATE_PATH holds only one'
      : 'E2E_AUTH_STATE_DIR (or the single-persona alias E2E_AUTH_STATE_PATH) is required at runtime',
  );
}

// Runtime only: call from the persona's browser-context fixture, never at config import.
export function requireAuthState(inputs: AuthStateInputs, expected: AuthStateBinding): string {
  const statePath = authStatePath(inputs, expected.stateKey);
  const metaPath = statePath.replace(/\.json$/, '.meta.json');
  if (!fs.existsSync(statePath) || !fs.existsSync(metaPath)) {
    throw new Error(`Auth state is missing for ${expected.persona} — remediation: run the approved auth setup for this persona; owner: E2E operator`);
  }
  let meta: AuthStateBinding;
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as AuthStateBinding;
  } catch {
    throw new Error(`Auth state metadata is unreadable for ${expected.persona} — remediation: rerun the auth setup for this persona`);
  }
  for (const key of ['persona', 'stateKey', 'origin', 'tenant', 'clientId', 'scope'] as const) {
    if (expected[key] !== undefined && meta[key] !== expected[key]) {
      throw new Error(`Auth state for ${expected.persona} is bound to a different ${key} — remediation: rerun the auth setup for this persona; never reuse another persona's state`);
    }
  }
  return statePath;
}
