# Report Format

## Files

`evaluate.mjs report` writes two files under `<docs-e2e-root>/evaluations/`:

- `evaluation-<stage>-<YYYYMMDD-HHmm>.json`, validated against
  `.agents/contracts/e2e-ui-test/schemas/evaluation-report.schema.json` before it is written;
- a Markdown rendering with the same name and a `.md` extension.

Reports are never overwritten. A second report with the same stage and timestamp gets a `-2` suffix, then
`-3`, so earlier evaluations stay available for comparison. `--dry-run` prints the JSON and writes nothing.

## JSON

Schema fields: `schemaVersion`, `contractsVersion`, `stage`, `evaluatedCommit`,
`inputs` (path and fingerprint of the manifest, inventory, setup decisions and, at the tests stage, the
catalog), `gates`, `scores`, optional `judge` (`model`, `samples`, `disagreements`), `findings`, `counts`,
`executionStatus` and `verdict` with `verdictReason`.

The engine adds `scoring`, which the schema permits: `finalScore`, `weightCoverage`, `weightsUsed` and
`omitted`, with a reason for each dimension that could not be scored.

Each finding has a sequential `findingId` (`EV-0001`), `severity`, `type`, `routeTo`, `description` and
`suggestion`, plus `obligationId` or `testId` when it concerns one.

## Markdown sections

1. **Verdict banner**: verdict, final score with the share of the weight it was measured on, blocked browser
   obligations, finding counts by severity, and execution status, followed by the verdict reason.
2. **Deterministic gates**: every gate with result and blocking flag, including reserved gates.
3. **Scores**: scored dimensions with weights, then each omitted dimension with its reason.
4. **Blinded judge**: model, samples per obligation and disagreements, when the judge ran.
5. **Findings**: one row per finding with its route.
6. **Counts**: stories, criteria, obligations, reviewed, blocked and planned browser obligations, planned
   obligations, discovered and traced source-owned identifiers, unsupported claims and unaccounted
   obligations.
7. **Limitations**: that execution is `NotRun`, or that the execution status is transcribed from
   developer-supplied run reports; which gates are reserved; the evaluated commit and the contracts version.

## Routing findings

| Route | Typical findings | What happens next |
| --- | --- | --- |
| `e2e-ui-test-plan-generator` | G-D03 to G-D06 failures: reconciliation, gaps, projections, proportionality | Plan changes; approval resets to `Draft` and Gate A reruns |
| `e2e-ui-test-generator` | G-D07 to G-D09 failures, unsupported claims, wrong layers, partial support | Tests or evidence change; rerun the evaluator |
| `e2e-ui-test-env-setup` | G-D10 failures, a missing specialized catalog schema | A reconfigure operation, then re-plan if decisions changed |
| `human` | Judge disagreement, incomplete or missing judge samples | A person reviews the test body against the clause |

The evaluator reports findings. It never fixes them.
