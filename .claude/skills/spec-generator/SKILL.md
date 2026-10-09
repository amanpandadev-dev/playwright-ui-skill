---
name: spec-generator
description: Turn passing P0/P1 checks into stable Playwright Test specs, and failing checks into test.fail specs linked to bugs.
---

## When to use
After P0/P1 skills have run, and on the release candidate.

## Inputs
`reports/runs/<ts>/*.json` (with `locators`), `target.yaml`.

## Preconditions
Results exist. Specs read credentials only via `auth/<role>.json` storage state or env vars.

## Steps
1. For each PASS check, write a spec in `tests/generated/<skill>.spec.ts` using the recorded role/label locators and explicit `expect` assertions. No fixed sleeps, no hardcoded credentials, no production URLs; use relative paths with `baseURL`.
2. Use `test.use({ storageState: 'auth/<role>.json' })` for logged-in specs.
3. For FAIL checks write `test.fail(...)` with a title containing the bug reference.
4. Axe specs use `@axe-core/playwright` (`new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa']).analyze()`).
5. Skip BLOCKED and NEEDS-REVIEW checks (emit `test.fixme` with the code).
6. Run `npx playwright test` on all projects twice; any inconsistency is FLAKY - fix the locator/wait or exclude and report.

## Checks
- GEN-01 Each spec title starts with the check ID (e.g. `SRCH-01 known hit returns results`).
- GEN-02 Specs pass twice in a row on chromium before being kept.
- GEN-03 Destructive specs absent unless `allowDestructive`.
- GEN-04 A read-only subset is tagged `@smoke` for the production smoke run.

## Evidence to capture
Playwright report and the JSON in `reports/playwright-results.json`.

## Blockers
B-INPUT when `baseUrl` is `TODO`.

## Output
Files in `tests/generated/` and `reports/runs/<ts>/spec-generator.json` listing generated, skipped, and flaky specs.

## Example
```ts
import { test, expect } from '@playwright/test';

test('SRCH-02 known miss shows clean empty state @smoke', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox').fill('zzzz-no-match');
  await page.keyboard.press('Enter');
  await expect(page.getByText(/no results/i)).toBeVisible();
});
```
