# Test Generation Standard (extract: suite authoring)

## Playwright suite requirements

- Import `test` and `expect` from the repository fixture when one exists, otherwise from `@playwright/test`.
- Link each suite to its Markdown plan and each test to a matching `TC-Jxx` and stable `testId`.
- Embed machine-readable `testId`, `journeyId`, and portal-eligibility metadata using the repository's
  established annotation/tag/helper contract. For a new contract, follow
  [test-catalog-schema.md](test-catalog-schema.md). Keep the human-readable title independently
  editable and never use it as the automation identity.
- For a new contract, place one single-line `// @e2e-meta {"testId":"...","journeyId":"...",
  "portalEligible":true}` JSON record immediately before each Playwright test call. Include exclusion
  reason/remediation/owner properties when ineligible. This is the deterministic source read by the
  bundled static inventory script; human titles remain independent.
- Inventory every Playwright test in catalog schema v3, including portal-ineligible setup, utility, and
  diagnostic tests. Synchronize `portalEligible` and its conditional exclusion reason between source
  metadata and the catalog; do not use catalog absence as exclusion.
- Declare the evidenced business persona separately from the approved runtime auth profile for every
  role-sensitive test. Require its non-secret access-profile alias from the developer or authoritative
  platform documentation, keep it distinct from both fields, and do not apply an administrator persona
  or fixture as a suite-wide default.
- Prefer `getByRole`, `getByLabel`, `getByText`, `getByPlaceholder`, and `getByTestId` when a stable test ID already exists.
- Avoid brittle CSS/XPath selectors, `waitForTimeout`, and blanket `networkidle` waits.
- Establish deterministic state through fixtures and route interception, not by chaining browser tests.
- Cover relevant happy paths, validation failures, empty/loading/error states, navigation, filters, boundaries, privacy suppression, RBAC, downloads, and API failure recovery.
- Parameterize genuinely repeated boundary checks while keeping individual journey IDs visible.
- Verify downloads through the Playwright download event and metadata; do not depend on a committed local download.
- Read staging credentials only from environment variables. Never commit credentials or storage state.
- Use `test.skip(condition, 'specific reason — remediation: <concrete action>; owner: <owner>')` for
  unavailable credentials, data, environments, access profiles, or implementation. The action must
  clear the blocker rather than restating it. Never add empty tests or assertions that always pass.
- Do not fabricate browser coverage for schedulers, queues, database jobs, ingestion internals, or other behavior without an observable UI contract. Document an integration/manual gap or a specifically reasoned skip.

## Scenario expansion: authoring rules


Avoid a Cartesian product of unrelated variants. Deduplicate only when preserved cases still establish
every applicable rule. Parameterized tests must retain a distinct stable identity for each concrete
case. Follow the static inventory's supported contract; unresolved dynamic factories require explicit
review/remediation rather than invented inventory identities. Trace shared helper assertions and their
actual invocation with case-specific inputs; importing a helper is not evidence of exercising it.

For client-side validation that must prevent mutation, observe requests before the interaction, perform
the completed invalid submission, assert the specific feedback, assert no relevant mutation request
occurred throughout that interaction, and verify the workflow remains in its required state. Use a
deterministic completion signal, not an arbitrary delay or an instantaneous pre-submission counter.
Real server validation needs appropriate integration evidence of response and unchanged persisted state;
blocking a browser request or returning a mock validation error does not establish it.

Regression example only: a trimmed rejection reason constrained to 20–2000 characters requires missing/
empty, whitespace-only, 19, 20, 2000 and 2001 characters and a typical valid reason. The values and actions
come from that source contract; do not impose them on other applications.


Record every intercepted call and the behavior it replaces. Supplying unsorted mocked data does not
test backend sorting when the UI intentionally preserves API order. Integrated state-changing journeys
require approved deterministic seed/reset and cleanup; preserve a concrete design and readiness gap
when unavailable. Never invent endpoints, weaken authentication, or mutate shared records by assumption.
