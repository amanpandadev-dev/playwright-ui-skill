# Record Existing Setup

Use this operation when a repository already has a working Playwright setup but no
`<docs-e2e-root>/setup-decisions.json`. It makes an established repository usable by
`e2e-ui-test-plan-generator` and `e2e-ui-test-generator` without regenerating anything.

Recording is not repairing. This operation writes one file, `setup-decisions.json`, plus, only after the
developer confirms it, an ignore exception so the handoff files can be committed. If the existing setup
has problems (an incompatible module format, a single-account auth state, a portal workflow that can
never dispatch), record them as findings in the handoff and route them to a later **Reconfigure** or
**New setup** operation. Do not fix them here.

## When to use it

- A Playwright dependency, config, suite or fixture system exists in the owning package, and
- `setup-decisions.json` is absent at the docs root the repository already uses.

If `setup-decisions.json` exists, this is a **Reconfigure** operation instead. If the setup is absent or
incomplete, this is a **New setup** operation.

## Never change

Configuration, fixtures, page objects, specs, scripts, dependencies, lockfiles, agents, MCP settings,
workflows, READMEs, `.env` files, the catalog, plans, the ledger or the gap register. Do not reformat any
of them. Do not run Playwright discovery or any other execution to confirm a value.

## Derive each decision from evidence

Read the repository statically and derive what it shows. Record every derived value's source files in
`evidence` (field name to list of repository-relative paths). Ask the developer only for values the
repository cannot show, and for the confirmations the rules below require.

| Field | Evidence to read | Rule |
| --- | --- | --- |
| `owningPackage` | Nearest `package.json` declaring `@playwright/test` | Derive |
| `moduleFormat` | Config file extension and nearest `package.json` `type` | Derive using [project-modes.md](project-modes.md) precedence |
| `configPath`, `testDir` | The Playwright config file and its `testDir` | Derive |
| `docsRoot` | Location of existing plans, ledger or gap register | Derive; ask when no planning documents exist |
| `applicationId`, `applicationDisplayName` | Catalog `applicationId` and `applicationDisplayName` | Derive from the catalog; otherwise ask. Never infer from folder, package or URL names |
| `lanes[].target`, `environment` | Environment-contract fixture, `.env.e2e.example`, catalog `environmentApplicability`, workflow inputs | Derive one lane per evidenced target |
| `lanes[].authMode` | Auth fixtures and auth-setup specs: MSAL or Entra session capture means `entra`; a call to the application's development-token endpoint means `app-dev-auth`; no authentication means `none` | Derive; ask when fixtures are ambiguous |
| `lanes[].browserProjects` | Config `projects` names, excluding auth-setup projects | Derive |
| `lanes[].personas` | Catalog `businessPersona` and `runtimeAuthProfile`, and role options in fixtures | Derive persona and access profile |
| `personas[].identity` | How a persona reaches the application: role injected by route interception or a mocked access-profile response means `simulated`; a token per persona from the application's development-token endpoint means `app-token`; a separate real identity-provider sign-in per persona means `real` | Derive; when patterns are mixed, ask |
| `lanes[].dataStrategy` | Fixtures and specs: routes fulfilled with fixture JSON means `route-mocks`; setup that creates records through the API means `api-seeded`; fixed shared record identifiers without creation means `existing-dataset` | Derive; when mixed, record the dominant pattern and list the rest as a finding |
| `authStateLocation` | Auth-state path in fixtures or ignores | Derive; required unless `authMode` is `none` |
| `fixtureEntryPoint` | The module exporting the extended `test` | Derive |
| `agentPlatform` | Agent definition files | Present the evidence and **ask**. Agent-platform rules never allow inferring it from files |
| `portal` | Portal workflow file and catalog readiness values | Present the evidence and **ask** whether the portal is wanted. When it is kept but no catalog entry can reach `Ready`, record that as a finding |
| `decidedBy`, `decidedAt`, `sourceCommit` | The confirming developer, today's date, current commit | Ask for `decidedBy`; derive the rest |

Also derive, from `check-setup.mjs discover`:

- `lanes[].authChoice`: record every development-authentication candidate. The existing setup's mode is
  the answer; a real, unused candidate is reported as a finding for a reconfigure operation, never
  switched to silently.
- `lanes[].portability`: `lane-specific` when specs fulfil routes or personas are simulated.
- `portal`: when the existing workflow has no dispatchable entry, record `enabled: false` with the reason;
  the workflow stays in place and is reported as inert.

Missing validation wiring (an `e2e:validate` that does not run every validator) is a finding for a
reconfigure operation: this operation changes no script.

Set `recordedFrom` to `existing-setup` and `contractsVersion` to the current contracts version.

## Make the handoff files committable

Before writing, check whether the handoff files would be ignored:

```text
git check-ignore -v <docs-e2e-root>/setup-decisions.json <docs-e2e-root>/coverage-manifest.json <docs-e2e-root>/requirements-inventory.json
```

A broad rule such as `coverage*.json` silently hides the coverage manifest. When any handoff file is
ignored, propose the narrowest negation lines, for example `!docs/tests_e2e/coverage-manifest.json`, and
add them to the rule's `.gitignore` only after the developer confirms. Never remove or weaken the
existing rule. The gate check below also lists any ignored handoff file, and the plan and test
generators refuse to start until the exception exists.

## Validate and hand off

1. Validate the file against `.agents/contracts/e2e-ui-test/schemas/setup-decisions.schema.json`.
2. Run `node .agents/contracts/e2e-ui-test/scripts/check-gates.mjs --skill e2e-ui-test-plan-generator --docs-root <docs-e2e-root>`.
   It must pass; otherwise report the refusal and correct the recorded values.
3. Hand off: every derived value with its evidence, every value the developer confirmed, the findings
   routed to later operations, any ignore exception added, and the next step. When plans, a ledger or
   catalog entries already exist, the next step is `e2e-ui-test-plan-generator` with scope `adopt-existing`.
   Confirm that nothing other than `setup-decisions.json` and a confirmed ignore exception changed and
   that nothing was executed.
