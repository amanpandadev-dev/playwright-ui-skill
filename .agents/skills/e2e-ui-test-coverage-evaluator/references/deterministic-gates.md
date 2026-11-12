# Deterministic Gates

The deterministic engine is `.agents/contracts/e2e-ui-test/scripts/evaluate.mjs`. It runs every gate for the
requested stage before any score or judge result is considered. A failed **blocking** gate forces a `FAIL`
verdict whatever the scores say.

## Gates

| Gate | Check | Stages | Blocking | Implemented by | Findings route to |
| --- | --- | --- | --- | --- | --- |
| G-D01 | Inventory accounts for every enumerable source unit | plan, tests | yes | `traceability.mjs` via `validate-coverage.mjs` | `e2e-ui-test-plan-generator` |
| G-D02 | Source-owned requirement identifiers (FR, NFR) are traced | plan, tests | yes | `traceability.mjs` via `validate-coverage.mjs` | `e2e-ui-test-plan-generator` |
| G-D03 | Inventory, manifest, rollups and fingerprints reconcile | plan, tests | yes | `validate-coverage.mjs` | `e2e-ui-test-plan-generator` |
| G-D04 | Every gap has a precise blocker, remediation and owner | plan, tests | yes | `validate-coverage.mjs` | `e2e-ui-test-plan-generator` |
| G-D05 | Plan, ledger and gap projections match the manifest | plan, tests | yes | `validate-coverage.mjs` | `e2e-ui-test-plan-generator` |
| G-D06 | Journey counts are proportional to obligations | plan, tests | yes | `traceability.mjs` via `validate-coverage.mjs` | `e2e-ui-test-plan-generator` |
| G-D07 | Catalog v3 is valid and synchronized with the test inventory | tests | yes | `inventory-tests.mjs`, `validate-catalog.mjs` | `e2e-ui-test-generator`; a missing specialized schema routes to `e2e-ui-test-env-setup` |
| G-D08 | Every claimed test resolves to a reviewed assertion | plan, tests | yes | `validate-coverage.mjs` | `e2e-ui-test-generator` |
| G-D09 | No empty, focused (`test.only`) or unconditional tests | tests | yes | Source parser and a `test.only` scan | `e2e-ui-test-generator` |
| G-D10 | Playwright config module format is valid | tests | yes | `validate-config-module-format.mjs` | `e2e-ui-test-env-setup` |
| G-D11 | Touched files stay within declared artifact roots | tests | yes | `check-file-scope.mjs` records, re-checked | `e2e-ui-test-generator` |
| G-D12 | Setup conforms to its recorded decisions | tests | yes | `check-setup.mjs` verify | `e2e-ui-test-env-setup` |
| G-D13 | Recorded execution evidence is current and every failure is routed | tests | no | `evaluate.mjs` over verify-run reports | By failure class: Environment to `e2e-ui-test-env-setup`, Behavioural and Unclassified to `human`, Mechanical to `e2e-ui-test-generator`, an invalid or stale report to `e2e-ui-test-verify-run` |

Every gate is implemented. The report format still allows `not-implemented` with
`blocking: false` for gates added later.

## What the traceability gates check

- **G-D01.** Inventory schema 1.1 accounts for every content unit (list item, numbered item, table row,
  paragraph, code block) under every heading matching its criteria heading pattern, by index and kind.
  Criterion units must contain their criterion's source text; other units need a precise reason. A
  pattern-matching heading that is neither enumerated nor excluded fails. An inventory of schema 1.0 fails.
- **G-D02.** Every identifier found by the declared pattern in the declared traceability sections is a
  requirement group, and every group is found there. Every criterion belongs to a group, group statuses
  roll up from their criteria, and a group with no criterion has a reason and a non-covered status.
  Declaring no identifiers while the authority contains FR, NFR or REQ IDs fails.
- **G-D06.** A story with fewer journeys than unblocked browser-observable obligations fails, and so do
  identical journey counts across three or more stories whose criterion counts differ materially (the
  largest at least twice the smallest and at least 3 more). Journeys are tests once authored and
  `plannedJourneys` before that; each planned journey must exist in its plan. `smoke-sample` is exempt.
