---
name: e2e-ui-test-coverage-evaluator
description: >
  Evaluate E2E test plans or Playwright tests for coverage completeness and assertion support,
  independently of the skills that wrote them. Runs blocking deterministic gates, then a blinded judge
  that checks whether each test body really establishes its requirement clause, and writes a scored report
  with a PASS, REVIEW or FAIL verdict and findings routed to the owning skill. Use when the user asks
  whether E2E coverage is complete, to audit or grade an E2E plan before approval, to check whether
  Playwright assertions actually prove acceptance criteria, or to run the judge or produce an evaluation
  report. Not for writing or fixing plans or tests (e2e-ui-test-plan-generator, e2e-ui-test-generator), and not for
  debugging or running failing tests. Read-only: writes only evaluation reports and never runs tests or
  browsers.
---

# E2E UI Test Coverage Evaluator

Evaluate generated E2E plans or tests independently of the generators and report a PASS, REVIEW or FAIL verdict with findings routed to the owning skill. This skill is read-only: it writes only to `<docs-e2e-root>/evaluations/` and never fixes a finding.

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

### Stages

| Stage | Inputs | When |
| --- | --- | --- |
| `plan` | setup decisions, inventory, manifest (Draft), plans, ledger, gaps, source specs | Optional, before Gate A — gives the human reviewer a head start |
| `tests` | all of the above + specs, catalog, manifest evidence | Gate B, mandatory |

All evaluation runs through `.agents/contracts/e2e-ui-test/scripts/evaluate.mjs`, which checks the entry gate itself.
Exit code 2 means the stage inputs are incomplete: report which input is missing and evaluate nothing.

### 1. Run the deterministic gates

Read [references/deterministic-gates.md](references/deterministic-gates.md), then preview the gates:

```text
node .agents/contracts/e2e-ui-test/scripts/evaluate.mjs report --stage <plan|tests> --root <repo> --docs-root <docs-e2e-root> [--catalog <catalog>] --typescript <typescript.js> --dry-run
```

A failed blocking gate decides the verdict (`FAIL`), but still complete the evaluation so the report lists
every finding. Never import Playwright or compile or execute test code.

### 2. Run the blinded judge

Read [references/judge-protocol.md](references/judge-protocol.md). At the plan stage, run
`prepare-judge --stage plan` and collect only the criterion re-derivation samples. At the tests stage, prepare
the obligation and re-derivation bundles:

```text
node .agents/contracts/e2e-ui-test/scripts/evaluate.mjs prepare-judge --root <repo> --docs-root <docs-e2e-root> --catalog <catalog> --typescript <typescript.js>
```

For each bundle, collect three samples. Dispatch **batched by sample number**: `prepare-judge` writes one prompt per
sample number, already filled in with absolute paths, to `<judge-dir>/prompts.json` under `batches`. Dispatch those
(normally three) in **one parallel wave**, one fresh sub-agent each, passing each `prompt` unchanged; never type the
prompts yourself. This replaces one agent per bundle sample, which costs a startup context each (138 agents for 46
bundles). The protocol's "Batched dispatch" section says what this changes. Then run
`evaluate.mjs judge-status --root <repo> --judge <judge-dir>`: exit 3 lists `missingBatches`, so re-dispatch only
those. If a batch is still missing samples after one retry, fall back to the single-bundle prompts in `samples`
(`--per-sample`). State the dispatch mode in the hand-off and pass it to `report` as `--dispatch batched` (or
`per-sample`), so the report records it. Do not show a sub-agent the manifest,
plans, ledger, catalog, other samples or any generator transcript, and do not read the bundles yourself before
sampling finishes. Prefer a model other
than the one that generated the tests. The judge follows
[references/semantic-review.md](references/semantic-review.md) and rejects the mappings in
[references/unsupported-mappings.md](references/unsupported-mappings.md). Never invoke browser agents.

### 3. Produce the report

Read [references/scoring-and-verdict.md](references/scoring-and-verdict.md) and
[references/report-format.md](references/report-format.md), then run:

```text
node .agents/contracts/e2e-ui-test/scripts/evaluate.mjs report --stage <plan|tests> --root <repo> --docs-root <docs-e2e-root> [--catalog <catalog>] --typescript <typescript.js> [--judge <judge-dir> --model <judge-model-id>]
```

It writes a JSON and a Markdown report under `<docs-e2e-root>/evaluations/`, and, when `--judge` is given, a
`judge-report-<stage>-<time>.json` and `.md` beside them: the committed record of each obligation's judge outcome,
every sample's justification and cited line, the model and the dispatch mode. The judge folder itself is working data
that is not committed. `evaluate.mjs judge-report` writes only that record for an evaluation that already exists.
The report and exits 0 for `PASS`, 3 for
`REVIEW` and 4 for `FAIL`. Never edit a report by hand; rerun the engine instead.

### 4. Hand off

Report the verdict and its reason, the gate results, the counts, the scored and omitted dimensions with the
weight coverage, and the findings grouped by route. Each finding goes to the skill named in `routeTo`, or to
a human for judge disagreements; report findings and never resolve them yourself. A plan-stage evaluation is
`REVIEW` at best by design, because the human Gate A review approves plans. Execution remains `NotRun`
unless execution evidence was supplied through `e2e-ui-test-verify-run` (gate G-D13).

## Idempotency and safety

- Reuse existing roots, config, catalog, schema, ledger, gap register, README files, and workflow.
- Preserve stable journey/test identities and unrelated user content.
- Never target production or commit secrets, tokens, auth state, production data, or private results.
- Keep state-changing journeys isolated and blocked until approved deterministic setup and cleanup
  exist.
