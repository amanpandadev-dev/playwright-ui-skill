---
name: test-error-resilience
description: Test how the UI handles API errors, timeouts, slow responses, offline mode, empty data and malformed data using network mocking.
---

## When to use
On key pages and journeys after P0 passes.

## Inputs
Key API endpoints (from network log during discovery), `expectations`.

## Preconditions
Preflight passed. Mocking applies only to the browser session; never alter real backend data.

## Steps
For each key call, mock a response (500, 404, 401, timeout, slow, empty, malformed) or set the context offline mid-action, then observe UI and recover by unmocking.

## Checks
- ERR-01 API 500: friendly message, no blank screen.
- ERR-02 API 404: handled, not a crash.
- ERR-03 API 401: redirect/message, not silent failure.
- ERR-04 Timeout/slow (5-10s): loading indicator, no infinite spinner (B-HANG if so, FAIL).
- ERR-05 Offline mid-action: clear message, retry works on reconnect.
- ERR-06 Empty data set: meaningful empty state.
- ERR-07 Malformed/partial payload: no crash, no raw error or stack trace.
- ERR-08 User can retry without reload; form input not lost.
- ERR-09 No unhandled promise rejection in console.

## Evidence to capture
Screenshot of the error state, the mock used, console.

## Blockers
B-HANG, B-FRAME.

## Output
`test-error-resilience.json`.
