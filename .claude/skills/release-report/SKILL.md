---
name: release-report
description: Combine all run JSON files into reports/release-report.md with a GO / GO WITH RISKS / NO-GO recommendation and ready-to-file bugs.
---

## When to use
After test runs, for the go/no-go meeting.

## Inputs
`reports/runs/<ts>/*.json`, `coverage-map.json`, `target.yaml`, Playwright results JSON.

## Preconditions
At least one run folder exists. Use the latest run per skill on the final build; say which runs were used.

## Steps
Aggregate results, de-duplicate repeated failures of one root cause, and write the report.

## Report sections
1. Recommendation (GO / GO WITH RISKS / NO-GO) with a one-paragraph rationale.
2. Build tested, environment, dates, browsers, devices.
3. Summary counts by status and severity.
4. P0 journey matrix (journeys x browsers/devices).
5. Open S1/S2 bugs: repro steps, evidence, ready-to-file title and body.
6. Blocked areas: code, remediation, owner.
7. Flaky checks.
8. Coverage: discovered vs tested, and what was not covered and why.
9. Accessibility summary by impact.

## Go/no-go (defaults)
- NO-GO: open S1; any P0 journey FAIL on Chromium or mobile; unresolved B-STALE/B-ENV/B-PROD; critical security-hygiene failure.
- GO WITH RISKS: no S1; every S2 has an owner and accepted workaround; BLOCKED areas accepted by the product owner.
- GO: no open S1/S2; all P0 journeys pass on Chromium, Firefox, WebKit, mobile; no critical a11y violations on P0 pages.

## Checks
- REP-01 Counts in the report match the JSON.
- REP-02 No credentials or secrets in the report or evidence.
- REP-03 Every BLOCKED item has code, remediation, owner.

## Evidence to capture
Links (relative paths) to evidence files.

## Blockers
B-INPUT if no run data.

## Output
`reports/release-report.md`.
