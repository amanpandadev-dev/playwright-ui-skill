# Test Catalog Schema and Semantics

Read this reference whenever creating or revising the repository portal catalog or its schema. A
catalog is valid only when it is structurally valid, uses approved controlled values, satisfies the
cross-field rules below, and remains synchronized with plans and Playwright source.

## Schema authority and versioning

Reuse an authoritative portal-owned schema and validator when they already implement this v3 contract.
Do not generate or extend a v2 contract. If an established repository still uses a pre-v3 schema, stop
catalog mutation and request an explicit v3 setup/onboarding migration; never fold a breaking migration
into incremental feature generation. Preserve organization-specific v3 field names or vocabularies
only when they satisfy the required semantics below.

For every catalog, create or preserve a repository-owned `test-catalog.schema.json` beside the catalog.
The schema must declare JSON Schema draft 2020-12 and implement catalog schema version `3.0`. A v3
catalog always contains `$schema`, `schemaVersion`, `applicationId`, `applicationDisplayName`,
`catalogVersion`, and a non-empty `tests` array. Set `$schema` to the repository-relative schema path,
set `schemaVersion` to `3.0`, and format `catalogVersion` as `YYYYMMDD.3.0`, for example
`20260902.3.0`. Reject unsupported schema versions rather than interpreting them as v3.

The selected catalog-version format has one value per calendar day. Never publish different catalog
content under the same value. If authoritative publication history already contains that day's
version, stop and request a developer-owned publication/versioning decision rather than inventing a
suffix or silently reusing the version.

Treat `applicationId` as the immutable machine identity for the application and
`applicationDisplayName` as its developer-confirmed business label. Require the developer or an
authoritative platform contract to provide both values; never derive them from a repository name,
folder, package slug, URL, or test title. Use `applicationId + testId` as the global portal identity.

Define `sourceCommitSha` in the schema but keep it optional during authoring because generated changes
may not have an approved commit yet. Publication validation must require a complete immutable commit
identifier for the approved catalog source, and the portal/workflow must compare it with the actual
dispatched revision. Never generate a placeholder SHA or treat a branch name as immutable provenance.

Constrain every field's type, minimum length, array uniqueness, conditional presence, and controlled
values. Reject unknown fields in new catalog-owned objects; preserve documented extension fields only
when an authoritative v3 contract explicitly defines them.

Encode the repository's authoritative controlled vocabularies directly as schema enums. Resolve
browser and environment values from the confirmed Playwright projects and protected non-production
targets. Resolve personas and runtime authentication profiles from requirements, application source,
fixtures, and platform documentation. Never invent a role, environment, browser, or auth profile.

Preserve repository-approved risk and priority vocabularies. For a new contract with no established
values, use these defaults and document them in the catalog handoff:

- `risk`: `Critical`, `High`, `Medium`, or `Low`, expressing the business impact of failure.
- `priority`: `P0`, `P1`, `P2`, or `P3`, expressing execution/release urgency independently of risk.

Do not infer priority mechanically from risk. `P0` is reserved for release-blocking coverage; `P1` for
coverage required for the applicable release or environment; `P2` for ordinary maintained regression;
and `P3` for optional or low-urgency coverage. Require an explicit rationale in the plan for `Critical`
risk, `P0` priority, or an unusual risk/priority combination.

## Required catalog fields

At catalog scope require:

- `$schema`: repository-relative reference to the colocated schema.
- `schemaVersion`: the constant `3.0`.
- `applicationId`: developer-confirmed immutable application identity.
- `applicationDisplayName`: developer-confirmed business-facing application name.
- `catalogVersion`: `YYYYMMDD.3.0`, using the catalog generation/publication date and schema version.
- `tests`: a non-empty array containing exactly one entry for every Playwright test in the owning
  `testDir`, whether portal-eligible or explicitly excluded.

Allow `sourceCommitSha` to be absent only in authoring validation. Require it at publication time.

For schema v3, every test entry must contain:

- `testId`: application-local unique, immutable automation/business identity. Use the repository's
  stable ID convention; otherwise define and document a deterministic feature/story-based convention.
  Never use a title, line number, or current file path as the identity, and never recycle a retired ID.
- `journeyId` and `planReference`: the stable `TC-Jxx` journey and repository-relative Markdown plan
  path. Treat their pair as the journey key when different plans may reuse local journey numbers.
