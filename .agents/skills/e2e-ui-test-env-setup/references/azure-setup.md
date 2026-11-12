# Azure Playwright Setup

Read this reference whenever the confirmed application target is Azure and the operation includes
setup or configuration. It creates an Azure-specific application lane without deploying, probing,
authenticating, or running anything during generation. Browser execution remains ordinary Playwright
on developer machines or GitHub-hosted/self-hosted Actions runners; managed Azure browser services are
unsupported.

## 1. Complete the Azure contract before writing

Require all of the following non-secret inputs:

- a protected non-production environment name such as `dev`, `test`, `uat`, or `staging`;
- exact HTTPS frontend and backend/API URLs, plus a named URL map for additional services;
- the browser target and agent platform;
- the authentication provider and flow;
- for Microsoft Entra ID, the tenant ID/domain, SPA client ID when applicable, API audience/scope,
  redirect URI, required app roles/groups/personas, and MFA/Conditional Access constraints;
- whether authenticated API setup uses user delegation or an explicitly selected application identity;
- whether authenticated GitHub Actions coverage uses human-refreshed storage state, API identity only,
  or an explicitly authorized isolated test-tenant UI sign-in;
- the deterministic test-data and cleanup contract for every state-changing journey.

If the developer supplies only `Azure`, stop before file mutation and ask only for the missing fields.
Do not ask for secret values, tokens, cookies, or saved browser state. Reject production as a target.

Selecting Azure for a repository that currently supports only local execution is an explicit
setup/configuration operation, not incremental feature generation. In a brownfield project, preserve
the local lane and add an isolated Azure lane by default. Replace or remove local behavior only when the
developer explicitly requests replacement.

## 2. Generate a separate Azure lane

Preserve the owning package, Playwright version, module style, existing config, test root, reporters,
local projects, fixtures, scripts, and agents. Add only the Azure-specific pieces that are missing:

- discovery-safe target resolution for `E2E_TARGET=azure`;
- an Azure auth-setup project when interactive UI authentication is required;
- one Azure browser project per confirmed browser, using target-specific `testMatch`/`testIgnore` so
  local mocked specs and Azure specs cannot run in the wrong lane;
- an automatic worker-scoped Azure environment fixture;
- Azure auth/session fixtures and persona metadata;
- a non-secret `.env.e2e.example`, ignored auth-state directory, Azure tags, and manual scripts;
- Azure-specific plans and suites grounded in the confirmed requirements or source.

Use a stable project name such as `<Browser> - Azure`; for Microsoft Edge use `Microsoft Edge - Azure`
with `devices['Desktop Edge']` and `channel: 'msedge'`. Provide an unambiguous manual command that
targets that project. Do not add a browser the developer did not select.

Do not add `webServer`, deployment, Azure resource provisioning, endpoint checks, sharding, automatic
execution, alternate workflow-platform files, or managed-browser configuration. The only workflow allowed is the setup-
owned manual GitHub Actions portal workflow. A generated Azure auth project is an authoring artifact,
not permission to run it.

## 3. Keep configuration discoverable and runtime fail-closed

Use the established names when present; otherwise document these public variables:

```text
E2E_TARGET=azure
E2E_ENVIRONMENT=<non-production-environment-name>
E2E_BASE_URL=<azure-frontend-https-url>
E2E_API_BASE_URL=<azure-api-https-url>
E2E_ENTRA_TENANT_ID=<tenant-id-or-domain>
E2E_ENTRA_CLIENT_ID=<spa-client-id>
E2E_ENTRA_API_SCOPE=<api-scope-or-audience>
E2E_AUTH_PERSONA=<confirmed-persona-name>
E2E_AUTH_STATE_DIR=.auth/azure
```

Add only identity variables required by the selected flow. Never put credential or token values in the
example file.

At config import time, preserve raw values and use inert absolute values such as
`https://e2e.invalid` when Azure URLs are unavailable. Do not throw merely because VS Code Test
Explorer did not inherit terminal variables.

Before any generated `beforeAll`, navigation, or request, an automatic worker-scoped fixture must:

- require `E2E_TARGET=azure` for the Azure lane;
- reject missing, unsupported, or production-like `E2E_ENVIRONMENT` values;
- require exact frontend/API HTTPS URLs and reject inert placeholders;
- validate named service URLs and prevent tokens from being attached outside confirmed API origins;
- validate the selected auth metadata and persona without logging sensitive values.

## 4. Scaffold Microsoft Entra UI authentication

For SPA/browser journeys, preserve the application's authorization-code-with-PKCE redirect. Generate a
manually invoked, headed auth setup when account selection, MFA, or Conditional Access may occur. Do
not make that interactive project an automatic dependency of unattended Azure runs. The Azure suite
should fail or skip with a precise instruction when its ignored auth artifact is absent or expired.

