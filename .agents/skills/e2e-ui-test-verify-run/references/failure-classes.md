# Failure classes

`record-execution.mjs classify` gives every failed test one class and one reason, taken from its last attempt. When a
result has several errors, Environment outranks Mechanical, which outranks Behavioural, because an environment
problem explains the errors after it (a 403 while seeding also leaves elements missing).

| Class | Reason | Typical message | Repairable | Owner and action |
| --- | --- | --- | --- | --- |
| Mechanical | `locator-timeout` | `locator.click: Timeout 30000ms exceeded` while waiting for a locator | Yes | This skill: correct the locator or wait |
| Mechanical | `strict-mode-violation` | `strict mode violation: ... resolved to 2 elements` | Yes | This skill: make the locator specific (scope to a region, add `name`, `exact`) |
| Mechanical | `element-detached` | `element is not attached to the DOM` | Yes | This skill: wait for the re-rendered element, then act |
| Mechanical | `not-actionable` | `intercepts pointer events`, `outside of the viewport` | Yes | This skill: wait for the overlay to close or scroll the target. Never `force: true` |
| Mechanical | `assertion-locator-unresolved` | `expect(locator)... Received: <element(s) not found>` | Only with snapshot proof | This skill, only when the failure snapshot shows the element under another role or name; otherwise treat as Behavioural |
| Environment | `target-unreachable` | `net::ERR_CONNECTION_REFUSED`, `ENOTFOUND` | No | `e2e-ui-test-env-setup` or the environment owner: target URL, VPN, service up |
| Environment | `auth-rejected` | `401`, `403`, `Unauthorized`, `Forbidden` | No | `e2e-ui-test-env-setup`: persona credentials, roles, token lifetime |
| Environment | `auth-state-missing` | missing `storageState` file | No | `e2e-ui-test-env-setup`: the auth-state setup step |
| Environment | `api-request-failed` | `apiRequestContext.post: ...` | No | `e2e-ui-test-env-setup` (seeding API) or the data owner |
| Environment | `browser-unavailable` | `Executable doesn't exist`, browser closed | No | The developer's machine: `npx playwright install` |
| Environment | `fixture-or-seed-failure` | any error located in a fixture or synthetic-data directory | No | `e2e-ui-test-env-setup` (fixtures) or `e2e-ui-test-generator` (data builders) |
| Environment | `environment-contract` | missing or invalid `E2E_*` variable | No | The developer: set the lane's variables from the README |
| Behavioural | `assertion-mismatch` | `Expected ... Received ...` with a real received value | No | A person: a possible application defect. The test stays as written |
| Unclassified | `test-timeout` | only `Test timeout of 30000ms exceeded` | No | A person: open the trace and decide |
| Unclassified | `unrecognised` | anything else | No | A person: open the trace and decide |

## Outcomes that are not failures

- **Flaky:** failed, then passed on the retry. Counted as passed. If the same test is flaky in two runs, report a
  wait-quality finding for `e2e-ui-test-generator`.
- **Skipped:** skipped by the test itself or by project configuration. An obligation whose tests were all skipped
  records `executionStatus: Skipped`.

## Unmapped tests

A Playwright result that cannot be matched to exactly one `@e2e-meta` testId is listed as unmapped and never
recorded in the manifest. Since contracts 3.7.0 it keeps its project, outcome and failure, and the dashboard lists it
under "Not matched to a test ID". A parameterized case matches by its testId in the title, or by the case value that
differs between the loop's titles (`US001-J03-cxo` matches "... (cxo)"). The reason names the case values when none
fits. Route the title or metadata fix to `e2e-ui-test-generator`, and a matching bug in the script to the contracts
owner. Errors Playwright raises outside any test (a spec that fails to load, a global setup that throws) are kept as
`runErrors`, classified the same way.

## Why a behavioural failure is never repaired

The run shows what the application does now. The requirement says what it should do. When they differ, changing the
test to match the application would record a defect as expected behaviour. The test stays unchanged, its obligation
stays `Covered` with `executionStatus: Failed`, and a person decides whether the application or the requirement is
wrong.
