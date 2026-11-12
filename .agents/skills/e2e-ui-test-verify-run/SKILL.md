---
name: e2e-ui-test-verify-run
description: >
  Turn a developer's run of newly generated Playwright specs against a local or dev lane into recorded execution
  evidence: map every result to its testId, classify each failure as Mechanical, Environment, Behavioural or
  Unclassified, repair only Mechanical failures (locators, waits, navigation) within limits that
  check-repair-diff.mjs enforces, ask for a re-run, and record executionStatus in the coverage manifest. Use after
  e2e-ui-test-generator when the user asks to verify, check, fix or record a run of generated E2E tests, to repair
  broken locators from a Playwright report, or to record which tests passed. Not for writing new tests or changing
  what a test asserts (e2e-ui-test-generator), grading coverage (e2e-ui-test-coverage-evaluator), or setup and
  ignores (e2e-ui-test-env-setup). Never runs Playwright, browsers or applications itself: the developer runs the
  specs and supplies the report.
---

# E2E UI Test Verify Run

Record what happened when a developer ran the generated specs, and repair the failures that are test bugs. This
skill does not write new tests, change assertions, plans, obligations, coverage status, fixtures, configuration or
workflows. The design and the reasons for each limit are in
[docs/guide/E2E-RUNTIME-FEEDBACK-DESIGN.md](../../../docs/guide/E2E-RUNTIME-FEEDBACK-DESIGN.md).

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

This skill keeps invariant 1: the developer runs Playwright, and this skill only reads the report they supply. The
run reports it writes transcribe that supplied evidence (invariant 3). They never contain a result the developer's
report does not.

## Workflow

### 1. Check entry gates

Run `node .agents/contracts/e2e-ui-test/scripts/check-gates.mjs --skill e2e-ui-test-verify-run --docs-root <docs-e2e-root>`
before any other step. Exit code 2 means refuse: report its remediation verbatim and write nothing. It requires an
approved, unchanged plan, a test generator scope record, a non-production lane, and git-ignored raw Playwright
output under `<docs-e2e-root>/runs/*/playwright/`.

Then record the starting state for gate G-D11:
`node .agents/contracts/e2e-ui-test/scripts/check-file-scope.mjs snapshot --root <repo> --out <temp file outside the repository>`.

### 2. Establish the run

Confirm, or ask once for:

- the **lane** from `setup-decisions.json` (`laneId`). Refuse a production environment;
- the **run ID**: reuse the current one when continuing, otherwise the current time as `YYYYMMDD-HHmm`;
- the **specs**: by default, the spec files that the latest `scope/test-*.json` record lists as added or modified.

The attempt number is 1 for a new run ID, otherwise one more than the highest `run-<n>.json` in
`<docs-e2e-root>/runs/<run-id>/`.

### 3. Ask the developer to run the specs

Never run them yourself. Give the developer the command for their shell, with the lane's environment variables from
the repository README, and wait until they say it has finished:

```bash
PLAYWRIGHT_JSON_OUTPUT_NAME=<docs-e2e-root>/runs/<run-id>/playwright/report-<n>.json npx playwright test <specs> --project <project> --reporter=json --retries=1 --trace=retain-on-failure --output=<docs-e2e-root>/runs/<run-id>/playwright/artifacts-<n>
```

```powershell
$env:PLAYWRIGHT_JSON_OUTPUT_NAME = "<docs-e2e-root>/runs/<run-id>/playwright/report-<n>.json"; npx playwright test <specs> --project <project> --reporter=json --retries=1 --trace=retain-on-failure --output=<docs-e2e-root>/runs/<run-id>/playwright/artifacts-<n>
```

The flags leave the Playwright config unchanged. `--retries=1` keeps noise from the dev environment from counting
as a failure. If the developer cannot run it (no dev environment, no credentials), stop and report an environment
blocker for `e2e-ui-test-env-setup`.

### 4. Classify

```text
node .agents/contracts/e2e-ui-test/scripts/record-execution.mjs classify --root <repo> --docs-root <docs-e2e-root> --report <docs-e2e-root>/runs/<run-id>/playwright/report-<n>.json --run-id <run-id> --attempt <n> --lane <laneId> [--typescript <typescript.js>]
```

It writes `runs/<run-id>/run-<n>.json` and prints every failure as `REPAIR` or `BLOCK` with its class and reason.
Read [references/failure-classes.md](references/failure-classes.md) for what each class means and who owns it. List
`UNMAPPED` tests as findings for `e2e-ui-test-generator`; never guess their testId. A parameterized title does not need its
testId: the case value that differs between the loop's titles (`(cxo)` for `US001-J03-cxo`) is enough. The script also
prints Playwright's own totals and any `RUN ERROR` raised outside a test; when a `WARN count differs` line appears, the
dashboard would not show every result, so stop and report it.