- **G-D12.** `setup-decisions.json` matches the repository: `e2e:validate` runs every validator (or
  `validate-all.mjs`); every discovered development-authentication candidate is offered or rejected with a
  reason; `app-dev-auth` is local, evidenced, guarded and maps each persona to a supported role; several
  identity-bearing personas have per-persona auth state and `E2E_AUTH_STATE_DIR`; unapproved identities
  are readiness blockers; a route-mocked or simulated lane is not called portable; an enabled portal
  has a Ready catalog entry and an unattended lane; and a seeded lane has evidenced create and cleanup
  interfaces, a non-simulated seeding identity, no faked application-API routes or hard-coded record
  identifiers in specs, and reserved e-mail domains in specs and the data module. Findings
  about specs or the data module route to `e2e-ui-test-generator`.
- **G-D04, test data.** In seeded lanes every browser obligation has `dataRequirements`, and a `Planned` or
  `Covered` obligation that changes data needs the lane's cleanup contract; routed to `e2e-ui-test-plan-generator`.
- **G-D11.** Each generating skill records its touched paths with `check-file-scope.mjs check --record`
  under `<docs-e2e-root>/scope/`. The evaluator re-checks every record against the ownership rules, and
  fails when there is no `e2e-ui-test-generator` record.
- **G-D13.** Only when obligations carry execution results, which `e2e-ui-test-verify-run` records from a
  developer's run. Each `resultReference` must be a valid verify-run report whose spec fingerprints still match,
  and each failed test in it becomes a finding routed by its failure class. The gate is non-blocking: a failed run
  makes the verdict `REVIEW` at worst, because the failure is a decision for its owner (often a person judging a
  possible application defect), not a coverage defect. The report's `executionStatus` is `Passed`, `Failed` or
  `Skipped` only when every `Covered` obligation has a result, and `NotRun` otherwise.

## How validator messages become gates

`validate-coverage.mjs` returns messages, and its source parser throws for some source problems. The engine
classifies each message into a gate by pattern, and fails closed: any message it cannot classify is
recorded under G-D03 rather than dropped.

- Empty test bodies and unconditional literal assertions (`expect(true)`) are thrown by the parser. They
  become G-D09 failures, not crashes.
- Unresolvable test sources, metadata errors and parse failures become G-D08 failures.
- Catalog duplicate-ID messages become G-D07 failures at the tests stage.
- A `Planned` obligation is valid at the plan stage. At the tests stage it means authoring is incomplete:
  a G-D04 failure routed to `e2e-ui-test-generator`. A `Planned` obligation carrying test IDs, evidence or a
  review is a G-D08 failure.
- A malformed `coverage-view` region in a plan (unbalanced, nested, or containing a level-1 or level-2
  heading) is a G-D05 failure. Such a plan is fingerprinted whole, so the test generator's entry gate
  also refuses it.

## Stage inputs

**Plan stage.** No tests exist yet, so coverage is validated against an empty catalog stub. Reports count
`plannedObligations` and `plannedBrowser` separately from `blockedBrowser`, so pending authoring is not
reported as blocked. The catalog
linkage checks (unsupported catalog mappings, plan-reference agreement) are tests-stage concerns.

**Tests stage.** The engine also:

1. Inventories tests under the recorded `testDir`, into a temporary file outside the repository.
2. Runs `validate-catalog.mjs` from the repository root against the specialized catalog schema. It looks
   for `--catalog-schema`, then `test-catalog.schema.json` next to the catalog. When only the contracts
   template exists, it reports that the schema was never specialized, routed to `e2e-ui-test-env-setup`, instead
   of the template's placeholder errors.
3. Scans spec files for `test.only`.
4. Runs `validate-config-module-format.mjs` on the recorded `configPath`.

## What gates do not prove

Gates establish structural consistency and flag suspicious evidence. They cannot tell whether a test body
actually establishes its requirement clause. That is the blinded judge's job; see
[judge-protocol.md](judge-protocol.md).
