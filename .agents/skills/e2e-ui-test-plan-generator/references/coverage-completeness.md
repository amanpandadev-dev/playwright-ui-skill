# Coverage Completeness

Read this reference in setup, incremental, replacement, and full-coverage sweep modes. Completeness
must be demonstrable from repository artifacts rather than asserted in the handoff.

## Authority inventory

Extract the authority independently of generated tests into `requirements-inventory.json`, following
[coverage-manifest.md](coverage-manifest.md). Retain each criterion verbatim, its source-owned ID,
source path/heading and content fingerprint. Include explicit in-scope invariants, validation rules,
transitions and edge cases. Decompose every clause into stable obligations before selecting journeys;
keep derived IDs unchanged when their meaning is unchanged. Record persona/authorization scope,
starting state, trigger/input constraints, expected request/response and visible result, unchanged
state on failure, and required persistence/audit/notification/timing/recovery evidence. Implementation
details may ground tests but must not silently add or replace authoritative requirements.

Reconcile the extraction against the source, not against the generated manifest: a missing AC in both
the manifest and plans is still missing coverage. Fingerprint changes require reassessment of affected
claims. Inventory the entire confirmed scope before working in bounded batches. Test count follows
obligations and applicable variants; no fixed count or representative sampling satisfies full scope.

## Traceability key and source enumeration (gates G-D01, G-D02)

When the authority carries its own requirement identifiers (FR, NFR, REQ, or an equivalent traceability
table), those identifiers are the primary traceability key. Derived criterion IDs are a sub-layer under
them, never a replacement. Every in-scope source-owned identifier appears in the inventory as a
requirement group with a rolled-up status, including identifiers that carry no browser-observable
criterion; an identifier with no criterion is a finding with a reason, not an omission. Declare where the
identifiers live (for example `## PRD Traceability`), not the whole file, because specs also mention other
stories' identifiers.

Account for every content unit (list item, numbered item, table row, paragraph, code block) under every
heading that holds criteria, by index: a criterion, a non-criterion with a reason, or out of scope with a
reason. A validator enumerates the units itself, so a criterion dropped from the inventory, manifest and
plans alike still fails. Declare the criteria heading pattern; headings that match it but hold no in-scope
criteria are listed as excluded with a reason.

## Journey proportionality (gate G-D06, blocking)

A uniform journey count across stories of differing complexity is presumptive evidence of sampling and
fails until justified per story. Each story needs at least as many journeys as it has unblocked
browser-observable obligations (`Planned` or `Covered`), unless each unmatched obligation carries its own
`Blocked`, `NotBrowserObservable` or `OutOfScope` classification with a distinct blocker. Record the planned
journeys of every obligation in `plannedJourneys`, so the gate can count them before tests exist. Only an
explicit developer-requested `smoke-sample` scope is exempt, and every artifact must say so.

## Evidence and status contract

Use `coverage-manifest.json` as the structured authority for coverage claims and derive plan, ledger,
gap and catalog references from it. Its companion inventory is the independent requirements baseline,
not a projection of claimed coverage. Follow the exact schema and projection format in
[coverage-manifest.md](coverage-manifest.md); do not independently maintain competing free-text claims.
One test may support several obligations and an obligation may require multiple tests. Each claimed
test must resolve to concrete assertion evidence and pass [../../e2e-ui-test-coverage-evaluator/references/semantic-review.md](../../e2e-ui-test-coverage-evaluator/references/semantic-review.md).

- `Covered`: concrete reviewed authored evidence establishes every obligation at the declared layer;
  it does not assert execution or success.
- `PartiallyCovered`: identify exact covered and missing child obligations; never roll this up as
  Covered. Use the manifest contract's deterministic parent rollup.
- `Blocked`: name the specific missing implementation, identity, data, environment or cleanup contract
  and whether authoring or runtime readiness is blocked. Missing runtime credentials alone need not
  prevent concrete authoring when contracts are known.
- `NotBrowserObservable`: classify the individual internal obligation, preserve observable siblings,
  and record linked appropriate-layer authored evidence or the precise missing evidence.
- `OutOfScope`: require an explicit exclusion authority; inconvenience is not exclusion authority.

Track execution separately as `NotRun`, `Passed`, `Failed`, or `Skipped`; anything other than NotRun
requires supplied execution evidence and its result reference. Generation never produces run results.
Record the evidence layer and exact intercepted calls in `mockingScope`. UI mocks establish rendering,
client validation, request construction and simulated-response handling only, never the server behavior
they replace. A mixed browser/internal AC remains split across its applicable evidence layers.

Before authoring, enumerate every requirement unit inside the confirmed authority and scope. Record:

