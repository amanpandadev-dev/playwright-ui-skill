# Business Portal Integration Contract

Read this reference whenever generating or revising Playwright tests because the catalog must remain
synchronized. In setup/onboarding mode, also apply the portal workflow contract. The application
repository is the system of record connecting executable automation, human-readable plans,
business-facing metadata, and later portal-triggered execution.

## Test catalog

Maintain one repository-owned `test-catalog.json`. Reuse an established location; otherwise use
`tests/e2e/test-catalog.json`. Do not discard unrelated entries or create per-feature catalogs.

Read [test-catalog-schema.md](test-catalog-schema.md) and generate or preserve a versioned,
machine-validatable catalog schema. Apply its mandatory fields, controlled vocabularies, stable
automation identity, environment applicability, pack semantics, persona/auth/access-profile
separation, reason/remediation pairing, and traceability rules. Start new schemas from
[../../../contracts/e2e-ui-test/schemas/test-catalog.schema.json](../../../contracts/e2e-ui-test/schemas/test-catalog.schema.json), replace every controlled-
value sentinel, and preserve authoritative compatible extensions. The Playwright title is display
metadata, never the execution identity.

Use schema version `3.0` and catalog versions formatted as `YYYYMMDD.3.0`. Require the developer or an
authoritative platform contract to supply `applicationId` and `applicationDisplayName`; do not derive
them. Keep `sourceCommitSha` optional while authoring uncommitted changes, but require and validate it
before publication against the actual revision selected for dispatch.

For incremental generation, add entries only for new tests and revise entries only for intentionally
revised tests. For explicit replacement, retain stable `testId` values when the business scenario is
still the same; preserve disabled/deprecated entries required for historical correlation and remove an
entry only when its corresponding test removal and identity retirement are explicitly authorized.
When an in-scope test is already covered but lacks valid catalog metadata, backfill only that entry
without duplicating or rewriting the plan or suite. Do not create catalog entries for skipped
backend-only gaps that have no Playwright test.

Audit the full Playwright inventory across the owning `testDir` on every catalog change. Every
discovered test, including auth/setup/diagnostic tests that are portal-ineligible, must map to exactly
one catalog entry with synchronized eligibility metadata. This audit is repository-wide and read-only;
incremental scope still limits mutation. Report any out-of-scope test that lacks an entry or disagrees
with the catalog, but do not backfill or rewrite it without authority. Use explicit
`portalEligible: false` metadata and a matching `portalExclusionReason`; never treat catalog absence as
an exclusion.

Require developer- or authority-supplied eligibility, readiness, and lifecycle values. For a
role-sensitive test, also require a non-secret `requiredAccessProfile`; never derive it from the
business persona or runtime auth profile. Stop the affected catalog mutation when required metadata is
not authoritative rather than publishing guessed `Ready`, `Active`, or access values.

## Linked coverage evidence (catalog-compatible)

Keep catalog schema `3.0`, publication versioning, controlled fields and portal consumers unchanged.
Use the separately versioned inventory/coverage manifest in
[assertion-evidence.md](assertion-evidence.md), linked by existing `applicationId + testId`, for obligation
evidence, mocking scope, review and execution status. Do not insert new fields or enums into v3 catalog
entries. An ineligible/non-ready catalog test may still contain authored coverage; `Covered` does not
mean `Ready`, `Active`, or `Passed`. Conversely, portal eligibility/readiness is not behavioral evidence.

Run both catalog validation and the companion coverage validation: compare exact manifest projections
in plans, ledger and gaps, and reconcile claim test IDs and requirement references with catalog entries.
Inspect actual test bodies and helpers through [../../e2e-ui-test-coverage-evaluator/references/semantic-review.md](../../e2e-ui-test-coverage-evaluator/references/semantic-review.md); inventory and
catalog success alone cannot prove an AC. Keep UI-mocked and integrated claims separate, documenting the
exact mocked endpoints and leaving replaced backend behavior unclaimed. Preserve portal workflow files
outside setup and report coverage status separately from supplied execution evidence.

## Synchronization and static validation

Validate the catalog against schema v3 without loading Playwright. Statically inventory the owning
`testDir` and validate both directions: every discovered Playwright test has exactly one catalog entry,
and every catalog entry resolves to an existing spec and embedded stable `testId`. Validate
`applicationId + testId` identity, the `YYYYMMDD.3.0` catalog version, conditional exclusion/readiness/
status reasons, and role-sensitive access profiles. Treat title matching only as a display consistency
check.

Require each conditional reason to have its matching remediation object and reject a remediation that
restates the blocker or omits its owner. Cross-check these values against the source metadata,
coverage ledger, and gap register.

Reject duplicate catalog or source `testId` values, duplicate global `applicationId + testId` values,
duplicate automation references, implicit or unreasoned portal exclusions, orphan tests, orphan
catalog entries, invalid/empty pack membership, pack-semantic violations, missing business outcomes or
feature scope, broken requirement/story/plan/journey references, incompatible persona/auth/access-
profile mappings, unknown browsers/environments, blind `local` applicability defaults, and workflow
choices that disagree with catalog/config values. Publication validation must also reject missing or
mismatched `sourceCommitSha`, unsupported schema versions, reused retired IDs, and a dispatchable entry
that fails any eligibility/readiness/lifecycle/applicability gate. In an incremental operation, report
unrelated failures from the repository-wide audit but mutate only the confirmed feature/story scope.

Parse the catalog and, when in setup mode, the workflow without running Playwright or dispatching the
workflow. Confirm manual-only triggering, controlled and fail-closed selection, safe catalog mapping,
configured environment/browser choices, secret-safe bindings, actual Playwright invocation, bounded
report upload, and no raw-input shell execution. Outside setup mode, confirm the workflow did not
change. Repository CI may repeat these governance checks later, but do not create separate validation
automation unless explicitly requested.

Prefer the bundled `inventory-tests.mjs` and `validate-catalog.mjs` scripts for deterministic static
checks. They must never import Playwright, contact endpoints, authenticate, or execute a workflow.

## Handoff

Report the catalog and schema paths, schema and catalog versions, application identity, authoring or
publication validation stage, source commit presence, full inventory count, added/revised/preserved
`testId` values, eligibility/readiness/lifecycle counts, orphan and duplicate findings, pack assignments,
environment applicability, and unresolved traceability or persona/auth/access-profile mappings. In
setup mode, also report the workflow path, dispatch inputs and gates, environment/browser/feature
choices, stable-ID execution mapping, commit validation, command, secret/variable names, and report
artifacts. Otherwise state that the platform-owned workflow was preserved or not created. Distinguish
workflow authoring from execution and never describe unexecuted tests as passing.
