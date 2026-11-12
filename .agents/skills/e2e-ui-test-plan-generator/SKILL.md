---
name: e2e-ui-test-plan-generator
description: >
  Plan E2E browser test coverage before any Playwright code exists: an independent requirements inventory
  with verbatim acceptance criteria, a coverage manifest of decomposed obligations, per-story journey
  plans with stable TC-Jxx IDs, a coverage ledger and a gap register, all marked Draft for human review.
  Handles incremental, replacement and full-coverage sweeps, and adopts existing E2E plans or ledgers that
  lack a coverage manifest. Use when the user asks for an E2E or browser test plan from specs or PRDs, a
  coverage sweep, a coverage ledger or gap register, or to break acceptance criteria into browser-testable
  obligations. Requires setup-decisions.json. Not for Playwright spec code (e2e-ui-test-generator), grading
  plans or tests (e2e-ui-test-coverage-evaluator), Playwright configuration (e2e-ui-test-env-setup), or unit, integration
  and API test cases (test-case-generator). Never writes .spec.ts files and never runs anything.
---

# E2E UI Test Plan Generator

Generate reviewable E2E plans before any test code exists: the independent requirements inventory, the coverage manifest, per-story journey plans, the coverage ledger and the gap register, all marked `Draft` for human review. This skill does not write `.spec.ts` files, catalog entries or configuration, and never sets a plan to `Approved`.

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

Require a valid `<docs-e2e-root>/setup-decisions.json` whose `contractsVersion` satisfies this skill. If it is absent or invalid, stop and request `e2e-ui-test-env-setup`.

Run `node .agents/contracts/e2e-ui-test/scripts/check-gates.mjs --skill e2e-ui-test-plan-generator --docs-root <docs-e2e-root>` before any other step. Exit code 2 means refuse: report its remediation verbatim and write nothing.
Then record the starting state so the touched-files check (gate G-D11) can separate this operation from the
developer's uncommitted work: `node .agents/contracts/e2e-ui-test/scripts/check-file-scope.mjs snapshot --root <repo> --out <temp file outside the repository>`.

### 2. Ground in the repository

Inspect repository status, package ownership, manifests, lockfiles, Node declarations, Playwright
artifacts, agent/MCP configuration, documentation, UI routes/components, API clients, auth/RBAC,
accessible selectors, test data, ignored paths, and GitHub Actions. Preserve unrelated and uncommitted
changes. Reuse one valid owning Playwright setup instead of creating a parallel runner.

### 3. Choose the scope

Read [references/scope-modes.md](references/scope-modes.md) and record exactly one `scope.type` in the
coverage manifest:

- **setup-initial** for the first plan after `e2e-ui-test-env-setup` created a new setup.
- **adopt-existing** when the repository already has plans, a ledger, a gap register or catalog entries
  but no requirements inventory or coverage manifest. Follow
  [references/adopt-existing-coverage.md](references/adopt-existing-coverage.md).
- **incremental** for exact new story or feature coverage.
- **replacement** only for developer-named plans or journey IDs plus changed requirements.
- **full-sweep** only for an explicit requirements manifest, a deterministic story-ID rule, and a
  statement that every manifest story is in scope. It is add-only; discovery never expands scope.
- **smoke-sample** only when the developer explicitly asks for a limited sample; label every artifact.

Dependencies, lockfiles, configuration, projects, scripts, agents, MCP settings, ignores, fixtures and
workflows belong to `e2e-ui-test-env-setup`. If planning needs any of them changed, stop and request a setup
operation. Broad phrases such as "latest changes," "remaining stories," or "regenerate" do not establish
scope; ask for exact identifiers and authority.

### 4. Select the requirements authority

Use one primary authority: an explicitly requested source path; an explicitly supplied spec or PRD;
otherwise implementation specs, then PRD, then implemented UI. Supporting inputs may ground routes,
selectors, response shapes, and assumptions but cannot expand confirmed scope.

Require a browser-observable surface. Do not fabricate browser flows for backend-only behavior. For a
greenfield contract without UI, keep unknown routes, selectors, API shapes, and auth dependencies as
assumptions or implementation-blocked coverage with actionable remediation.

### 5. Inventory, decompose and plan

Read [references/coverage-completeness.md](references/coverage-completeness.md) and
[references/requirement-extraction.md](references/requirement-extraction.md) before authoring. For
`setup-initial`, `adopt-existing` and `full-sweep` scopes, enumerate the full authority manifest before
planning. For `incremental` and `replacement` scopes, inventory the exact scope and existing coverage
before changing files.

Write the requirements inventory as schema 1.1 in a separate extraction pass, reading only the authority:
account for every content unit under every criteria heading (gate G-D01); when the authority owns
requirement identifiers such as FR or NFR, make them requirement groups with rolled-up statuses (gate
G-D02); and record each obligation's `plannedJourneys` (gate G-D06). Follow
[references/coverage-manifest.md](references/coverage-manifest.md).

Derive journey count from every in-scope criterion and its independently verifiable obligations.
Never substitute representative samples or a fixed journey count for complete coverage. Honor an
explicit smoke/sample request but label its limited scope. Batch large manifests after full inventory;
persist completed, incomplete, and blocked obligations in a continuation checklist.

