# Coverage manifest v1

Read before extraction, authoring and validation. Keep catalog schema **3.0** unchanged: the manifest
is a versioned companion joined by `applicationId + testId`, not extra fields injected into portal
entries. Existing catalog-only consumers and module-format setup remain compatible. Legacy artifacts
remain usable but cannot establish hardened coverage until reconciled. Add the companion artifacts
within the authorized documentation/coverage scope; do not change setup or portal workflow contracts.

## Independent inventory

Use `.agents/contracts/e2e-ui-test/schemas/requirements-inventory.schema.json`. Save `<docs-e2e-root>/requirements-inventory.json`
before test generation. Its `requirements` array defines the complete confirmed scope independently
of generated tests and their claims. Each row contains `storyId`, source-owned `requirementId`,
`sourceReference: {path, heading}`, verbatim `sourceText`, `sourceFingerprint`, and stable `obligationIds`.
Represent other authoritative in-scope rules with deterministic IDs and document their derivation.
Never construct the authority inventory from a catalog.

Write inventory schema **1.1**. Schema 1.0 still parses but fails gates G-D01 and G-D02.
Produce the inventory in its own extraction pass, reading only the authority, before any plan exists, and
record that in `extraction: {pass: "independent-extraction", producedBy, sourceCommit}`. It adds:

- `criteriaSections`: `headingPattern` (a regular expression for the headings that hold criteria);
  `sections: [{path, heading, units}]`, where `heading` is the exact heading line, and each unit is
  `{index, kind, disposition}`. `kind` is `list-item`, `numbered-item`, `table-row`, `paragraph` or
  `code-block`. `disposition` is `criterion` with `requirementIds`, or `non-criterion` or `out-of-scope`
  with a precise `reason`. Number units from 1 in document order; a nested list item, each table body
  row and each paragraph is its own unit. List pattern-matching headings you deliberately skip in
  `excludedSections` with a reason.
- `sourceIdentifiers`: either `{pattern, sections: [{path, heading}]}` naming the traceability sections
  that declare source-owned identifiers, or `{none: reason}` when the authority owns none.
- `requirementGroups`: one `{groupId, sourceReference, sourceText, requirementIds}` per identifier found
  in those sections; an empty `requirementIds` needs `noCriterionReason`. Every criterion belongs to at
  least one group when groups exist.

The manifest then carries `requirementGroups: [{groupId, coverageStatus}]`, rolled up from the member
criteria; a group with no criterion is `Blocked`, `NotBrowserObservable` or `OutOfScope`. Every obligation
records `plannedJourneys` (the `TC-Jxx` IDs in its plan that will establish it); it is plan-owned, part of
the approval fingerprint, and required for `Planned`.

Fingerprints are SHA-256 of the entire UTF-8 source file after CRLF-to-LF normalization, without
trimming. A change conservatively requires reassessment of every row referencing that file. Keep
verbatim criterion text separately so both location and wording can be checked. Preserve source IDs
and derived obligation IDs when meaning is unchanged. Read all conflicting sources; record precedence
or the isolated decision needed. Do not refresh hashes as a substitute for reviewing changes.

## Plans, ledger and gaps

`artifacts` contains `ledger`, `gaps`, and `plans: [{path, obligationIds}]`. All paths, including catalog
automation/plan paths and supplied results, are relative to the explicit `--root`. Plan membership
must partition the inventoried obligations exactly. Keep existing document locations.

Embed exactly one `<!-- coverage-data JSON -->` block in each document. JSON is an array sorted by
`obligationId`, whose rows contain the following keys in this order (the exported `projections`
function in `.agents/contracts/e2e-ui-test/scripts/validate-coverage.mjs` is the canonical renderer):

```json
{"obligationId":"EX-AC1.a","requirementId":"EX-AC1","persona":"Reviewer","coverageStatus":"Covered","executionStatus":"NotRun","testIds":["EX-J01"],"blocker":"","remediation":"","owner":""}
```

Ledger contains all rows, gaps contain exactly non-Covered rows, and each plan contains its declared
obligations. `.agents/contracts/e2e-ui-test/scripts/sync-coverage.mjs` renders all of these blocks and the rollups from the
manifest; run it instead of writing them by hand. When the inventory has requirement groups, the ledger also embeds exactly one
`<!-- coverage-groups JSON -->` block: an array sorted by `groupId` of
`{"groupId","coverageStatus","requirementIds"}` with sorted criterion IDs (the exported `groupProjections`
function in `.agents/contracts/e2e-ui-test/scripts/traceability.mjs` is the canonical renderer). Sort test IDs; render absent blocker/remediation/owner as empty strings. Derive tables and
prose from these rows. Visible content that changes when tests are authored (status columns, test IDs,
assertion references, semantic review) goes inside `<!-- coverage-view:start -->` ...
`<!-- coverage-view:end -->` regions, which the plan fingerprint blanks like the projection block. Regions
must balance, must not nest, and must not contain a level-1 or level-2 heading; a malformed plan is
fingerprinted whole and fails G-D05. The static validator checks machine projections exactly; semantic review must
also check visible prose, journey steps, catalog descriptions, and review truthfulness. A matching
hidden projection cannot legitimize contradictory visible claims. Existing normalized tables remain
available for legacy validation; do not replace them with hidden data alone.
