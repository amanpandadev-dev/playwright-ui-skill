# Adopt Existing Coverage

Use scope type `adopt-existing` when a repository already has E2E plans, a coverage ledger, a gap register
or catalog entries, but no `requirements-inventory.json` or `coverage-manifest.json`. It brings that
coverage under the manifest contract so `e2e-ui-test-generator` and `e2e-ui-test-coverage-evaluator` can work on it.

Adoption requires a valid `setup-decisions.json`. When it is missing, stop: the entry gate refuses and
`e2e-ui-test-env-setup` must first run its **Record existing setup** operation.

## Principle: existing artifacts are claims, not authority

Existing plans, ledger rows, gap entries and catalog mappings record what a previous run *said* it
covered. Nothing in them has been verified against test bodies. Adoption therefore:

- builds the requirements inventory **independently from the authority** (specs, PRD or UI), following
  [requirement-extraction.md](requirement-extraction.md), never from ledger or plan rows;
- records every existing mapping as an unverified claim;
- never marks an obligation `Covered`. Coverage is established only after `e2e-ui-test-generator` records
  assertion evidence and the claim passes semantic review.

## Steps

1. **Inventory the authority.** Extract every in-scope criterion verbatim with source path, heading and
   fingerprint, then decompose into obligations as in [coverage-completeness.md](coverage-completeness.md).

2. **Reconcile identifiers.** When existing criterion IDs (for example `US-001-AC-03`) follow a
   deterministic rule over the source, such as bullet order under an Acceptance Criteria heading, record
   that rule in the inventory's top-level `derivationRule` and reuse the IDs so journeys and catalog
   references stay stable.
   When an existing ID cannot be mapped to source text, or the source contains a criterion no existing ID
   covers, record a discrepancy finding. Never invent a mapping to make them line up.

3. **Record claimed tests without asserting them.** For each obligation, collect the tests that existing
   artifacts map to it and record them in the obligation's `claimedTests` array:

   ```json
   "claimedTests": [
     { "testId": "APP-S002-J01", "claimedBy": ["catalog", "plan"], "specPath": "tests/e2e/s-002-approval.spec.ts" }
   ]
   ```

   Leave `testIds`, `assertionReferences` and `mockingScope` empty. The validator requires assertion
   evidence for every entry in `testIds`, and gathering that evidence is `e2e-ui-test-generator`'s work.

4. **Set honest statuses.** Keep `executionStatus: "NotRun"` and encode adopted obligations as follows:

   | Situation | `blockedActivity` | `blocker` | `remediation` |
   | --- | --- | --- | --- |
   | Existing tests claim the obligation | `evidence-review` | Existing tests are mapped to this obligation, but their assertion evidence has not been reviewed. | Run `e2e-ui-test-generator` metadata repair to review the claimed tests and record assertion evidence. |
   | No existing test claims it | use `Planned` status with `plannedJourneys` | None: authoring is pending, not blocked | Author the planned journey after Gate A approval |
   | Not browser observable | use `NotBrowserObservable` status | Name the internal behavior | Name the API, integration or worker suite that should cover it |

   Take `owner` from the existing ledger only when it names an accountable team or person; otherwise ask.
   Never use `TBD` or `Unassigned`.

5. **Preserve existing documents.** Keep existing plan, ledger and gap-register content verbatim. Do not
   reformat tables or rewrite prior status claims. Add to each document:
   - a short note at the top stating that its visible statuses predate adoption and are unverified until
     the manifest records evidence;
   - exactly one `<!-- coverage-data -->` projection block, rendered from the manifest with the
     `projections` function in `.agents/contracts/e2e-ui-test/scripts/validate-coverage.mjs`.

6. **Report discrepancies** as findings for the reviewer, without fixing them in this operation:
   - source criteria missing from existing plans or the ledger;
   - ledger or catalog requirement IDs with no source text;
   - existing visible statuses that claim `Covered` for obligations with no reviewed evidence;
   - uniform journey counts across stories of different size;
   - claimed mappings that look unsupported on their face, such as a sorting test mapped to approval.
     Flag these for `e2e-ui-test-coverage-evaluator`; do not judge test bodies here.

7. **Validate the plan stage.** The catalog linkage check only makes sense after tests are linked, so
   validate against an empty catalog stub written outside the repository:

   ```text
   {"schemaVersion": "3.0", "applicationId": "<applicationId>", "tests": []}
   node .agents/contracts/e2e-ui-test/scripts/validate-coverage.mjs --root <repo> --requirements <inventory> --manifest <manifest> --catalog <stub> --typescript <typescript.js>
   ```

   Report the result as plan-stage structural validation. Full validation against the real catalog
   happens after `e2e-ui-test-generator` converts claims into evidence.

8. **Mark for review.** Set `scope.type` to `adopt-existing` and the review status to `Draft`. Present
   [review-checklist.md](review-checklist.md) together with the discrepancy findings.
