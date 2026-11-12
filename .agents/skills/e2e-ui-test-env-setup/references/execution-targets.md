# Execution Target Contract

Confirm the application-under-test target on every invocation before modifying files. This identifies
where the application is hosted, not where browser processes run. Generated tests use ordinary
Playwright on a developer machine or the repository's manual GitHub Actions workflow. Never infer the
application target from repository content, cloud IaC, or prior defaults.

## Target question

Ask one concise blocking question when the target is not already explicitly confirmed:

> Which environment should these E2E tests target: local, Azure, AWS, GCP, or another platform? For a
> cloud/remote target, provide the non-production environment name plus exact frontend and backend/API
> URLs. Do not provide secrets.

If the developer already named the target, ask only for missing required fields.

## Required target details

| Target | Required before setup/generation |
| --- | --- |
| Local | Confirmed local target; frontend URL; backend/API URL when not unambiguous in existing config; explicit local authentication choice after discovery (application development authentication when evidenced, Entra, or No Auth), plus the selected local auth contract below. |
| Azure | Environment name; frontend URL; backend/API URL(s); browser; agent platform; Entra ID or other auth choice; identity metadata, personas, and MFA/Conditional Access constraints listed in `cloud-authentication.md`. Then follow `azure-setup.md`. |
| AWS | Environment name; frontend URL; backend/API URL(s); Cognito, IAM Identity Center, ALB/OIDC, or custom auth choice and metadata. |
| GCP | Environment name; frontend URL; backend/API URL(s); Identity Platform, IAP, Google OIDC, or custom auth choice and metadata. |
| Other | Platform/environment name; frontend URL; backend/API URL(s); auth protocol/provider and metadata. |

Production is not a supported default. If a URL or environment appears production-facing, stop and ask
for an approved non-production target.

## Local branch

Only when the application target is Local, read [local-authentication.md](local-authentication.md).
If Local is supplied without an explicit auth choice, run `check-setup.mjs discover` and ask the
local authentication question from [local-authentication.md](local-authentication.md): three options
naming the evidenced development-authentication endpoint when one exists, otherwise **Entra
Authentication (recommended) or No Auth?** Honor a choice already supplied in the session; do not infer No Auth from mock/dev code or
silently accept the recommendation. Wait for the answer before generating auth-dependent setup.
Collect only missing non-secret Entra metadata when Entra is selected. No Auth requires no Entra
metadata. Keep the cloud/remote branches below unchanged, including when their browsers run locally.

## Azure branch

When Azure is confirmed, read [azure-setup.md](azure-setup.md) before setup or configuration. `Azure`
alone is not a complete execution contract: ask only for the missing non-production environment,
HTTPS endpoints, browser, agent platform, authentication metadata, personas, and Conditional Access/MFA
constraints, then stop before writing. If a brownfield repository currently has only a local lane,
treat Azure as explicit setup/configuration and preserve local while adding an isolated Azure lane by
default. Incremental feature generation remains setup-frozen. Azure means the application is hosted on
Azure and does not select an external managed-browser service.

### Scope decision: GitHub Actions and standard browsers only

This skill intentionally targets GitHub Actions as the sole workflow platform and does not
support Azure Playwright Workspaces or other managed-browser execution services. This is a
deliberate scope decision (regional availability constraints), not an unimplemented feature.
Do not add Azure DevOps pipelines or managed-browser configuration even if requested; instead
explain this constraint and suggest self-hosted GitHub Actions runners if the developer needs
execution closer to their region.

## Portability disclosure

State the consequence at target confirmation, before any generation:

> A local suite built on route mocks or simulated roles is not reusable against a remote target: choosing
> Azure (or another remote target) later means authoring a separate suite. Specs that use real application
> tokens per persona and seeded data are materially more portable.

Record `lanes[].portability` as `lane-specific` or `portable` with a one-line `portabilityNote`. A lane
with route mocks or simulated personas is always `lane-specific`; `check-setup.mjs verify` rejects the
opposite. When the local lane uses application development tokens, say so: it is a reason to prefer that
option, even though data mocks keep the lane `lane-specific` until its data is seeded.