- `requirementReferences`: a non-empty, unique array of stable requirement, acceptance-criterion, or
  source-evidence identifiers.
- `storyReference` and `featureReference`: stable business scope identifiers. Add `releaseReference`
  when pack selection or portal reporting is release-specific.
- `businessTitle`, `businessDescription`, and `expectedOutcome`: business-facing text that lets the
  portal explain the scenario and intended result without parsing Playwright or Markdown source.
- `risk`, `priority`, and `testPacks`: controlled business classification values.
- `automationReference`: an object containing repository-relative `specPath`, the same stable
  `testId` embedded in Playwright metadata, and `testTitle` for display/diagnostics only. Title changes
  must not change selection or identity.
- `browserApplicability` and `environmentApplicability`: non-empty, unique arrays restricted to schema
  enums for configured browser projects and approved non-production environments.
- `businessPersona`: the role or actor whose business permissions and outcome the test validates.
- `runtimeAuthProfile`: the approved fixture, project, or credential-profile identifier used at future
  runtime. Use an approved anonymous/public profile for unauthenticated tests; do not silently default
  authenticated tests to an administrator profile.
- `roleSensitive`: explicit boolean stating whether authorization varies by persona. This makes the
  access-profile requirement structurally decidable instead of inferred from a persona name.
- `tags`: unique technical tags actually present in or deterministically mapped to the suite.
- `portalEligible`: explicit boolean exposure policy copied from synchronized Playwright metadata.
- `executionReadiness`: exactly one of `Ready`, `Blocked`, `ManualAuthRequired`, or
  `DataSetupRequired`.
- `status`: exactly one of `Active`, `Disabled`, or `Deprecated`.

Apply these conditional fields:

- Require non-empty `portalExclusionReason` when `portalEligible` is `false`; when it is `true`, either
  omit the field or set it to `null`. Also require `portalExclusionRemediation` with non-empty `action`
  and `owner` when excluded, and omit it when eligible.
- Require non-empty `readinessReason` for every `executionReadiness` value other than `Ready`; do not
  require it for `Ready`. Also require `readinessRemediation` with non-empty `action` and `owner` for
  every non-ready value, and omit it for `Ready`.
- Require non-empty `statusReason` when `status` is `Disabled` or `Deprecated`; do not require it for
  `Active`. Also require `statusRemediation` with non-empty `action` and `owner` for disabled or
  deprecated entries, and omit it for `Active`.
- Require non-empty `requiredAccessProfile` when `roleSensitive` is `true`, and prohibit it when false.
  Obtain this non-secret
  alias from the developer or authoritative platform documentation. Never derive it from
  `businessPersona` or `runtimeAuthProfile`; omit it only for genuinely public or non-role-sensitive
  tests.

Each remediation object has exactly `{ "action": string, "owner": string }` with non-empty trimmed
values and no additional properties. A reason describes current state; an action describes the
concrete change that clears it; an owner identifies the responsible team or role. Reject remediation
that merely repeats its reason or uses an unowned placeholder such as `TBD`.

The schema must require non-empty strings and arrays, `uniqueItems` where applicable, and
`additionalProperties: false` for new catalog-owned objects. Schema validation is necessary but not
sufficient: also enforce the source, reference, identity, and pack rules below.

## Full inventory, portal eligibility, and stable automation identity

Every Playwright test collected by the owning `testDir` must have statically discoverable metadata that
declares whether it is portal-eligible, and every discovered test must have exactly one catalog entry.
Use the repository's established annotation/tag/helper contract. For a new contract, embed `testId`,
`journeyId`, and `portalEligible` in machine-readable test metadata; when `portalEligible` is false,
also embed the same exclusion reason and remediation action/owner recorded in the catalog.

Auth setup, fixture self-checks, seed/reset utilities, and intentionally manual-only diagnostics may be
portal-ineligible. A browser-facing business test intended for later portal execution is
portal-eligible even when it is temporarily skipped for a precise runtime prerequisite. Represent that
temporary condition through `executionReadiness`, not portal exclusion. Never use catalog absence to
express ineligibility.

Portal selection and result correlation must use `applicationId + testId`, with the embedded stable
`testId` providing repository-local source mapping. Never select by `testTitle`. Preserve `testTitle`
only for human display and diagnostics. Renaming a title or moving a spec updates display/location
metadata without changing the stable ID.

