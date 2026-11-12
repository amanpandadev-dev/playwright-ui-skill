---
name: e2e-ui-test-generator
description: >
  Write Playwright .spec.ts tests from an approved E2E plan and coverage manifest: concrete actions and
  assertions per obligation, stable testId metadata, catalog v3 entries, and assertion evidence recorded
  in the manifest, reusing the repository's fixtures. Also reviews tests the manifest lists as claimed and
  records their evidence, and repairs catalog metadata such as titles without changing test identity.
  Refuses unless the plan is Approved and unchanged. Use when the user asks to implement, write or
  generate Playwright specs or catalog entries for an approved plan, record assertion evidence for claimed
  tests, or rename a catalog test. Not for creating or changing E2E plans (e2e-ui-test-plan-generator), grading
  coverage (e2e-ui-test-coverage-evaluator), or unit, integration and API tests (test-case-generator). Never
  changes plan scope, configuration, fixtures or workflows, and never runs tests or browsers.
---

# E2E UI Test Generator

Generate Playwright `.spec.ts` tests, catalog entries and manifest assertion evidence from an approved plan. This skill does not change plan scope, obligations, gap classifications, shared fixtures, configuration or workflows.

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

Before reading application source, follow [code-navigation.md](../../contracts/e2e-ui-test/code-navigation.md): query
the graph with a token budget, then read only the lines it points to.

## Workflow

### 1. Check entry gates

Refuse to start unless the coverage manifest review status is `Approved` and the plan, source specs and `setup-decisions.json` are unchanged since approval. Report the exact remediation that `check-gates.mjs` prints.

Run `node .agents/contracts/e2e-ui-test/scripts/check-gates.mjs --skill e2e-ui-test-generator --docs-root <docs-e2e-root>` before any other step. Exit code 2 means refuse: report its remediation verbatim and write nothing. Never set or edit the manifest review status.
Then record the starting state so the touched-files check (gate G-D11) can separate this operation from the
developer's uncommitted work: `node .agents/contracts/e2e-ui-test/scripts/check-file-scope.mjs snapshot --root <repo> --out <temp file outside the repository>`.

### 2. Ground in the repository

Inspect repository status, package ownership, manifests, lockfiles, Node declarations, Playwright
artifacts, agent/MCP configuration, documentation, UI routes/components, API clients, auth/RBAC,
accessible selectors, test data, ignored paths, and GitHub Actions. Preserve unrelated and uncommitted
changes. Reuse one valid owning Playwright setup instead of creating a parallel runner.

### 3. Keep setup and scope frozen

Dependencies, lockfiles, configuration, projects, scripts, agents, MCP settings, ignores, shared
fixtures and workflows belong to `e2e-ui-test-env-setup`; if authoring needs any of them changed, stop and
request a setup operation. Scope comes only from the approved coverage manifest: author tests for its
obligations and nothing else. A request for other stories is new planning for `e2e-ui-test-plan-generator`.

### 4. Author tests and evidence

Produce these artifacts for the approved obligations, scoped metadata repairs, or developer-approved
behavioral revisions:

- a matching `.spec.ts` with concrete behavior and stable machine metadata independent of its title;
- one schema-v3 catalog entry for every generated or revised test, including explicit ineligibility;
- assertion evidence in the coverage manifest: `assertionReferences`, `mockingScope`, test IDs and the
  resulting obligation statuses, with execution status kept separate.

