---
name: test-accessibility
description: Test accessibility with axe scans and manual checks for keyboard use, focus, headings, alt text, labels, live regions and zoom.
---

## When to use
Each key page and each P0 journey.

## Inputs
Coverage map, journeys.

## Preconditions
Preflight passed. Axe runs through generated specs using `@axe-core/playwright`; the agent runs manual checks.

## Steps
Scan each page with axe (WCAG 2 A/AA tags); then do manual keyboard-only runs.

## Checks
- A11Y-01 Axe violations by impact: critical/serious -> S2 (S1 if blocking a P0 journey), moderate -> S3, minor -> S4.
- A11Y-02 Complete each P0 journey by keyboard only.
- A11Y-03 Visible focus indicator on every interactive element.
- A11Y-04 Skip-to-content link present and works.
- A11Y-05 Exactly one H1; heading order logical.
- A11Y-06 Images have alt (decorative = empty alt).
- A11Y-07 Form controls have labels; errors programmatically associated.
- A11Y-08 Toasts/errors announced via live regions.
- A11Y-09 200% zoom: no loss of content or function.
- A11Y-10 Color contrast issues from axe reviewed; reduced-motion respected.

## Evidence to capture
Axe JSON per page, screenshots of failing elements with selectors.

## Blockers
B-A11Y-TREE counts as a finding here, not a blocker.

## Output
`test-accessibility.json` and `evidence/axe-<page>.json`.
