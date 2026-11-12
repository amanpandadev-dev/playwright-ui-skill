# Artifact Layout

Use this routing algorithm so generated documentation stays inside `docs/` while executable Playwright
files follow a deterministic greenfield default or the established brownfield convention.

## Documentation root

1. Reuse an existing E2E-specific directory, preferring the first match among:
   - `docs/tests_e2e`
   - `docs/test-cases_e2e`
   - `docs/test-plans_e2e`
   - `docs/e2e`
2. When only a generic testing directory exists, create a sibling by appending `_e2e`. Examples:
   - `docs/test-cases` becomes `docs/test-cases_e2e`
   - `docs/qa` becomes `docs/qa_e2e`
3. When no testing directory exists under `docs/`, create `docs/tests_e2e`.

Never create names such as `tests_e2e_e2e`. Reuse the selected E2E documentation root on later runs.

## Greenfield executable layout

Normalize the product or feature name to lowercase kebab-case as `<scope>`.

```text
docs/tests_e2e/<scope>/
  TC-<feature>-<story-id>.md

docs/tests_e2e/
  README.md
  coverage-ledger.md
  gap-register.md

tests/e2e/<scope>/
  fixtures/
    test.ts
    synthetic-data.ts     seeded lanes: generator and teardown registry
    seeded-data.ts        seeded lanes: create through the API, register cleanup
    mock-api.ts           route-mocks lanes, or declared external mocks
    staging-auth.ts
  data/                   seeded lanes: generated builders and expected values
  <story-or-feature>.spec.ts

tests/e2e/test-catalog.json
tests/e2e/test-catalog.schema.json
tests/e2e/README.md
.github/workflows/execute-tests.yml
```

The actual E2E documentation root may differ according to the routing rules above. Keep Markdown plans
and manual instructions under `docs/`; do not place executable `.spec.ts` files there.

The catalog and schema are repository-wide rather than feature-local. Reuse an authoritative existing
location in brownfield repositories. Otherwise keep the pair together at the greenfield paths above;
never create one catalog or schema per feature.

The two README files, coverage ledger, gap register, and GitHub workflow are also repository-wide.
Follow [readme-contract.md](readme-contract.md) and
[../../e2e-ui-test-plan-generator/references/coverage-completeness.md](../../e2e-ui-test-plan-generator/references/coverage-completeness.md). Create no alternate workflow-platform or
external managed-browser configuration.

## Brownfield executable layout

- Read the owning `playwright.config.*`, package scripts, imports, and existing suite tree.
- Keep executable suites under the established `testDir` and preserve current fixture/page-object
  organization.
- Use the E2E documentation-root routing above even when executable tests live somewhere other than
  `tests/e2e`.
- Do not move existing suites or create `tests/e2e` merely to match the greenfield default.
- If multiple test roots exist, select the one owned by the requested package/config and record the
  choice in the generated README.

## Existing artifacts

- Inspect existing plans, suites, fixtures, and configuration before writing.
- Extend compatible artifacts rather than replacing them.
- Preserve unrelated tests and user-authored content.
- Resolve naming collisions by adding a meaningful scope suffix, not a numeric duplicate.
- If the repository already has a well-established E2E convention, follow it and document the deviation from this default in the generated README.
- Record `Project mode: Greenfield` or `Project mode: Brownfield` and the executable test root in every
  generated README.
- For incremental output, also record `Operation mode: Incremental feature generation` and the exact
  story/feature/source scope.