## Readiness, lifecycle, and automatic dispatch

Obtain `portalEligible`, `executionReadiness`, `status`, and their conditional reasons from the
developer, requirements, or authoritative platform documentation. Do not manufacture `Ready` or
`Active` merely because a test was generated successfully. This skill performs static authoring and
cannot prove live credentials, data, connectivity, or application health.

Permit automatic dispatch only when `portalEligible` is `true`, `status` is `Active`, and
`executionReadiness` is `Ready`, after environment, browser, pack, feature/release, persona, test-ID,
and access-profile checks also succeed. Display but never dispatch ineligible, disabled, deprecated, or
non-ready entries. Classify missing access, authentication, data, cleanup, network, or other runtime
prerequisites as blocked/infrastructure conditions rather than functional product failures.

## Environment applicability

Determine applicability per test from the confirmed target, test behavior, data/cleanup contract, auth
contract, and configured projects. Never default every generated test to `local`, copy all known
environments onto every entry, or infer that a local-mock test is suitable for TEST/UAT.

Every cataloged test needs at least one approved non-production environment. If applicability is not
authoritative, stop catalog mutation and report the missing environment decision under the execution
target gate; do not publish a falsely portal-ready entry. If an established portal schema supports a
separate draft/not-ready state, preserve and validate that state, but do not invent a second readiness
model for a new catalog.

## Test-pack semantics

`testPacks` is a non-empty, unique subset of `Smoke`, `Regression`, `UAT`, `Critical Journey`, and
`Feature`. Assign only packs whose criteria the test meets; never attach every pack by default.

- `Smoke`: a minimal, deterministic check of deployment viability or a vital path, normally read-only
  and suitable for fast fail-fast execution. Smoke is not a synonym for every happy path.
- `Regression`: stable, repeatable coverage that protects established behavior from recurrence. New or
  environment-blocked coverage does not become Regression merely because it is automated.
- `UAT`: a business acceptance scenario with an approved UAT environment, evidenced business persona,
  and business-facing expected outcome.
- `Critical Journey`: an end-to-end path whose failure materially blocks a key business objective. It
  requires `Critical` or `High` risk plus a rationale in the plan.
- `Feature`: coverage selected for a concrete `featureReference` or `releaseReference`. Portal/workflow
  selection must require that scope and filter by it; `Feature` alone must never mean the whole catalog.

Keep technical suite tags synchronized with pack membership where the workflow relies on tags, but do
not infer business pack membership solely from a tag name.

## Persona and authentication mapping

`businessPersona` and `runtimeAuthProfile` are separate dimensions. The persona describes the actor and
authorization behavior under test; the auth profile identifies how an approved runtime principal is
obtained. Multiple personas must not share one administrator profile unless requirements and the
access-profile contract prove that mapping valid.

For every role-sensitive test, validate that `businessPersona`, `runtimeAuthProfile`, and the
developer-supplied `requiredAccessProfile` form an approved mapping to the required
roles/scopes/audiences. Keep browser-user profiles separate from application/service identity profiles.
Never use a workflow-wide implicit persona such as `platform_admin`; workflow input or catalog
selection must resolve the test's approved profiles without exposing credential values. Treat an
access-profile mismatch as `Blocked`, not `Failed`.

## Traceability and result correlation

Statically resolve this chain for every catalog entry:

`requirementReferences -> storyReference -> planReference -> journeyId -> testId -> specPath/testId`

The same stable `testId` must be available in generated Playwright result metadata through the
repository's established annotation/tag/reporter mapping so a later execution layer can correlate the
result with `applicationId + testId` without parsing a title. Enforce catalog-local and source-local
uniqueness, equality with `automationReference.testId`, non-reuse of retired IDs, and preservation of
disabled/deprecated entries needed by historical results. JSON Schema cannot prove cross-repository
uniqueness, historical non-reuse, source synchronization, or cross-file traceability; require a
semantic publication validator or authoritative registry for those checks.

Generate `expectedOutcome` and the business metadata above at authoring time. Keep execution-request
and execution-result metadata—including actual executed commit SHA, request/run IDs, timestamps,
runtime status and duration, failure category, artifact URLs, callback URLs, and portal user identity—
outside the catalog unless an authoritative platform contract explicitly owns them. Never invent
execution results or claim that unrun tests passed.
