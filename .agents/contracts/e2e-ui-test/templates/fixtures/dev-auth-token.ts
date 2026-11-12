import { request, type APIRequestContext } from '@playwright/test';

// Application development authentication (authMode app-dev-auth). Specialize from the
// evidenced endpoint recorded in setup-decisions.json (lanes[].devAuth). Each persona gets a real,
// application-issued token, so the backend's own RBAC, department scope and object ownership are exercised.
// It proves application authorization, not identity-provider role assignment: keep assignment-specific
// criteria blocked. Local only: the token is requested from, and sent to, the confirmed local API origin alone.
// Never fabricate the endpoint, forge a token, or weaken the application's development guard.

export type DevAuthContract = {
  endpointPath: string; // for example '/auth/dev-token', from devAuth.endpoint
  personaRoles: Readonly<Record<string, string>>; // persona -> application role, from devAuth.personaRoles
  personaAccounts: Readonly<Record<string, string>>; // persona -> directory account, from the environment contract
  tokenField: string; // response field holding the token, from the evidenced response model
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function assertLocalOrigin(apiBaseURL: string): URL {
  const url = new URL(apiBaseURL);
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`Development tokens are local-only; ${url.origin} is not a local API origin — use the remote lane's real authentication`);
  }
  return url;
}

// Runtime only, from a worker- or test-scoped fixture after the local environment gate has passed.
// The token lives in memory for the fixture's lifetime and is never written to disk or logged.
export async function devAuthToken(contract: DevAuthContract, apiBaseURL: string, persona: string): Promise<string> {
  const origin = assertLocalOrigin(apiBaseURL).origin;
  const role = contract.personaRoles[persona];
  const email = contract.personaAccounts[persona];
  if (!role || !email) {
    throw new Error(`No development role or account is recorded for persona ${persona} — remediation: request an e2e-ui-test-env-setup reconfiguration`);
  }
  const context = await request.newContext({ baseURL: origin });
  try {
    const response = await context.post(contract.endpointPath, { data: { email, role } });
    if (!response.ok()) {
      throw new Error(`Development token request for ${persona} failed with HTTP ${response.status()} — remediation: start the application with its development authentication enabled; owner: application developer`);
    }
    const token = (await response.json())[contract.tokenField];
    if (typeof token !== 'string' || !token) throw new Error(`Development token response for ${persona} has no ${contract.tokenField}`);
    return token;
  } finally {
    await context.dispose();
  }
}

// API calls as a persona. The Authorization header is bound to this local-origin context only.
export async function apiAs(contract: DevAuthContract, apiBaseURL: string, persona: string): Promise<APIRequestContext> {
  const origin = assertLocalOrigin(apiBaseURL).origin;
  const token = await devAuthToken(contract, apiBaseURL, persona);
  return request.newContext({ baseURL: origin, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
}
