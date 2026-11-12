# Local authentication

Read this reference only when the confirmed application target is `local`. Entra is the recommended
local identity provider; this does not select Azure hosting. Do not apply these defaults, questions,
fixtures, or role simulation to Azure, AWS, GCP, or other remote targets, even when their browsers run
on a developer machine. Preserve remote configuration, authentication references, workflows, and roles.

## Discover before asking

Before asking the local authentication question, run the static discovery and read its evidence:

```text
node .agents/contracts/e2e-ui-test/scripts/check-setup.mjs discover --root <repo>
```

It lists development-authentication candidates in application source (token or login endpoints and
the functions behind them), the non-production guard and role set beside each, how the frontend calls
them, the current auth-state wiring, route mocking, validation wiring and portal readiness. Candidates
are evidence to inspect, not decisions. Open each one: a real candidate issues an application token
for a directory user and role, is guarded to development (for example debug plus a dev auth mode), and
is enforced by the backend on every request. A look-alike (a signature constant, a test helper, a
disabled route) is rejected with a precise reason.

## Confirm the local choice

When the developer says Local without choosing authentication, ask the question that matches the
evidence. When a real development-authentication endpoint exists, name it and offer three options:

> For Local, do you want (a) the application's development authentication, detected at
> `<METHOD path>` (`<evidence file>`), which issues a real application token per persona and exercises
> the backend's own authorization; (b) Entra Authentication, which uses one real interactive identity
> with simulated roles; or (c) No Auth?

Recommend (a) when the scope needs several personas or backend authorization, department or object
scope; recommend (b) when the scope is single-identity or real Entra token validation is itself under
test. When no real endpoint exists, ask the two-option question:

> For Local, do you want Entra Authentication (recommended) or No Auth?

Never offer (a) without evidence, and never select any option without an explicit answer; a
recommendation is not confirmation. Record the result in `lanes[].authChoice`: the options offered and
every discovered candidate, each either offered or rejected with a precise reason. `check-setup.mjs
verify` fails when a discovered candidate is missing from that record.

Wait for the answer before auth-dependent generation. An explicit Local with a named choice answers
this question; reuse it throughout the session. Repository dev/mock auth is evidence about
implementation, not permission to select No Auth. In incremental, replacement, or sweep mode,
reuse compatible setup unchanged. A new mode or missing auth fixture requires a separate setup
operation; do not retrofit existing local suites automatically.

Use the repository's established local auth setting, or `E2E_LOCAL_AUTH_MODE=entra|app-dev-auth|none`.
Generated local defaults use the confirmed mode.
Never use that runtime default to bypass the authoring question. A runtime mode must match the
confirmed scaffold; reject a different mode with setup remediation rather than downgrading auth.
Do not require or consume this setting in remote lanes.

For No Auth, generate anonymous contexts without Entra packages, token helpers, state dependencies,
or identity metadata. Existing unrelated Entra dependencies need not be removed. Inspect whether the
requested routes and APIs support anonymous access or an explicitly selected existing development
mode. If they require login, record the affected journeys as blocked, with remediation to provide an
anonymous/development contract owned by the application developer. Do not disable application auth,
forge a development token, or treat an authenticated route as anonymous. Identify existing development
identity simulation accurately; it does not establish anonymous or real Entra authorization coverage.

## Ground Entra setup

Reuse repository configuration and ask only for missing non-secret details:

- Tenant ID/domain, SPA/public client ID, API delegated scope and expected audience.
- Exact local frontend/API origins and registered localhost redirect URI; additional APIs need
  their own scopes/audiences and origin mappings.
- Evidenced roles/personas, permissions, and access-profile aliases needed by the journeys.
- Application login/token API, cache mechanism, and any MFA/Conditional Access prerequisites.

Inspect the app's auth provider, API client, and server authorization. Do not invent a global MSAL
instance, login route, test hook, or token endpoint. If no supported integration can be generated from
source, record a setup blocker and application-developer remediation. Do not change application code
or Entra registrations as part of this skill. Never ask for token or credential values.

## Generate the manual session/token flow (setup only)

Generate a dedicated local auth setup helper/project and a matching authenticated fixture, preserving
the established owning setup. These artifacts execute only when the developer later runs them; the
skill never opens a browser, authenticates, acquires tokens, or validates endpoints.

1. During manual auth setup, use the application's supported MSAL login and token integration in a
   dedicated local-app test-browser context. Reuse its active account; if several accounts are present
   without an active selection, require manual account selection rather than choosing arbitrarily.
   A Windows login or a session in the developer's ordinary browser is not automatically available.
2. Request the confirmed API scope with `acquireTokenSilent` for that account. If no reusable session
   exists or interaction is required, let the developer complete the application's normal
   authorization-code-with-PKCE sign-in, consent, or MFA in that dedicated context. Do not automate
   passwords/MFA, use ROPC/client credentials, or substitute an Azure CLI/Graph token for the API token.
