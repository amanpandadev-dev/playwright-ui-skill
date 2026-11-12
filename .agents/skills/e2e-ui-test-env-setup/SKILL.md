---
name: e2e-ui-test-env-setup
description: >
  Set up, reconfigure, or record an existing Playwright E2E environment for a repository. Classifies
  greenfield or brownfield; confirms target (local, Azure or other), authentication mode, personas,
  browsers, agent platform and test-data strategy; then writes or minimally updates Playwright config,
  discovery-safe fixtures, environment contract, auth-state scaffolding, npm scripts, ignores, READMEs and
  setup-decisions.json, plus an optional manual GitHub Actions portal workflow. Use when the user asks to
  install or onboard Playwright E2E, add a browser or environment, move E2E to Azure or another target,
  change E2E authentication or data strategy, or when a planning or test skill refuses because
  setup-decisions.json is missing. Not for E2E test plans (e2e-ui-test-plan-generator), Playwright specs
  (e2e-ui-test-generator) or coverage evaluations (e2e-ui-test-coverage-evaluator), and not for debugging or running
  tests. Never runs tests, browsers, applications, auth flows or workflows.
---

# E2E UI Test Environment Setup

Set up or reconfigure the Playwright E2E environment and record the confirmed decisions that the plan, test and evaluator skills consume. This skill owns configuration, fixtures, environment contract, auth-state scaffolding, scripts, ignores, READMEs and the optional portal workflow. It does not write plans, tests or evaluations.

Requires Node.js 20+, a supported JavaScript package manager, filesystem write access, and a browser-
facing web UI to test.

## Setup scope

This is a generation-only skill. It may inspect repository content; install explicitly approved setup
dependencies and browser binaries; write static agent definitions; generate configuration, fixtures,
plans, suites, documentation, catalog metadata, static validators, and the setup-owned manual portal
workflow; and run parsers or static scripts that do not import Playwright.

## Invariants (shared, verbatim)

1. **Non-execution.** Never run Playwright discovery or execution (`test`, `--list`, `show-report`,
   `codegen`, UI, headed), repository tests, TypeScript compilation, builds, browsers, applications,
   containers, endpoints, authentication, token flows, agents or workflows. Never probe DNS, TLS, health,
   redirects, APIs or credentials. Never create results reports or claim tests passed.
2. **Secrets.** Never request or commit secret values, tokens, cookies, storage state, auth headers,
   production data or private results. Never implement ROPC/password grants.
3. **Honest status.** Status vocabulary is exactly `Planned`, `Covered`, `PartiallyCovered`, `Blocked`,
   `NotBrowserObservable`, `OutOfScope`. `Planned` means a planned journey is not yet authored and never
   survives test authoring; execution is `NotRun` unless execution evidence is supplied. Never soften
   these to satisfy a gate.
4. **Stable identity.** Preserve `applicationId + testId`, `TC-Jxx` and obligation IDs when meaning is
   unchanged.
5. **Preserve user work.** Preserve unrelated and uncommitted changes; never delete a pre-existing file.
6. **No production.** Never target production.
7. **Application code is out of bounds.** A change required in application code is a blocker with
   application-developer remediation, never an edit.

Never:

- run Playwright discovery or execution, including `test`, `test --list`, `show-report`, `codegen`, UI,
  or headed modes;
- run repository tests, TypeScript compilation, application builds, generated agents, browsers,
  applications, containers, emulators, endpoints, authentication, token flows, or workflows;
- probe DNS, TLS, health endpoints, redirects, APIs, or credentials;
- create results reports or claim generated tests passed;
- create push, pull-request, or scheduled automation, alternate workflow-platform files, external
  managed-browser configuration, deployments, provisioning, or unrelated CI/CD/PR artifacts.

If generation and execution are requested together, perform only generation and identify execution as
a developer-owned follow-up.

Requires contracts: ^3.0.0

## Workflow

### 1. Ground in the repository

