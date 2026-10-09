---
name: test-auth-session
description: Test login, logout, protected routes, role-based access and session expiry without locking shared accounts or bypassing MFA.
---

## When to use
After preflight, for every role in `target.yaml`.

## Inputs
`roles`, `loginPath`, credentials from env vars, admin-only URLs from `expectations`.

## Preconditions
Preflight passed. MFA present -> B-AUTH, BLOCKED.

## Steps
Use fresh contexts for signed-out checks and saved storage state for signed-in checks.

## Checks
- AUTH-01 Valid login per role lands on expected page.
- AUTH-02 Wrong password shows a generic error, no user enumeration.
- AUTH-03 Unknown user shows the same generic error.
- AUTH-04 Empty fields give validation messages.
- AUTH-05 Lockout message: only verify if documented; never lock shared accounts (use a disposable account if provided, else NEEDS-REVIEW).
- AUTH-06 Logout clears session; Back does not show protected content.
- AUTH-07 Protected URLs redirect to login when signed out (and return after login if designed).
- AUTH-08 Role-based access: standard user cannot reach admin URLs by direct navigation (expect 403/redirect). Failure is S1.
- AUTH-09 Session expiry: clear session cookie, act -> graceful redirect/message, no data loss crash.
- AUTH-10 "Remember me" (if present) persists across browser restart.
- AUTH-11 Password field masked; no credentials in URL.

## Evidence to capture
Screenshots, redirect chain, status codes. Never capture typed passwords.

## Blockers
B-AUTH, B-BOT, B-RATE.

## Output
`test-auth-session.json`.