## URL contract

- Require absolute `http://` or `https://` frontend and backend URLs.
- Permit HTTP only for confirmed local development; require HTTPS for cloud/remote targets.
- Ask for a named service map when journeys call multiple backends, for example `billing`, `reporting`,
  and `identity`.
- Validate URL syntax statically. Do not probe health endpoints, DNS, TLS, auth redirects, or APIs.
- Do not hard-code internal remote URLs unless the developer explicitly approves committing them. Prefer
  environment variables and a non-secret example file.

## Configuration convention

Use these generic variables unless an established repository convention exists:

```text
E2E_TARGET=local|azure|aws|gcp|other
E2E_ENVIRONMENT=<non-production-environment-name>
E2E_PLATFORM=<platform-name-required-when-target-is-other>
E2E_BASE_URL=<frontend-url>
E2E_API_BASE_URL=<backend-url>
E2E_<SERVICE>_BASE_URL=<additional-backend-url>
```

Separate configuration discovery from test execution. VS Code Test Explorer imports Playwright configuration before
terminal-scoped variables are necessarily available, so a top-level exception for a missing `E2E_TARGET`, frontend
URL, or backend URL prevents test discovery.

Generate two layers:

1. **Discovery-safe configuration**
   - Never throw at module import because target or endpoint variables are missing, unsupported, or malformed.
     Preserve raw values for the runtime gate and use only inert or confirmed-local config fallbacks for discovery.
   - For a confirmed local target, resolve a missing `E2E_TARGET` to `local` and use only the confirmed local URL
     defaults. This is a real target choice, not a silent cloud-to-local fallback.
   - For a cloud/remote target whose endpoints must remain environment-driven, use inert absolute discovery values
     such as `https://e2e.invalid` rather than contacting or accidentally targeting a live service.
   - Supply the discovery-safe frontend value to Playwright `baseURL`; do not start or probe an application.

2. **Automatic runtime contract fixture**
   - Extend the repository's shared `test` fixture with an automatic worker-scoped fixture used by every generated
     suite. Worker scope ensures the gate runs before generated `beforeAll` hooks as well as individual tests.
   - Resolve and validate the raw target, environment name, custom platform name, frontend/backend URLs, named
     services, and auth metadata before any generated `beforeAll`, page navigation, or API request.
   - Reject unsupported targets, missing remote target/environment selection, missing `E2E_PLATFORM` for `other`,
     inert discovery placeholders, invalid URLs, HTTP on remote targets, and missing required endpoints with clear
     runtime errors.
   - Expose validated API base URLs to fixtures without logging them, and never persist credentials or tokens.

For confirmed local setup, this discovery-safe pattern is valid:

```ts
const target = process.env.E2E_TARGET?.trim() || 'local';
const baseURL = process.env.E2E_BASE_URL?.trim() || 'http://localhost:5173';
const apiBaseURL = process.env.E2E_API_BASE_URL?.trim() || 'http://localhost:8000';
```

Do not pair this pattern with a top-level `if (!process.env.E2E_TARGET) throw ...`. Validation belongs in the automatic
runtime fixture so Test Explorer can enumerate tests while future execution remains fail-closed.

Follow [env-contract.md](env-contract.md) for guarded `.env.e2e` loading, variable documentation, and
example/value-file handling.

For Local setup, use the same resolved confirmed defaults in config and the automatic runtime gate;
see the local-only helper and wiring in [local-authentication.md](local-authentication.md). Do not
copy the generic environment fixture's raw-env-only resolution into a local setup with defaults.

## Static validation

- Inspect the configuration to confirm missing runtime variables cannot throw during module import.
- Confirm the automatic worker-scoped fixture is imported by every generated suite and rejects invalid runtime
  contracts before `beforeAll` or test use.
- Confirm `.env.e2e` loading is optional, process values win, and no managed-browser variables exist.
- Do not validate discovery by running `playwright test --list`, Test Explorer, a browser, or any test command.