- a source-owned stable story ID, or a deterministic derived ID plus the documented derivation rule;
- source path and heading or anchor;
- every acceptance-criterion ID;
- evidenced business personas and whether each criterion is browser-observable.

Setup mode inventories the authority selected for initial generation. Full-coverage sweep inventories
the complete explicit manifest. Incremental and replacement modes inventory only the confirmed scope.
Discovery may locate evidence but must not enlarge the scope.

## Repository coverage ledger

Maintain exactly one `<docs-e2e-root>/coverage-ledger.md`. Use three normalized sections:

1. **Story inventory** — exactly one row per story with source, criterion IDs, and observability.
2. **Criterion/persona coverage** — exactly one row per criterion and evidenced persona. Use `N/A` for
   genuinely non-role-sensitive criteria.
3. **Journey index** — exactly one row per `planReference + journeyId`, listing the criteria and
   personas it covers. A journey may cover multiple criteria, but it occurs once in this index.

Criterion/persona rows contain:

| Story ID | Criterion ID | Persona | Journeys | Plan | Status | Blocker | Remediation action | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

`Status` is exactly `Planned`, `Covered`, `PartiallyCovered`, `Blocked`, `NotBrowserObservable`, or
`OutOfScope`. `Planned` rows name their journeys and plan instead of a blocker; every other value except
`Covered` requires non-empty blocker, remediation action, and owner cells. Keep status columns inside a
`<!-- coverage-view:start -->` ... `<!-- coverage-view:end -->` region so `e2e-ui-test-generator` can update
them after authoring. A
happy path does not cover validation, authorization, privacy, empty, or error criteria unless those
behaviors have traced journeys.

Owners must come from the requirement, repository ownership metadata, or the developer. Never invent a
team name or use `TBD`/`Unassigned` as if it were accountable ownership. If an otherwise complete gap
lacks an owner, stop ledger publication and request that decision.

When the inventory has requirement groups, add a fourth section, **Requirement coverage**: one row per
source-owned identifier with its criteria and rolled-up status, and embed the exact
`<!-- coverage-groups JSON -->` projection from [coverage-manifest.md](coverage-manifest.md).

Include totals by status and `Uncovered without a recorded reason: N`. Build and validate proposed
ledger content before publishing it; `N` must be zero.

In setup and sweep modes, reconcile the complete inventory. In incremental and replacement modes,
upsert only scoped rows, recompute totals, and preserve unrelated rows byte-for-byte where practical.
If an established setup has no ledger, stop and request setup/onboarding rather than silently creating
a repository-wide governance artifact during incremental work.

## Gap register

Maintain exactly one `<docs-e2e-root>/gap-register.md`, derived from all non-`Covered` ledger rows and
the gap sections in plans. Each entry includes story, criterion, persona, classification, blocker,
remediation action, owner, and the journey that becomes live when cleared, or `N/A` when no browser
journey is valid. Regenerate it whenever affected plan or ledger gaps change.

## Static validation

Run the companion coverage validator against the independent inventory, manifest, catalog and exact
document projections as well as the existing catalog checks. Reject omitted requirements/obligations,
invalid source fingerprints, missing test/assertion references, incorrect rollups, contradictory
projections, unsupported metadata and empty/unconditional passing tests. Static checks only establish
structural consistency and flag suspicious evidence; semantic review must inspect bodies and helpers.

- Every in-scope story appears exactly once in the story inventory.
- Every criterion/persona combination appears exactly once in the coverage section.
- Every plan/journey reference resolves, and every plan journey appears once in the journey index.
- Ledger criteria and personas reconcile with plan and catalog metadata.
- Every non-covered row has a distinct blocker, remediation action, and owner.
- Gap-register entries equal the ledger's non-covered set in both directions.
- `Uncovered without a recorded reason` is zero.

## Truthful completion

Report validated counts for stories, acceptance criteria, derived obligations, browser-observable
obligations, browser obligations with reviewed authored tests, blocked browser obligations, non-browser
obligations with linked authored tests, non-browser obligations awaiting evidence, unsupported claims,
and unaccounted obligations. State execution status separately (normally `NotRun`).

Accounting completion requires zero unaccounted obligations, zero unsupported claims, zero Covered
criteria with missing obligations, and zero browser obligations without concrete evidence or a
substantiated blocker. Full browser authoring additionally requires zero blocked browser obligations;
full cross-layer authored coverage requires evidence for all applicable layers. Documenting all gaps
achieves accounting completeness only. Smoke or sample scopes must be labeled as such. Never present
these gates as proof of all possible scenarios or a passing execution.
