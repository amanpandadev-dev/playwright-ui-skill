---
name: test-navigation
description: Test links, menus, titles, back/forward, deep links, 404 page, external links, breadcrumbs and mobile menu.
---

## When to use
Every in-scope page, desktop and mobile.

## Inputs
Coverage map links, `outOfScope`.

## Preconditions
Preflight passed.

## Steps
Visit each in-scope link/menu item; check response, title, H1; test history; open deep links in a fresh context; visit a bogus URL.

## Checks
- NAV-01 Every in-scope link resolves (no 404/5xx).
- NAV-02 Page title and H1 present and correct.
- NAV-03 Back/forward preserve state (filters, scroll, form data where expected).
- NAV-04 Deep links work when opened fresh (with and without auth as appropriate).
- NAV-05 404 page exists, is helpful (link home), and returns 404.
- NAV-06 External links open as intended (`target=_blank` + `rel` has noopener) (B-TAB).
- NAV-07 Breadcrumbs correct and clickable.
- NAV-08 Mobile hamburger menu opens, closes, traps/returns focus.
- NAV-09 Active nav item highlighted (aria-current).
- NAV-10 No redirect to a prod domain (B-PROD).

## Evidence to capture
Status/URL table, screenshots of failures.

## Blockers
B-PROD, B-TAB, B-RATE, B-ACCESS.

## Output
`test-navigation.json`.
