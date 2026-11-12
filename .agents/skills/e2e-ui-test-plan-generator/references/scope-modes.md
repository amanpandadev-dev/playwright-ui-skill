# Scoped and Full-Coverage Generation

Use this reference when Playwright setup already exists and the requested work is incremental,
replacement, or a full-coverage sweep. These modes share a setup freeze but have different scope
authority.

## Scope gates

### Incremental feature generation

Require one unambiguous combination:

- spec/PRD path plus story or feature identifiers;
- exact identifiers resolving to one local authority;
- source paths or route/component names plus named intended behavior.

### Explicit replacement

Require exact existing plan, suite, stable test, or `TC-Jxx` identifiers plus the changed requirement.
The word "regenerate" never authorizes replacement or deletion. Preserve stable IDs when business
meaning is unchanged and retire them only through an explicit identity-retirement decision.

### Full-coverage sweep

Require all of the following:

- an explicit spec/PRD manifest path or list of paths;
- a source-owned story-ID rule, or a deterministic derivation rule for sources without IDs;
- an explicit statement that every story in that manifest is in scope;
- a compatible existing Playwright setup, catalog, coverage ledger, and gap register.

The manifest is the complete scope. Repository discovery supplies implementation evidence but cannot
add requirements. A sweep is add-only: preserve existing valid coverage, generate uncovered criteria,
and record blocked/non-browser-observable criteria rather than fabricating tests. Initial setup may
generate complete manifest coverage under setup mode; do not combine setup and sweep modes.

When supplied details are insufficient, ask one concise blocking question covering only unresolved
story/authority/replacement fields. Offer a full-coverage sweep when a manifest exists. Do not modify
files while waiting.

## Setup freeze

Confirm and reuse the configured application target, agent platform, and browser projects. Do not:

- install or upgrade dependencies or browsers;
- run `playwright init-agents`;
- change manifests, lockfiles, Playwright config, scripts, browser projects, agents, MCP settings,
  ignores, shared fixtures, base READMEs, or GitHub workflows;
- add managed-browser configuration or alternate workflow-platform artifacts;
- launch or execute applications, browsers, agents, endpoints, auth flows, tests, or workflows.

If setup is missing or incompatible, report the exact prerequisite and request a separate setup
operation.

## Coverage-diff procedure

1. Inventory existing plans, suites, stable metadata, catalog entries, ledger rows, and gap entries.
2. Extract only the confirmed requirement scope.
3. Independently extract every scoped AC and decompose all clauses using
   [coverage-manifest.md](coverage-manifest.md). Inspect existing bodies and called helpers under
   [../../e2e-ui-test-coverage-evaluator/references/semantic-review.md](../../e2e-ui-test-coverage-evaluator/references/semantic-review.md); catalog mappings alone never establish existing coverage.
4. Classify each obligation as `new`, `changed`, `verified covered`, `unsupported claim`, or
   `gap/blocked`. Generate missing obligations even when siblings of the same AC already have tests.
   Revise behavior only in explicitly approved `changed` artifacts.
5. Reuse stable IDs; allocate the next feature-local journey ID only for new behavior.
6. Reuse shared fixtures/helpers. Missing shared infrastructure is a setup prerequisite.
7. Upsert only scoped catalog, ledger, and gap rows; preserve unrelated rows and artifacts.
8. Reconcile the normalized completeness checks in
   [coverage-completeness.md](coverage-completeness.md).

## Scoped metadata repair and batching

A coverage request authorizes correcting inaccurate claim metadata for its exact scope without
pretending the underlying requirement changed. Remove false obligation mappings from scoped manifest,
plan, ledger and catalog projections, retain the valid scenario and stable test ID, and report each
correction with old claim, actual evidence and replacement classification. Do not delete a valid test,
change its actions/assertions or expand requirements under metadata repair. Behavior-changing replacements
still require exact artifacts and explicit replacement authority. Out-of-scope false claims are reported,
not silently changed. A sorting journey wrongly tagged as approval retains its sorting identity while
missing approval and rejection obligations receive new concrete coverage or precise blockers.

Adding the inventory and linked manifest for confirmed coverage is scoped coverage metadata, not
permission to change frozen setup. Preserve existing unrelated metadata and use the linked schema-v1
contract; do not migrate the v3 catalog or workflow. Missing repository-wide ledger/setup remains subject
to the existing setup prerequisite.

Inventory the full scope first; process bounded story batches and reconcile each against its obligations.
Persist a continuation checklist of complete, incomplete and blocked work within authorized coverage
artifacts. An identical journey count across three or more stories of materially different complexity is
presumptive sampling and fails blocking gate G-D06, as does a story with fewer journeys than unblocked
browser-observable obligations; only an explicit `smoke-sample` scope is exempt. Retain every remaining obligation and report incomplete authoring if work
remains; do not compress later stories into samples.

Record source/implementation conflicts with exact paths and expected outcomes. Honor source precedence
when it resolves the contract and flag the mismatch; otherwise isolate the decision-needed obligation
and continue unaffected work. Reassess changed source fingerprints before reusing existing coverage.

## Handoff

Report exact scope and lists of generated, intentionally revised, already covered, and blocked work.
For a sweep, include manifest story/criterion totals and prove `Uncovered without a recorded reason` is
zero. State that setup was frozen and nothing was executed.