Before choosing the persistence method, inspect the application's identity library and cache location:

- Cookies or `localStorage`: use normal Playwright `storageState` in an ignored persona-specific file.
- MSAL `sessionStorage`: normal `storageState` is insufficient. Generate a companion ignored session
  snapshot and restore only the confirmed application origin with `page.addInitScript()` before app
  code runs. Preserve any cookies/local storage through normal storage state as well.
- Unknown or custom storage: do not invent a cache format. Document the missing contract and generate
  a precise skip until the application-specific mechanism is confirmed.

Create one ignored artifact set per evidenced persona rather than assuming one account can safely
represent incompatible roles. The auth setup should validate the returned `/auth/me` profile or the
application's equivalent access-profile contract against the selected persona and landing behavior.
Never print or commit the resulting storage, tokens, account identifiers, or authorization headers.

Never generate resource-owner-password/ROPC authentication, automate usernames/passwords, automate
MFA, or inject a confidential-client secret into browser code. Treat sample `auth.setup.ts`,
`fixtures.ts`, or similar files as architectural evidence only: reuse their separation of concerns when
compatible, but never copy their domain roles, endpoints, storage keys, token grants, or seed APIs.

### Authenticated GitHub Actions decision

Do not mark authenticated browser coverage ready for unattended GitHub Actions until the developer
selects one of these modes:

- **Human-refreshed storage state** — a developer periodically runs headed PKCE/MFA setup and securely
  supplies the ignored state to the protected workflow. Entries remain `ManualAuthRequired` and skip
  with reason/remediation/owner when state is missing or expired.
- **API identity only** — unattended coverage is limited to approved API behavior exercised by an
  application identity. Browser-user journeys remain manual and cannot inherit application-identity
  authorization claims.
- **Isolated test-tenant UI sign-in** — automate the sign-in form only with explicit written approval,
  a named non-production tenant containing no real users, dedicated test accounts excluded from MFA
  and Conditional Access, and environment-supplied credentials bound through a protected GitHub
  Environment. Never select this mode by default.

ROPC remains prohibited in every mode. If no mode is selected, generation may still create manual auth
scaffolding, but affected catalog entries are not dispatchable as `Ready`.

## 5. Scaffold API identity only when selected

Browser-user authentication and API application identity are separate decisions. Add `@azure/identity`
only when an Azure API setup/seed helper explicitly needs it and the developer selects a compatible
credential such as `DefaultAzureCredential`, managed/workload identity, certificate credential, or a
client secret supplied later through the environment.

Acquire the least-privilege token only during a future manual run. Keep it in memory, honor expiry,
never log or persist it, and attach it only to confirmed API origins. Do not assume an application token
satisfies user group/app-role authorization; verify that contract from requirements or source. If no
approved application-identity contract exists, omit the helper.

## 6. Integrate Azure suites without weakening local tests

Azure suites import the Azure fixture, declare an evidenced persona, use real deployed services, and
carry `@azure` plus the applicable `@smoke`, `@regression`, `@security`, or environment tag. They must
not import local route mocks, synthetic access profiles, or development tokens.

Default Azure coverage to authentication, access-profile/RBAC routing, frontend-to-backend
connectivity, and deterministic read-only smoke journeys. Reuse pure assertion/page-object helpers when
they do not carry local mock assumptions.

State-changing journeys require a protected test tenant, test-owned records, deterministic seed/reset
interfaces, idempotency where supported, and guaranteed cleanup. Until that contract is confirmed,
generate a precise `test.skip()` and record the gap instead of using shared business data or fabricating
seed endpoints.

## 7. Validate and hand off statically

In addition to the standard static checks, confirm:

- local projects, fixtures, suites, and scripts remain intact in brownfield additions;
- Azure and local matching rules cannot collect each other's suites;
- every Azure suite imports the automatic runtime/auth fixture;
- interactive auth setup is manually invoked and auth-state paths are ignored;
- MSAL `sessionStorage` applications have explicit snapshot restoration rather than storage-state-only
  claims;
- no ROPC/password flow, hard-coded secret, token persistence, endpoint request, `webServer`, alternate
  workflow-platform file, managed-browser configuration, or Azure provisioning artifact was introduced;
- write journeys without an approved seed/cleanup contract are explicitly skipped.

The handoff must list the Azure environment-variable names, browser/project, agent platform, auth flow,
personas, manual auth prerequisite, ignored auth paths, Azure plans/suites, and commands a developer may
run later. When the setup-owned GitHub workflow is authored, distinguish that static artifact from
execution. State explicitly that no test, browser, token flow, endpoint, application, deployment, Azure
resource, agent, workflow run, or results report occurred.
