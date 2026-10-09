---
name: env-preflight
description: Gate to run at the start of every test session - verifies target reachable, correct build, no bot block, logins work, and records console baseline.
---

## When to use
Start of every session, before any other test skill. If it fails, stop the run and emit a BLOCKED report.

## Inputs
`baseUrl`, `buildVersion`, `prodDomains`, `roles`, `loginPath` from `target.yaml`; credentials from env vars.

## Preconditions
Load `web-test-foundation`. All inputs not `TODO`, otherwise BLOCKED (B-INPUT) listing each missing one.

## Steps
1. Confirm `baseUrl` host is not in `prodDomains`.
2. Navigate to `baseUrl`; record status, final URL, redirects.
3. Find the build identifier (footer, `/version`, meta tag) and compare to `buildVersion`.
4. Look for challenge/block pages.
5. For each role, log in with env credentials and save storage state to `auth/<role>.json`.
6. Reload home page; record console errors/warnings as the baseline.

## Checks
- PRE-01 URL reachable with 2xx. Else B-ENV / B-ACCESS.
- PRE-02 Final URL not a prod domain. Else B-PROD (stop).
- PRE-03 Build version matches. Else B-STALE (block service workers / clear cache, recheck once).
- PRE-04 No bot/CAPTCHA/WAF page. Else B-BOT.
- PRE-05 Login works per role. MFA or SSO loop -> B-AUTH.
- PRE-06 No uncaught console errors on home page (baseline recorded; errors are S3 unless the page is broken).
- PRE-07 TLS valid. Else B-CERT (staging only: rerun ignoring HTTPS errors and record it).

## Evidence to capture
Home-page screenshot, response headers summary, console baseline, version string found.

## Blockers
All codes in `blocker-handling` apply. Any failing PRE check except PRE-06 stops the run.

## Output
`reports/runs/<ts>/env-preflight.json` plus `reports/runs/<ts>/baseline-console.json`. End with a one-line verdict: PROCEED or STOP (with codes).