### 5. Repair Mechanical failures

Repair only failures printed as `REPAIR`, and only while `<n>` is at most 2. After two repair rounds, remaining
Mechanical failures become blockers. Follow [references/repair-rules.md](references/repair-rules.md):

1. Snapshot the test sources: `node .agents/contracts/e2e-ui-test/scripts/check-repair-diff.mjs snapshot --root <repo> --docs-root <docs-e2e-root> --out <temp file outside the repository>`.
2. For each failure, read its `error-context.md` (page snapshot at the failure) and trace from the git-ignored
   `artifacts-<n>` folder, plus the application source. Choose the corrected locator from what actually rendered.
   Never invent a label or role.
3. For `assertion-locator-unresolved`, repair only when the snapshot shows the same element under another role or
   name. When the element is not there, treat it as Behavioural: leave the test unchanged and report a possible
   defect, and record the overrule in `triage-<n>.json` (`classifierDisagreement`, step 7) so `pipeline-status` stops
   asking for a repair.
4. Check the repair:
   `node .agents/contracts/e2e-ui-test/scripts/check-repair-diff.mjs check --root <repo> --docs-root <docs-e2e-root> --since <snapshot> --report <docs-e2e-root>/runs/<run-id>/repair-<n>.json`.
   Exit 2 lists forbidden changes. Restore each rejected file to its snapshot content, then either make an allowed
   repair or leave that failure unrepaired. Never weaken a test to make a check pass.
5. When any spec was repaired, ask the developer to run attempt `<n + 1>` (step 3), then classify it (step 4).

### 6. Record execution

When no `REPAIR` failures remain, every remaining one is overruled in a valid triage, or the repair rounds are used up,
record the latest attempt:

```text
node .agents/contracts/e2e-ui-test/scripts/record-execution.mjs record --root <repo> --docs-root <docs-e2e-root> --run <docs-e2e-root>/runs/<run-id>/run-<n>.json [--typescript <typescript.js>] [--catalog <catalog>]
```

It refuses a run whose specs changed after it ran: ask for a new attempt instead. It sets `executionStatus` and
`resultReference` through `sync-coverage.mjs`. Coverage status never changes here: a failing test leaves its
obligation `Covered` with `executionStatus: Failed`. Never hand-edit the manifest, ledger, gap register or plans.

### 7. Explain the run in a dashboard

Write `runs/<run-id>/triage-<n>.json` and render `runs/<run-id>/dashboard-<n>.html`, following
[references/run-dashboard.md](references/run-dashboard.md). It gives every failed or flaky test what went wrong, the
evidence, one fault and the fix, and keeps `DeveloperBug` and `AgentTestBug` visibly apart. Do this for every
classified attempt, including one with no failures. `pipeline-status` keeps the step on `verify` ("explain attempt
<n>") until `dashboard-<n>.html` exists, and `triage-<n>.json` too when any test did not simply pass. The page is a
transcription: never state a result the developer's report does not hold.

### 8. Hand off

Finish with `node .agents/contracts/e2e-ui-test/scripts/check-file-scope.mjs check --skill e2e-ui-test-verify-run --root <repo> --docs-root <docs-e2e-root> --since <snapshot> --record`.
Exit code 2 lists out-of-scope changes and writes no record: undo only changes this operation made, then check
again.

Report:

- per test and project: outcome, failure class and reason, and the action taken;
- each repair: the file, the old and new locator or wait, and the `repair-<n>.json` report;
- blockers by owner: Environment to `e2e-ui-test-env-setup`, Behavioural and Unclassified to a person (a possible
  application defect; the test is unchanged), Mechanical failures left after two repair rounds to
  `e2e-ui-test-generator`, and unmapped tests to `e2e-ui-test-generator`;
- the run reports written and the obligations whose execution status changed;
- the path of the dashboard, with the count of developer bugs and agent test-code bugs.

Then direct the developer to run `e2e-ui-test-coverage-evaluator`. Confirm that this skill ran no Playwright,
browser, application or authentication flow, and that every result came from the developer's report.

## Idempotency and safety

- Never overwrite a run report or repair report; a new attempt gets a new number.
- Raw Playwright output (reports, traces, error context, screenshots) stays git-ignored and is never copied into
  committed files, because it can contain page text and personal data.
- Never target production, and never commit secrets, tokens, auth state or production data.
- Preserve unrelated and uncommitted changes. Change only test sources under `testDir`, never fixtures, synthetic-data
  builders, the catalog or configuration.
