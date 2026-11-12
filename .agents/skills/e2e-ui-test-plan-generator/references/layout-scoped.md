# Artifact Layout (extract: scoped layouts)

## Incremental generation layout

- Reuse the current documentation root, feature grouping, executable `testDir`, and naming patterns.
- Add a new feature directory only when the confirmed scope does not belong to an existing feature
  group.
- Do not recreate or rename README, seed, fixture, helper, page-object, or auth scaffolding.
- Do not relocate or renumber existing plans, journeys, or suites.
- If every confirmed criterion is already covered, create no files.
- Upsert only the confirmed catalog, ledger, and gap rows; preserve unrelated rows.

## Full-coverage sweep layout

- Reuse the established executable and documentation roots and all setup artifacts.
- Reconcile the complete explicit manifest into the existing ledger and gap register.
- Add only uncovered story/criterion artifacts and synchronized catalog entries.
- Do not create missing base READMEs, configuration, workflow, schema, or shared fixtures; report a
  setup prerequisite instead.