For obligations carrying `claimedTests` (recorded by the plan generator's `adopt-existing` scope), review
each claimed test body before trusting it. When it supports the obligation, move its ID into `testIds`
with assertion references and clear the claim. When it does not, keep the ID out of `testIds`, report an
unsupported claim, and author the missing coverage.

In plans, the ledger and the gap register, update only the `<!-- coverage-data -->` projection blocks
and the `<!-- coverage-view:start -->` ... `<!-- coverage-view:end -->` regions; all other content in those
documents belongs to `e2e-ui-test-plan-generator`. Never add a heading or journey inside a coverage-view region.

Record every obligation change with the sync script; never hand-edit the manifest's obligations, rollups or
assertion fingerprints, the `coverage-data` and `coverage-groups` blocks, or the status, blocker, remediation, owner
and test-ID cells of tables in coverage-view regions. Write a patch file outside the repository (or git-ignored):

```json
{"obligations": [
  {"obligationId": "<id>", "set": {"coverageStatus": "Covered", "testIds": ["TC-J01"], "review": {"status": "Supported", "trigger": "...", "input": "...", "action": "...", "assertions": "...", "limitations": "...", "reviewer": "e2e-ui-test-generator"}, "blocker": null, "remediation": null, "owner": null, "blockedActivity": null},
   "evidence": [{"testId": "TC-J01", "path": "<spec or helper path>", "anchor": "<@e2e-evidence anchor>"}]},
  {"obligationId": "<id>", "set": {"coverageStatus": "Blocked", "blocker": "...", "remediation": "...", "owner": "...", "blockedActivity": "..."}}
]}
```

```text
node .agents/contracts/e2e-ui-test/scripts/sync-coverage.mjs --skill e2e-ui-test-generator --root <repo> --docs-root <docs-e2e-root> --patch <patch.json> [--catalog <catalog>] [--typescript <typescript.js>]
```

It applies the patch (`null` removes a field), computes the evidence fingerprints, rolls statuses up, rebuilds every
projection and those view cells, then validates coverage. It refuses (exit 2, nothing written) plan-owned fields,
`Planned`, evidence without a review in the same patch, and `Covered` without a `Supported` review, and it never
changes the approved plan fingerprint. Add catalog entries before recording evidence for a new test. Exit 1 means
coverage is still invalid: fix what it lists and sync again. Other visible prose and tables in those documents
still follow the rules above.
Move every `Planned` obligation to `Covered` with evidence, or to `Blocked` with a precise blocker; none may
remain `Planned` when authoring is complete. Every non-covered status or catalog reason needs a distinct
blocker plus remediation action and owner.
Never use empty tests, always-passing assertions, guessed roles/access profiles, shared production
data, or fabricated routes. Reuse shared fixtures in non-setup modes; missing shared infrastructure is
a setup blocker, not permission to change it.

In `api-seeded` and `existing-dataset` lanes, generate the synthetic data module from the plan's
`dataRequirements` as [../../contracts/e2e-ui-test/test-data.md](../../contracts/e2e-ui-test/test-data.md) describes: seeded builders,
creation through the application's API as the seeding persona, namespaced records with registered cleanup,
reserved-domain values, returned identifiers only, and mocks only for declared external dependencies.

Author suites with [references/suite-authoring.md](references/suite-authoring.md), record evidence with [references/assertion-evidence.md](references/assertion-evidence.md), avoid [references/unsupported-mappings.md](references/unsupported-mappings.md), and apply scoped repairs with [references/metadata-repair.md](references/metadata-repair.md). Corrections to manifest obligations, plans or the ledger go back to `e2e-ui-test-plan-generator`.

### 5. Synchronize the catalog

Read [references/catalog-sync.md](references/catalog-sync.md) whenever tests or catalog
entries change. Use the repository catalog schema that `e2e-ui-test-env-setup` specialized from
[../../contracts/e2e-ui-test/schemas/test-catalog.schema.json](../../contracts/e2e-ui-test/schemas/test-catalog.schema.json);
if a needed controlled value is missing, stop and request a setup operation rather than editing the
schema. Maintain full-inventory schema-v3 synchronization by stable `applicationId + testId`.

### 6. Validate statically

Apply the checks in the referenced completeness, suite-authoring, catalog and assertion-evidence
contracts. Prefer the bundled static scripts:

```text
node .agents/contracts/e2e-ui-test/scripts/inventory-tests.mjs --test-root <testDir> --output <inventory.json>
node .agents/contracts/e2e-ui-test/scripts/validate-catalog.mjs --catalog <catalog> --schema <schema> --inventory <inventory> --docs-root <docs-e2e-root>
node .agents/contracts/e2e-ui-test/scripts/validate-coverage.mjs --root <repo> --requirements <requirements-inventory.json> --manifest <coverage-manifest.json> --catalog <catalog> --typescript <typescript.js>
```

Parse JSON/YAML, resolve local imports, check template sentinels, reconcile config/README/env/catalog/
ledger/gap data, inspect diffs, and scan for `test.only`, hard-coded secrets, forbidden services,
unintended workflow changes, or result claims. Do not import Playwright or compile/execute test code.

After structural validation, perform [../e2e-ui-test-coverage-evaluator/references/semantic-review.md](../e2e-ui-test-coverage-evaluator/references/semantic-review.md)
inline or with a human: inspect actual triggers, inputs, actions, assertions, and helper implementations
for each claim. Metadata, keywords, an `expect` call, and simulated responses are not semantic proof.
Resolve unsupported mappings before declaring authoring complete; never invoke browser agents.

### 7. Hand off

Finish with `node .agents/contracts/e2e-ui-test/scripts/check-file-scope.mjs check --skill e2e-ui-test-generator --root <repo> --docs-root <docs-e2e-root> --since <snapshot> --record`.
Exit code 2 lists out-of-scope changes and writes no record: undo only changes this operation made, never the
developer's pre-existing work, then run the check again; report any that remain as blockers. Keep the record under
`<docs-e2e-root>/scope/` and never delete a scope record. The evaluator fails gate G-D11 without this record.

Report generated, revised and blocked tests with remediation, catalog counts, static-check results and every
touched path with a one-line justification. State portability from each lane's `portability` in
`setup-decisions.json`: which generated assets are reusable on another target (page objects, pure assertion
helpers, plans, catalog metadata) and which are lane-specific (route-mocked specs, local auth or
development-token fixtures). Label each persona's evidence as `real`, `app-token` or `simulated`. Then
direct the developer to run `e2e-ui-test-coverage-evaluator`.
Confirm that nothing was executed.

## Idempotency and safety

- Reuse existing roots, config, catalog, schema, ledger, gap register, README files, and workflow.
- Preserve stable journey/test identities and unrelated user content.
- Never target production or commit secrets, tokens, auth state, production data, or private results.
- Keep state-changing journeys isolated and blocked until approved deterministic setup and cleanup
  exist.
