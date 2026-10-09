---
name: test-perf-basics
description: Collect rough performance signals per key page - load time, failed requests, large assets, console noise and layout shift.
---

## When to use
Pre-release, P2. Signals only, not benchmarks.

## Inputs
Coverage map key pages.

## Preconditions
Preflight passed.

## Steps
Load each key page cold, wait for settle, collect timings and network log.

## Checks
- PERF-01 Load/settle time recorded; over 5s -> S3, over 10s -> S2.
- PERF-02 Failed requests (4xx/5xx) during normal use.
- PERF-03 Assets over 1 MB listed.
- PERF-04 Console errors and warnings per page vs baseline.
- PERF-05 Visible layout shift during load.
- PERF-06 Repeated duplicate requests.

## Evidence to capture
Network summary, console dump, screenshots.

## Blockers
B-HANG, B-RATE.

## Output
`test-perf-basics.json`.