Read [references/coverage-manifest.md](references/coverage-manifest.md). Extract the independent
authority inventory before authoring; preserve verbatim source, heading, stable IDs, and fingerprints.
Decompose mixed browser/internal criteria without suppressing their observable actions. Treat existing
mappings as unverified claims until their bodies and helpers have been reviewed. Add missing portions
of existing criteria; correct scoped inaccurate metadata without replacing valid behavior or IDs.
Record authority/implementation conflicts and continue unaffected work; never silently copy an
implementation's conflicting expected result into a requirement-based test.

Produce these planning artifacts for new obligations, scoped metadata repairs, or developer-approved
behavioral revisions:

- a traceable Markdown plan with stable `TC-Jxx` journeys and the planned assertions for each obligation;
- in `api-seeded` and `existing-dataset` lanes, `dataRequirements` for every browser obligation (entities and
  states, variants derived from the criterion, whether it changes data), per
  [../../contracts/e2e-ui-test/test-data.md](../../contracts/e2e-ui-test/test-data.md); an obligation that changes data in a lane
  without a cleanup contract is planned `Blocked`;
- synchronized repository coverage-ledger and gap-register entries;
- the independent requirements inventory and one versioned coverage manifest with review status `Draft`.
  Leave `assertionReferences` and `mockingScope` empty; `e2e-ui-test-generator` fills them after approval.

Mark an obligation with a planned journey `Planned`; it needs no blocker. Use `Blocked` only for a real
blocker, never for "not authored yet". Put everything `e2e-ui-test-generator` will later write into a plan
(authoring status, test IDs, assertion references, semantic review) inside
`<!-- coverage-view:start -->` ... `<!-- coverage-view:end -->` regions, with no level-1 or level-2
heading inside them; the approval fingerprint ignores those regions, so authoring does not void approval.
Every `Blocked`, `NotBrowserObservable` or `OutOfScope` status needs a distinct blocker plus remediation
action and owner. Plan journeys only
against evidenced roles and access profiles, routes, and non-production data; never plan guessed roles,
shared production data or fabricated routes. Record missing shared infrastructure as a blocker for
`e2e-ui-test-env-setup`.

Write the inventory, the obligations and the plan prose yourself, then derive everything else with the sync script;
never hand-edit criterion or group rollups, the `setupDecisionsRef` and `requirementsInventoryRef` fingerprints, the
`coverage-data` and `coverage-groups` blocks, or the status cells of tables in coverage-view regions:

```text
node .agents/contracts/e2e-ui-test/scripts/sync-coverage.mjs --skill e2e-ui-test-plan-generator --root <repo> --docs-root <docs-e2e-root> --refresh-refs [--patch <patch.json>]
```

A patch outside the repository (`{"obligations": [{"obligationId", "set": {...}}]}`, `null` removes a field) edits
existing obligations, for example a re-plan that changes a persona; new obligations and plans go into the manifest
directly, then sync. A document without a projection block gets one appended. Exit 2 means the patch was refused and
nothing was written; exit 1 means coverage is still invalid: fix what it lists and sync again. A sync over unchanged
documents writes nothing.

Record scenario applicability and source conflicts with [references/scenario-applicability.md](references/scenario-applicability.md), author plans with [references/plan-authoring.md](references/plan-authoring.md), and place scoped artifacts with [references/layout-scoped.md](references/layout-scoped.md).

### 6. Mark the plan for review

Set the manifest review status to `Draft` and present [references/review-checklist.md](references/review-checklist.md), pre-filled with counts. Only a human sets `Approved`.

### 7. Hand off

Report the scope type and the source-owned identifier, story, criterion, obligation, browser-observable,
planned-journey, blocked and not-browser-observable counts, with every identifier's rolled-up status. Require zero unaccounted obligations and zero criteria whose child
obligations are missing from the manifest. Every browser-observable obligation needs a planned journey
or a substantiated blocker. For `adopt-existing`, also report the discrepancy findings between existing
artifacts and the authority. State that the plan is `Draft`, that test code is authored only after
approval, and that execution is `NotRun`. Direct the developer to Gate A review and then to
`e2e-ui-test-generator`.

Finish with `node .agents/contracts/e2e-ui-test/scripts/check-file-scope.mjs check --skill e2e-ui-test-plan-generator --root <repo> --docs-root <docs-e2e-root> --since <snapshot> --record`.
Exit code 2 lists out-of-scope changes and writes no record: undo only changes this operation made, never the
developer's pre-existing work, then run the check again; report any that remain as blockers. A needed change to
`setup-decisions.json` belongs to `e2e-ui-test-env-setup`, never to this operation. Keep the record under
`<docs-e2e-root>/scope/` and never delete a scope record.

## Idempotency and safety

- Reuse existing roots, config, catalog, schema, ledger, gap register, README files, and workflow.
- Preserve stable journey/test identities and unrelated user content.
- Never target production or commit secrets, tokens, auth state, production data, or private results.
- Keep state-changing journeys isolated and blocked until approved deterministic setup and cleanup
  exist.
