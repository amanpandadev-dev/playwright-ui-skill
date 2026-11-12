# Test Generation Standard

Generate reviewable, traceable plans and syntactically complete Playwright suites without executing, compiling, or discovering them through the Playwright runner.

## Requirement extraction

First apply [coverage-completeness.md](coverage-completeness.md) and the independent source extraction
and obligation schema in [coverage-manifest.md](coverage-manifest.md). Preserve verbatim ACs and split
compound clauses before authoring. Derive journey count from distinct obligations and applicable
scenario variants, never a fixed minimum or maximum. A metadata reference is a claim requiring actual
actions and assertions. Use [../../../contracts/e2e-ui-test/templates/journey-plan.template.md](../../../contracts/e2e-ui-test/templates/journey-plan.template.md)
for concrete plans and [../../e2e-ui-test-coverage-evaluator/references/semantic-review.md](../../e2e-ui-test-coverage-evaluator/references/semantic-review.md) after static checks.

For implementation specs:

- Map acceptance criteria, boundary cases, RBAC, API contracts, validation, error handling, and observability-relevant UI behavior.
- Use source story and criterion identifiers in the traceability matrix.

For PRDs:

- Map user stories and acceptance criteria to observable browser journeys.
- Record implementation assumptions explicitly because a PRD may not define selectors, routes, or API contracts.

For source code:

- Inspect routes, components, accessible names, forms, data-fetching code, state management, API clients, and authorization guards.
- Treat visible implemented behavior as authoritative; do not invent controls or routes.
- Record the exact source files used as evidence.

For greenfield requirements without implemented UI:

- Treat documented routes, controls, API behavior, and personas as a proposed UI contract.
- Separate evidenced contract details from assumptions and implementation TODOs.
- Generate syntactically complete suites, but explicitly skip journeys whose required UI or backend
  surface does not exist. The skip reason must name the missing implementation dependency.

For brownfield projects:

- Use the existing config, fixtures, helpers, page objects, tags, and suite conventions as implementation
  context.
- Extend reusable artifacts and preserve existing test identifiers; do not duplicate helper stacks.

For incremental feature generation:

- Require the confirmed feature/story/source scope before authoring.
- Map existing source criteria, plan journeys, and suite tests before adding coverage.
- Generate uncovered obligations, including missing parts of existing criteria; verify existing claims
  before reporting them already covered.
- Revise existing journeys only when the developer names them and supplies changed requirements.
- Keep setup, configuration, agents, scripts, and unrelated artifacts unchanged.

Correct inaccurate in-scope coverage metadata under the scoped repair rules in
[scope-modes.md](scope-modes.md); this does not authorize behavior replacement.

For a full-coverage sweep:

- Read [coverage-completeness.md](coverage-completeness.md) and inventory every story, criterion, and
  evidenced persona in the explicit manifest before authoring.
- Preserve existing valid coverage and generate only uncovered criteria.
- Record backend-only, missing-access, unimplemented, and data/cleanup-blocked criteria with a blocker,
  remediation action, and owner; never silently omit them.
- Keep setup frozen exactly as for incremental generation.

For Azure setup/configuration and Azure-targeted suites, read
[../../e2e-ui-test-env-setup/references/azure-setup.md](../../e2e-ui-test-env-setup/references/azure-setup.md). Keep Azure specs isolated from local mocked specs, import the Azure
runtime/auth fixture, use real deployed services, and default to auth/RBAC/connectivity/read-only smoke
coverage. State-changing Azure journeys stay precisely skipped until a protected seed/reset and cleanup
contract is confirmed.