First record the starting state so the touched-files check (gate G-D11) can separate this operation from the
developer's uncommitted work: `node .agents/contracts/e2e-ui-test/scripts/check-file-scope.mjs snapshot --root <repo> --out <temp file outside the repository>`.

Inspect repository status, package ownership, manifests, lockfiles, Node declarations, Playwright
artifacts, agent/MCP configuration, documentation, UI routes/components, API clients, auth/RBAC,
accessible selectors, test data, ignored paths, and GitHub Actions. Preserve unrelated and uncommitted
changes. Reuse one valid owning Playwright setup instead of creating a parallel runner.

### 2. Classify greenfield or brownfield

Read [references/project-modes.md](references/project-modes.md), then classify the owning package:

- **Greenfield** when no Playwright dependency, config, suite, fixture system, or agent definition
  exists.
- **Brownfield** when any Playwright artifact exists, including incomplete or legacy setup.

Then choose exactly one setup operation:

- **New setup** for a greenfield package, or a brownfield package whose Playwright setup is absent or
  incomplete. Follow steps 3 to 9.
- **Reconfigure** for an explicit change of target, authentication, personas, browser, agent platform,
  data strategy or portal in a repository that already has `setup-decisions.json`. Follow steps 3 to 9
  for the changed decisions only.
- **Record existing setup** when a working Playwright setup exists but `setup-decisions.json` does not.
  Follow [references/record-existing-setup.md](references/record-existing-setup.md): derive the decisions
  from the repository, ask only for what the repository cannot show, and write `setup-decisions.json`.
  Skip steps 4 to 6; change no configuration, fixture, script, dependency, agent or workflow. The only
  other permitted change is a confirmed ignore exception for the handoff files.

### 3. Confirm target, authentication, personas, test data, browser and agent platform

Confirm the test-data strategy per lane with the question in [../../contracts/e2e-ui-test/test-data.md](../../contracts/e2e-ui-test/test-data.md), using the data seams
from `check-setup.mjs discover`: synthetic data through the application's own API or seed interface,
an existing non-production dataset, or route mocks only. For the first two, record `lanes[].data` (seed,
seeding persona, evidenced create interfaces, cleanup contract, namespace, application API patterns,
external mocks, data module) and generate the plumbing from `templates/fixtures/synthetic-data.ts` and
`seeded-data.ts`. Never invent a create, delete or reset interface.

Read [references/execution-targets.md](references/execution-targets.md). Confirm the application-under-
test target on every invocation: local, Azure, AWS, GCP, or another named platform. Remote targets
require a protected non-production environment, exact HTTPS frontend/API URLs or named service map,
and auth provider/flow. Never request secret values.

For Local only, read [references/local-authentication.md](references/local-authentication.md).
Run `node .agents/contracts/e2e-ui-test/scripts/check-setup.mjs discover --root <repo>` first. If the developer has
not explicitly chosen local auth, ask the question it supports: when a real development-authentication
endpoint is evidenced, name it and offer (a) application development authentication, (b) Entra, or
(c) No Auth; otherwise ask **Entra Authentication (recommended) or No Auth?** Record the options and every
discovered candidate in `lanes[].authChoice`. Wait for the choice before auth-dependent setup; a
recommendation is not confirmation.
Reuse an explicit session choice without asking again. Local Entra uses the local-app user's session
at future manual runtime; local role simulation does not change that user's Entra claims.

For authenticated remote targets, read
[references/cloud-authentication.md](references/cloud-authentication.md). For Azure setup, also read
[references/azure-setup.md](references/azure-setup.md). Azure means the application hosting target;
tests use ordinary Playwright on developer machines or GitHub-hosted/self-hosted Actions runners.
Do not add an external managed-browser integration.

State the portability consequence from [references/execution-targets.md](references/execution-targets.md)
before generation: a route-mocked or simulated-role local suite is not reusable on a remote target.

Read [references/agent-platforms.md](references/agent-platforms.md). Explicitly confirm the static agent
platform or no agents; do not infer it from repository files or the current assistant. Setup also
requires an explicit browser choice. Read
[references/browser-targets.md](references/browser-targets.md) for branded or non-default browsers.
Later plan and test operations reuse the recorded target, platform and projects unchanged; changing any
of them is a new reconfigure operation.

