// Local-only building block. Do not import it from remote projects.
// Supply confirmed values from a side-effect-free generated defaults module.
// app-dev-auth: the application's evidenced development token endpoint (see dev-auth-token.ts).
export type LocalAuthMode = 'entra' | 'app-dev-auth' | 'none';

export type LocalDefaults = {
  baseURL: string;
  apiBaseURL: string;
  authMode: LocalAuthMode;
};

export type LocalInputs = {
  target: string;
  baseURL: string;
  apiBaseURL: string;
  authMode: string;
  confirmedAuthMode: LocalAuthMode;
};

// Pure resolution: safe at config import; no auth, URL parsing, or state reads.
// Pass the same resolved inputs to config and the automatic runtime fixture.
export function resolveLocalInputs(
  defaults: LocalDefaults,
  env: Readonly<Record<string, string | undefined>> = process.env,
): LocalInputs {
  return {
    target: env.E2E_TARGET?.trim().toLowerCase() || 'local',
    baseURL: env.E2E_BASE_URL?.trim() || defaults.baseURL,
    apiBaseURL: env.E2E_API_BASE_URL?.trim() || defaults.apiBaseURL,
    authMode: env.E2E_LOCAL_AUTH_MODE?.trim().toLowerCase() || defaults.authMode,
    confirmedAuthMode: defaults.authMode,
  };
}

// Config can use this inert value for discovery, retaining raw inputs for validation.
export function localDiscoveryURL(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') return value;
  } catch {
    // Missing/malformed runtime values must not prevent IDE discovery.
  }
  return 'http://e2e.invalid';
}

function validateURL(name: string, value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute local HTTP(S) URL`);
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.hostname === 'invalid' || url.hostname.endsWith('.invalid') ||
    url.username || url.password
  ) {
    throw new Error(`${name} must be a confirmed HTTP(S) URL without credentials or discovery placeholders`);
  }
  return value;
}

// Run inside the automatic worker-scoped gate, before beforeAll/navigation/API calls.
// Selected Entra metadata, state and token checks belong in the app-specific auth fixture.
export function validateLocalEnvironment(inputs: LocalInputs) {
  if (inputs.target !== 'local') {
    throw new Error('Local fixtures require E2E_TARGET=local; use the existing remote project for other targets');
  }
  if (!['entra', 'app-dev-auth', 'none'].includes(inputs.authMode) || inputs.authMode !== inputs.confirmedAuthMode) {
    throw new Error('E2E_LOCAL_AUTH_MODE must match the confirmed local setup; request setup to change auth mode');
  }
  return {
    target: 'local' as const,
    baseURL: validateURL('E2E_BASE_URL', inputs.baseURL),
    apiBaseURL: validateURL('E2E_API_BASE_URL', inputs.apiBaseURL),
    authMode: inputs.authMode as LocalAuthMode,
  };
}
