# Repair rules

A repair makes a test find the element it already meant to find, at the right moment. It never changes what the
test checks. `check-repair-diff.mjs` enforces these rules; its header comment is the authoritative list.

## Allowed

- **Locators** in actions, page objects and helpers, and as the subject of an assertion when both the old and new
  subject are locator expressions. Prefer, in order: `getByRole` with `name`, `getByLabel`, `getByPlaceholder`,
  `getByText` scoped to a region, `getByTestId`. Scope with a parent locator (`page.getByRole('dialog', { name: ... })`)
  before adding `.first()` or `.nth()`.
- **Waits on state:** `locator.waitFor()`, `page.waitForURL()`, `page.waitForResponse()` for a declared call.
- **Navigation:** the route passed to `page.goto()`, or an extra navigation step the journey needs.
- **Fixture module:** importing `test` from another existing shared fixture module.

## Forbidden

- Any change to an `expect(...)`: adding, removing, reordering, the matcher, `.not`, `expect.soft`, expected
  values, the custom message, or a dropped `await`.
- Test identity and control: `@e2e-meta`, `@e2e-evidence`, titles, `test.skip`, `test.fixme`, `test.only`,
  `test.slow`, `test.setTimeout`, `test.use`, `test.describe` and `test.step` calls.
- New control flow: `if`, early `return`, `try/catch`, loops, `&&` or `||` guards. Optional UI, such as a cookie
  banner, belongs in a shared fixture owned by `e2e-ui-test-env-setup`.
- Shortcuts: `page.route` and other mocks, `evaluate` or injected scripts, `dispatchEvent`, `force: true`,
  `waitForTimeout`, `waitUntil: 'networkidle'`, `.catch()`.
- New package imports, new or deleted files, and any edit to fixtures, synthetic-data builders, the catalog,
  configuration or application code.

## Choosing the new locator

1. Open `artifacts-<n>/<test folder>/error-context.md`. It holds the accessibility snapshot of the page when the
   test failed. Find the element the test meant by its purpose in the requirement, not by its old locator text.
2. Confirm the role and accessible name in the application source (component, translation file). A locator
   that exists in both the snapshot and the source is stable. Prefer a name from source over displayed data.
3. If several elements match, scope to the nearest landmark or dialog the snapshot shows.
4. If the element is not in the snapshot at all, do not repair. The failure is behavioural or environmental;
   report it.

## When the check rejects a repair

`check-repair-diff.mjs check` exits 2 and lists each forbidden change. Restore every rejected file to its
content in the snapshot file (the `files` map), then make an allowed repair or leave the failure unrepaired and
report it. Never delete or edit a `repair-<n>.json` report.

## Limits

- Two repair rounds per run: repairs after attempt 1 and after attempt 2. Mechanical failures left after
  attempt 3 become blockers for `e2e-ui-test-generator`.
- The check sees structure, not meaning. A locator that matches the wrong element passes it. Every repair is listed
  in the hand-off report for a person to review.
