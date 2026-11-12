# E2E UI test contracts

Shared contracts for the E2E skills `e2e-ui-test-env-setup`, `e2e-ui-test-plan-generator`, `e2e-ui-test-generator`,
`e2e-ui-test-verify-run` (optional), `e2e-ui-test-coverage-evaluator` and `e2e-ui-test-orchestrator`, which runs the others end to end. This package is not a skill and has no `SKILL.md`. It works for any web application:
nothing here assumes a domain, framework, database or identity provider.

| Path | Contents |
| --- | --- |
| `schemas/` | Setup decisions, requirements inventory, coverage manifest, test catalog v3, verify-run report, evaluation report |
| `scripts/` | Static validators, entry gates, setup checks and the evaluator. They never import Playwright or run tests |
| `templates/` | Playwright config, fixture and journey-plan templates, including the synthetic-data generator |
| `GUIDE.md` | How the skills work together, with diagrams, the orchestrator, usage and test data |
| `invariants.md` | Rules copied verbatim into every E2E skill |
| `test-data.md` | The synthetic test-data contract |

Skills declare the contracts they need (`Requires contracts: ^x.y.z`); `CONTRACTS_VERSION` holds the current
version, which is stamped into every handoff file.

## How the skills hand off

1. **`e2e-ui-test-env-setup`** records `setup-decisions.json`: target, authentication, personas, browsers, test-data
   strategy, portal and agent platform, each from evidence or an explicit answer.
2. **`e2e-ui-test-plan-generator`** writes the requirements inventory, the coverage manifest, plans, the ledger and the
   gap register, all `Draft`.
3. A human approves the plan (Gate A): the manifest `review` block records the plan fingerprint.
4. **`e2e-ui-test-generator`** refuses unless the plan is approved and unchanged, then writes specs, catalog entries
   and assertion evidence.
5. Optionally, a developer runs the new specs against a local or dev lane, and **`e2e-ui-test-verify-run`** classifies
   the results, repairs mechanical failures within `check-repair-diff.mjs` limits (the developer re-runs), and records
   `executionStatus` in the manifest.
6. **`e2e-ui-test-coverage-evaluator`** runs the deterministic gates and the blinded judge, and routes every finding to
   the skill that owns it.

## Commands

Discovery and setup:

```text
node .agents/contracts/e2e-ui-test/scripts/check-setup.mjs discover --root <repo>
node .agents/contracts/e2e-ui-test/scripts/check-setup.mjs verify --root <repo> --docs-root <docs-e2e-root>
```

`discover` needs no setup decisions. It lists development-authentication candidates with their guards and
roles, data seams (create, delete, reset and seed interfaces), validation wiring, auth-state references, route
mocking, portal readiness and Playwright agent definitions: evidence to inspect before asking questions.
`verify` checks `setup-decisions.json` against the repository and prints each E2E artifact as load-bearing,
governance or inert.

Validation (what a generated `e2e:validate` script runs):

```text
node .agents/contracts/e2e-ui-test/scripts/validate-all.mjs --docs-root <docs-e2e-root> [--root <repo>] [--typescript <typescript.js>]
```

It runs setup conformance, test inventory, catalog, config module format and coverage completeness. A missing
coverage manifest fails, so completeness is never skipped silently. The individual validators are:

```text
node .agents/contracts/e2e-ui-test/scripts/inventory-tests.mjs --test-root <testDir> --output <inventory.json> --typescript <typescript.js>
node .agents/contracts/e2e-ui-test/scripts/validate-catalog.mjs --catalog <catalog> --schema <schema> --inventory <inventory> --docs-root <docs-e2e-root>
node .agents/contracts/e2e-ui-test/scripts/validate-config-module-format.mjs --config <playwright.config.*>
node .agents/contracts/e2e-ui-test/scripts/validate-coverage.mjs --root <repo> --requirements <requirements-inventory.json> --manifest <coverage-manifest.json> --catalog <catalog> --typescript <typescript.js> [--stage plan|tests]
```

Entry gates (exit 0 proceed, 2 refuse with remediation, 1 usage error):

```text
node .agents/contracts/e2e-ui-test/scripts/check-gates.mjs --skill <e2e-ui-test-env-setup|e2e-ui-test-plan-generator|e2e-ui-test-generator> --docs-root <docs-e2e-root>
node .agents/contracts/e2e-ui-test/scripts/check-gates.mjs --skill e2e-ui-test-coverage-evaluator --docs-root <docs-e2e-root> --stage <plan|tests> [--catalog <catalog>]
node .agents/contracts/e2e-ui-test/scripts/check-gates.mjs --print-fingerprints --docs-root <docs-e2e-root>
```