### 4. Resolve layout and setup safely

Read [references/artifact-layout.md](references/artifact-layout.md). Keep plans under `docs/`; preserve
the established brownfield `testDir`; otherwise use `tests/e2e/`. Maintain one repository catalog and
schema plus one setup-owned manual GitHub Actions portal workflow.

For new setup and reconfigure operations only:

- preserve package manager, lockfile, module style, Playwright version range, existing config,
  projects, reporters, scripts, fixtures, suite conventions, agents, and MCP settings;
- install only required dependencies and explicitly authorized browsers; never silently upgrade a
  major version or install branded browsers system-wide;
- stage `playwright init-agents`, then merge only the confirmed platform's static artifacts without
  invoking them;
- key auth state by persona (`E2E_AUTH_STATE_DIR`, one `<stateKey>.json` per identity-bearing persona) from
  [../../contracts/e2e-ui-test/templates/fixtures/auth-state.ts](../../contracts/e2e-ui-test/templates/fixtures/auth-state.ts);
  for `app-dev-auth`, generate the per-persona token fixture from
  [../../contracts/e2e-ui-test/templates/fixtures/dev-auth-token.ts](../../contracts/e2e-ui-test/templates/fixtures/dev-auth-token.ts);
- make `e2e:validate` run `node <path-to-repo>/.agents/contracts/e2e-ui-test/scripts/validate-all.mjs --docs-root <docs-e2e-root>`,
  so setup conformance, test inventory, catalog, config module format and coverage completeness are
  always checked together;
- add missing manual scripts, output/secret ignores, shared fixtures, configuration, documentation, the
  specialized catalog schema with an empty catalog, and the manual workflow. Catalog entries are written
  later by `e2e-ui-test-generator`;
- keep the handoff files committable. When step 7's gate check reports a handoff file ignored by git
  (for example by a repository-wide `coverage*.json` rule), add the narrowest negation it names, such as
  `!docs/tests_e2e/coverage-manifest.json`, after the rule. Never remove or weaken the rule itself. The
  plan and test generators refuse to start while a handoff file is ignored.
- ignore raw Playwright output from verify runs: add `<docs-e2e-root>/runs/*/playwright/` to `.gitignore`. That
  folder holds JSON reports, traces and error context, which can contain page text. The run reports beside it
  (`runs/<run-id>/run-<n>.json`) stay committable. `e2e-ui-test-verify-run` refuses to start until the folder is ignored.

### 5. Configure for discovery-safe future execution

Read [references/env-contract.md](references/env-contract.md),
[references/readme-contract.md](references/readme-contract.md), and
[references/fixture-standard.md](references/fixture-standard.md). Reuse the established config or copy
and specialize [../../contracts/e2e-ui-test/templates/playwright.config.template.ts](../../contracts/e2e-ui-test/templates/playwright.config.template.ts).

Before specializing a config, determine its Node module format from the config extension and nearest
owning `package.json` using the precedence in [references/project-modes.md](references/project-modes.md).
Replace both module bootstrap sentinels: CommonJS output removes `__CONFIG_DIR_IMPORT__` and replaces
`__CONFIG_DIR_DECLARATION__` with `const configDir = __dirname;`; ESM output replaces them with
`import { fileURLToPath } from 'node:url';` and
`const configDir = path.dirname(fileURLToPath(import.meta.url));`. Never change `package.json` merely
to make the generated config load. In brownfield setups, preserve a compatible bootstrap; if it is
incompatible, repair only the bootstrap instead of migrating the package's module format.

Configuration must use explicit documented parallelism, workers, retries, `forbidOnly`, timeouts,
`testIdAttribute`, `outputDir`, reporters, browser projects, endpoint resolution, and failure-only
artifacts. Load `.env.e2e` without failing when absent and without overriding real process variables.
Keep config import discovery-safe while an automatic worker-scoped fixture rejects invalid runtime
contracts before `beforeAll`, navigation, or API activity. Do not add `webServer`, managed browsers,
or execution-only policy.