3. Capture the resulting access token through the evidenced app token provider at runtime. Where the
   provider is not exposed to test code, reuse the app's own authenticated requests; direct API tests
   need an evidenced adapter or remain blocked. Do not scrape arbitrary cache keys or fabricate a
   browser-global MSAL bridge. An ID token is not an API access token.
4. Keep acquired API tokens in memory, use SDK expiry metadata and silent renewal, and attach them
   only to their confirmed API origins. Do not set browser-global Authorization headers or forward
   bearer tokens across origins on redirects. Preserve server validation of signatures, issuer,
   audience, expiry, and permissions; merely decoding a JWT does not validate it.
5. Save only the required reusable browser state to an ignored local auth directory (default
   `.auth/local/`) outside test output directories. Inspect the actual cache: cookies/localStorage
   use browser storage state; sessionStorage needs an additional snapshot restored only for the exact
   local-app origin before application code runs. Use supported IndexedDB capture only if required
   by the installed version/cache. Bind state metadata to the local origin, tenant/client, and chosen
   identity; do not reuse it across environments or accounts.
6. Wire state into the generated browser-context fixture; file existence alone does not authenticate
   a context. Validate missing/malformed/mismatched state at runtime. Verify the real identity and
   access profile using the evidenced app response before installing role mocks. Before protected
   journey actions, acquire/renew the API token through the supported integration. An expired or
   revoked session requiring interaction must fail with “rerun manual local auth setup”, owned by
   the E2E operator. Do not open interactive prompts in unattended workers or fall back to No Auth.

Keep reusable state read-only across workers; each test gets an isolated browser context and mutable
role data. Do not overwrite shared state from parallel workers. Document the manual command to refresh
state and account selection, with no claims that it has been run. Auth setup is a prerequisite for
authenticated journeys only; the setup helper itself must work without preexisting auth state.

Reusable browser snapshots can contain tokens even though direct API tokens remain memory-only.
Ignore all such snapshots and value-bearing env files; never print tokens, cookies, auth headers, or
cache contents. Disable trace/video/screenshots for local auth setup and token-bearing local flows
unless their output is demonstrably redacted; default failure traces can retain headers and bodies.
Exclude auth files from attachments and artifact uploads. Do not change any remote artifact policy.

## Application development authentication (app-dev-auth)

Choose this only from evidence and an explicit answer. Record `lanes[].devAuth` in
`setup-decisions.json`: the endpoint (for example `POST /auth/dev-token`), its request shape,
evidence files, how the application itself uses the token in the browser (`browserSignIn`, when
evidenced), the non-production guard and its evidence, the roles the backend accepts, and the role per
persona. Personas are `identity: app-token` with a distinct `stateKey`.

Generate a per-persona token fixture from
[../../../contracts/e2e-ui-test/templates/fixtures/dev-auth-token.ts](../../../contracts/e2e-ui-test/templates/fixtures/dev-auth-token.ts):

- request each persona's token from the evidenced endpoint on the confirmed local API origin, with the
  persona's directory account from the environment contract and its recorded role;
- keep tokens in memory and attach them only to the confirmed local API origin through a dedicated
  request context; never set a browser-global Authorization header;
- for browser journeys, reuse the application's own development sign-in path named in `browserSignIn`;
  when none is evidenced, use the token for API setup and assertions only, keep browser sign-in on the
  existing mode, and record that limitation;
- do not intercept the identity or access-profile endpoint (for example `/auth/me`): the point of this
  mode is that the backend sees the persona.

Honesty rules stay in force. A development token proves the application's authorization (roles,
department and object scope, ownership), not identity-provider role assignment: keep
assignment-specific criteria blocked with their existing blocker. Never fabricate an endpoint, forge or
edit a token, or weaken the development guard; if the endpoint is absent or disabled, option (a) is not
offered. Development tokens never leave a local lane: the template refuses non-local origins and
`check-setup.mjs verify` fails `app-dev-auth` on a remote target.

## Auth state per persona

Key auth state by persona on every target, as Azure already does. Use
[../../../contracts/e2e-ui-test/templates/fixtures/auth-state.ts](../../../contracts/e2e-ui-test/templates/fixtures/auth-state.ts):
`E2E_AUTH_STATE_DIR` plus `<stateKey>.json` and a `<stateKey>.meta.json` binding that carries the persona
with origin, tenant, client and scope, validated before use. `E2E_AUTH_STATE_PATH` remains only as a
compatibility alias for a lane with exactly one identity-bearing persona.

When the scope needs more than one real identity, the auth setup captures one artifact per approved
identity and journeys select their persona's state. Record `approvedIdentity` per real persona. A scope
that needs N identities with fewer approved is an explicit readiness blocker in
`lanes[].readinessBlockers` (personas, blocker, remediation, owner), never a silent fallback to role
simulation. Document the number of identities the scope needs in the environment contract.