Approving a plan is a human action: print the fingerprints, then record them in the manifest `review` block with
`status: "Approved"`, reviewer, date and commit. [GUIDE.md section 6.4](GUIDE.md#64-approving-a-plan-gate-a) lists the exact
values and formats.

Pipeline status (what `e2e-ui-test-orchestrator` runs to choose the next step):

```text
node .agents/contracts/e2e-ui-test/scripts/pipeline-status.mjs --root <repo> --docs-root <docs-e2e-root> [--catalog <catalog>] [--json]
```

Touched files (gate G-D11): each generating skill snapshots before it works and records its changes afterwards.
No record is written while out-of-scope changes remain, and records are never deleted.

```text
node .agents/contracts/e2e-ui-test/scripts/check-file-scope.mjs snapshot --root <repo> --out <file outside the repository>
node .agents/contracts/e2e-ui-test/scripts/check-file-scope.mjs check --skill <skill> --root <repo> --docs-root <docs-e2e-root> --since <snapshot> --record
```

Coverage bookkeeping (plan and test generators): the manifest is the single source of truth. This applies an
optional obligation patch, computes evidence fingerprints, rolls statuses up, rebuilds the `coverage-data` and
`coverage-groups` projections and the status cells of coverage-view tables, then validates coverage. Exit 0 synced
and valid, 1 still invalid (or usage error), 2 patch refused with nothing written. A run over unchanged documents
writes nothing.

```text
node .agents/contracts/e2e-ui-test/scripts/sync-coverage.mjs --skill <e2e-ui-test-plan-generator|e2e-ui-test-generator|e2e-ui-test-verify-run> --root <repo> --docs-root <docs-e2e-root> [--patch <patch.json>] [--catalog <catalog>] [--typescript <typescript.js>] [--refresh-refs] [--dry-run]
```

Repair limits (`e2e-ui-test-verify-run`; see `docs/guide/E2E-RUNTIME-FEEDBACK-DESIGN.md`): snapshot the
sources under `testDir` before repairing failing tests, then check that every change is a locator, wait, navigation
or existing-fixture change. Assertions, expected values, test identity and metadata, skips, control flow, mocks,
forced actions, fixed waits and fixture or synthetic-data directories are refused. Exit 0 within limits, 2 forbidden
changes found, 1 usage error. Tests: `node --test` on `check-repair-diff.test.mjs` with `E2E_TYPESCRIPT` set.

```text
node .agents/contracts/e2e-ui-test/scripts/check-repair-diff.mjs snapshot --root <repo> --docs-root <docs-e2e-root> --out <file outside the repository>
node .agents/contracts/e2e-ui-test/scripts/check-repair-diff.mjs check --root <repo> --docs-root <docs-e2e-root> --since <snapshot> [--typescript <typescript.js>] [--report <file>]
```

Execution evidence (`e2e-ui-test-verify-run`): `classify` turns a developer-run Playwright JSON report
(git-ignored, local or dev lane only) into `<docs-e2e-root>/runs/<run-id>/run-<attempt>.json`, mapping each result to
its `testId` and classing each failure as Mechanical (repairable), Environment, Behavioural or Unclassified, with no
page text. `record` refuses a report whose specs changed since the run, then sets `executionStatus` and
`resultReference` through `sync-coverage.mjs --skill e2e-ui-test-verify-run`; coverage status is never changed.

```text
node .agents/contracts/e2e-ui-test/scripts/record-execution.mjs classify --root <repo> --docs-root <docs-e2e-root> --report <playwright.json> --run-id <id> --attempt <n> --lane <laneId> [--typescript <typescript.js>]
node .agents/contracts/e2e-ui-test/scripts/record-execution.mjs record --root <repo> --docs-root <docs-e2e-root> --run <run report> [--typescript <typescript.js>] [--catalog <catalog>] [--dry-run]
```

Evaluation (exit 0 PASS, 3 REVIEW, 4 FAIL, 2 when the entry gate refuses):

```text
node .agents/contracts/e2e-ui-test/scripts/evaluate.mjs prepare-judge --root <repo> --docs-root <docs-e2e-root> [--stage plan|tests] [--catalog <catalog>] --typescript <typescript.js>
node .agents/contracts/e2e-ui-test/scripts/evaluate.mjs judge-status --root <repo> --judge <judge-dir>
node .agents/contracts/e2e-ui-test/scripts/evaluate.mjs report --stage <plan|tests> --root <repo> --docs-root <docs-e2e-root> [--catalog <catalog>] --typescript <typescript.js> [--judge <judge-dir> --model <id>] [--dry-run]
```

`prepare-judge` also writes `<judge-dir>/prompts.json`, one ready sub-agent prompt per bundle sample, for dispatch
in one parallel wave. `judge-status` exits 0 when every sample is present, or 3 listing the missing ones with their
prompts. Bundles are format `1.1`: multi-line texts are arrays of lines.

`validate-all` and a plan-stage evaluation check test IDs against the real catalog whenever an obligation links a
test, including a `Draft` re-plan after authoring.

## Deterministic gates

| Gate | Checks |
| --- | --- |
| G-D01 | Every content unit under every criteria heading is accounted for in the inventory |
| G-D02 | Source-owned requirement identifiers (FR, NFR, REQ) are traced to criteria with rolled-up statuses |
| G-D03 | Inventory, manifest, rollups and fingerprints reconcile |
| G-D04 | Every gap has a precise blocker, remediation and owner; seeded lanes state their data needs |
| G-D05 | Plan, ledger and gap projections match the manifest |
| G-D06 | Journey counts follow obligations; uniform counts across differently sized stories fail |
| G-D07 | The catalog is valid and synchronized with the test inventory |
| G-D08 | Every claimed test resolves to a reviewed assertion |
| G-D09 | No empty, focused or unconditional tests |
| G-D10 | The Playwright config module format is valid |
| G-D11 | Touched files stay within the owning skill's artifact roots |
| G-D12 | The setup, including its test-data contract, matches the repository |

Details, including how findings are routed, are in the evaluator's `references/deterministic-gates.md`.

## Key conventions

- **Statuses:** `Planned`, `Covered`, `PartiallyCovered`, `Blocked`, `NotBrowserObservable`, `OutOfScope`;
  execution stays `NotRun` unless execution evidence is supplied.
- **Plan regions:** test-generator content in plans sits between `<!-- coverage-view:start -->` and
  `<!-- coverage-view:end -->`, which the approval fingerprint ignores.
- **Handoff files must be committable:** the plan and test generators refuse when git ignores one.
- **Line endings** never affect validation or fingerprints.
- **Metadata:** each test has one adjacent `@e2e-meta` JSON comment; parameterized literal loops use one record
  with `cases`. Assertions count only when anchored with `// @e2e-evidence <anchor>` in the test or a directly
  called helper. The TypeScript package is used only as a parser, never to compile or run code.
- **Naming:** plans `TC-<feature>-<story-id>.md`, suites `<story-id>-<slug>.spec.ts`, journeys `TC-J01`,
  `TC-J02` within a plan. Identifiers live in metadata, never only in titles.
- Structural validation is accounting, not business-semantic certification; see the evaluator's
  `references/semantic-review.md`.

## Run dashboard and code navigation

- `scripts/render-run-dashboard.mjs` turns `runs/<id>/run-<n>.json` and `runs/<id>/triage-<n>.json` into one
  self-contained `runs/<id>/dashboard-<n>.html`. `schemas/run-triage.schema.json` defines the triage file, and
  `e2e-ui-test-verify-run` writes it. The page shows every Playwright result: results not matched to a testId and
  errors outside any test are listed, and its counts are checked against Playwright's own totals.
- `scripts/code-nav.mjs` and [code-navigation.md](code-navigation.md) make skills query a prebuilt graphify graph
  before reading application source. A stale or missing graph is the person's call: `status` returns `ask: true`, the
  person chooses to update it with the graphify skill or to skip it, and `decide --choice skip` saves that in
  `<docs-e2e-root>/code-graph.json`.
- `scripts/judge-report.mjs` builds the committed judge record that `evaluate.mjs report --judge` (or
  `evaluate.mjs judge-report`) writes as `evaluations/judge-report-<stage>-<time>.json` and `.md`. Judge samples are
  dispatched batched by sample number by default (`prompts.json` `batches`), and `--dispatch` records which mode ran.
- `pipeline-status` keeps the verify step open after recording until the attempt has its dashboard (and triage).