### 6. Author the portal workflow (setup and onboarding only, when it can dispatch)

Ask whether the portal is wanted. Author it only when it is wanted and at least one catalog entry can be
`Ready` under the confirmed authentication (see [references/portal-workflow.md](references/portal-workflow.md));
otherwise record `portal.enabled: false` with the condition that would make dispatch possible.

When those conditions hold, during setup/onboarding only, create or minimally update one manual workflow at the established path
or `.github/workflows/execute-tests.yml`. It must use `workflow_dispatch` only, controlled catalog
inputs, fail-closed stable-ID selection and eligibility/readiness/status/access gates, protected GitHub
Environment values, the repository's Playwright command, and bounded artifacts. Never dispatch it.

Follow [references/portal-workflow.md](references/portal-workflow.md) for the workflow contract.

### 7. Record setup decisions

Write the confirmed decisions to `<docs-e2e-root>/setup-decisions.json`, validated against `.agents/contracts/e2e-ui-test/schemas/setup-decisions.schema.json`. The plan, test and evaluator skills treat this file as read-only; a needed change is a new setup request.

Record the lane decisions: `authChoice` and, for `app-dev-auth`, `devAuth` per local lane;
persona `identity` (`real`, `app-token` or `simulated`), `stateKey` and `approvedIdentity`;
`readinessBlockers` for identities that are needed but not approved; `portability` with a note; and
`portal.readyBasis` when the portal is enabled.

Run `node .agents/contracts/e2e-ui-test/scripts/check-gates.mjs --skill e2e-ui-test-env-setup --docs-root <docs-e2e-root>` to list the confirmations this operation needs and to validate any existing file.

### 8. Validate statically

Run `node .agents/contracts/e2e-ui-test/scripts/validate-config-module-format.mjs --config <playwright.config.*>`
and `node .agents/contracts/e2e-ui-test/scripts/check-setup.mjs verify --root <repo> --docs-root <docs-e2e-root>`.
Exit code 2 lists setup findings: fix those this operation owns, and report the rest with remediation. List every touched path with a one-line justification; every path must be inside this skill's write set (the ownership rules in `check-file-scope.mjs`).

Finish with `node .agents/contracts/e2e-ui-test/scripts/check-file-scope.mjs check --skill e2e-ui-test-env-setup --root <repo> --docs-root <docs-e2e-root> --since <snapshot> --record`.
Exit code 2 lists out-of-scope changes: undo only changes this operation made, never the developer's
pre-existing work, and report any that remain as blockers. Keep the record under `<docs-e2e-root>/scope/`. In `package.json` only `scripts`, `dependencies` and `devDependencies` may change.

### 9. Hand off for manual review

Include the artifact inventory by necessity from `check-setup.mjs verify` (load-bearing, governance,
inert, and what would make each inert artifact load-bearing) and the portability of each lane.

Report the project mode and setup operation, target/environment, browser projects, agent platform,
dependencies/configuration changed or preserved, the recorded `setup-decisions.json` with any derived
values and their evidence, remediation owners, GitHub workflow gates, static checks, and unresolved
prerequisites.
For Azure, include lane isolation, Entra flow, personas, state handling, and cleanup-blocked journeys.
For Local, include the discovered development-authentication candidates and the options offered, the
confirmed auth mode, manual session/token prerequisites, real, app-token and simulated persona coverage,
identities needed versus approved, and missing local auth or role-hook prerequisites with remediation owners.
List developer-run commands as unexecuted follow-ups and explicitly confirm that no test, browser,
application, endpoint, authentication, token flow, agent, workflow, or results report ran.

## Idempotency and safety

- Reuse existing roots, config, catalog, schema, ledger, gap register, README files, and workflow.
- Preserve stable journey/test identities and unrelated user content.
- Never target production or commit secrets, tokens, auth state, production data, or private results.
- Keep state-changing journeys isolated and blocked until approved deterministic setup and cleanup
  exist.