## One identity, multiple local roles (Entra)

Keep the same authenticated Entra identity and unmodified signed token across role scenarios. A local
role label cannot change Entra claims or the backend's actual permissions.

- Reuse an evidenced existing local role hook when it supports the requested roles. Apply it only to
  confirmed local endpoints with the app's development guard, never a remote API. Preserve Entra
  validation before any role override. Reset the hook after each test; if it is process-global,
  serialize affected tests or use isolated instances so workers cannot race.
- Otherwise intercept evidenced role/access-profile and related API contracts in a fresh test context.
  Include role-dependent allowed/denied responses, register mocks before journey activity (after the
  real identity check), and remove them during teardown. Keep simulated identities/permissions
  consistent throughout the UI scenario; changing only a displayed role is insufficient.
- Mark plans, test annotations, catalog descriptions, and coverage ledger evidence as local simulated
  roles, retaining the real runtime identity separately from the business persona. Preserve existing
  schema fields and controlled access-profile values; do not fabricate an alias or new catalog enum.
- Mocked responses establish UI behavior only. A development override also does not prove Entra role
  assignment. Actual backend/Entra RBAC criteria remain blocked unless the existing hook demonstrably
  exercises the relevant server authorization; assignment-specific criteria require genuine assigned
  permissions. Missing hooks or unknown response contracts need a distinct blocker and application-
  developer remediation. Do not create a backend override or edit tokens to fill that gap.

Local role simulation is prohibited when any affected API is remote, even if the frontend is localhost.
Keep those journeys on genuine permissions or blocked. Do not modify remote suites to share local
fixtures, sessions, settings, mocks, or portal readiness.

## Local environment wiring and handoff

For each local coverage obligation, record evidence layer and exact intercepted methods/endpoints in
the linked [coverage manifest](../../e2e-ui-test-generator/references/assertion-evidence.md). A simulated role or response proves only the UI
contract exercised; it does not establish real token authorization, department/object scope, backend
validation, sorting, persistence, audit, or notification behavior replaced by mocks. Split mixed ACs
into browser and internal obligations rather than declaring the entire AC non-browser-observable or
Covered. When real runtime identity/state is missing but API/UI contracts are known, retain concrete
authored journeys, mark the readiness prerequisite precisely, and keep execution `NotRun`. Never obtain
credentials or run authentication to validate these authoring claims.

For setup, specialize [../../../contracts/e2e-ui-test/templates/fixtures/local-environment.ts](../../../contracts/e2e-ui-test/templates/fixtures/local-environment.ts)
with confirmed defaults in a generated side-effect-free module. Use `resolveLocalInputs` for both
config and the automatic worker runtime gate; invoke `validateLocalEnvironment` only at runtime.
Config uses inert absolute discovery URLs for malformed inputs and keeps raw inputs for the gate.
The local gate rejects unsupported targets/modes and malformed URLs before `beforeAll` or network
activity. Follow it with selected-mode metadata/session validation; no auth work occurs at import.
Use the existing remote resolver untouched in remote projects, with project matching that prevents
cross-collection. Do not add local fallbacks to shared remote validation.

Document `E2E_LOCAL_AUTH_MODE` and only the selected mode's consumed variables in the example/README,
including defaults, requiredness, consumers, and secret classification. For local Entra, record the
manual state directory, session refresh instructions, actual token integration, real versus simulated
coverage, and blockers. Keep human-auth prerequisites visible in catalog readiness; never mark an
unattended workflow ready on the assumption it inherits the developer's local session. Maintain the
existing portal schema/workflow contract without editing remote behavior.

## Static validation

- Confirm discovery ran, every candidate is recorded as offered or rejected with a reason, and the
  question named a real endpoint when one exists; no unanswered choice becomes an assumed selection.
- For app-dev-auth, confirm the token fixture is local-only, memory-only and bound to the API origin, and
  that no identity endpoint is intercepted.
- Confirm auth state is keyed by persona and unapproved identities are readiness blockers.
- Confirm the same local defaults feed configuration and runtime, real process values win, missing
  variables do not break import, and runtime mismatches fail before protected journey activity.
- Trace generated state loading, origin-scoped sessionStorage restoration, active-account token
  acquisition/renewal, manual remediation, and secret/artifact exclusions without executing them.
- Check No Auth has no generated Entra dependency and unsupported anonymous routes remain blocked.
- Check role mocks/hooks are local, isolated, cleaned up, and labeled; real RBAC gaps are preserved.
- Compare remote files and behavior with their pre-edit snapshot. Run only static parsers/checks, not
  Playwright discovery, compilation, apps, browsers, authentication, tokens, or workflows.

Provider reference: [MSAL token acquisition](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/acquire-token).
