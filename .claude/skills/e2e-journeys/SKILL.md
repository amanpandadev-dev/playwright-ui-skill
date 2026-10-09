---
name: e2e-journeys
description: Run each critical user journey from target.yaml step by step, in priority order, and report per-step results as the main go/no-go input.
---

## When to use
After component P0 skills, and again on the release candidate.

## Inputs
`journeys` (id, name, role, priority), `expectations`, `allowDestructive`.

## Preconditions
Preflight passed; storage state for the journey role. A journey still `TODO` -> BLOCKED (B-INPUT).

## Steps
1. Order journeys P0 first.
2. Expand each journey into explicit steps with an expected outcome per step; confirm the step list with the user if ambiguous (NEEDS-REVIEW).
3. Execute, calling component skills where useful (search, forms, buttons).
4. Repeat P0 journeys on each target browser and the mobile profile when requested.

## Checks
- JNY-<id>-<n> per step: reached, correct data shown, no console errors, no failed requests.
- JNY-<id>-END final outcome achieved (e.g. order confirmation in test mode).
- Any step failing a P0 journey is S1 unless a workaround exists (then S2).

## Evidence to capture
Screenshot per step, trace for failures.

## Blockers
All of `blocker-handling`. Destructive step with `allowDestructive: false` -> BLOCKED.

## Output
`e2e-journeys.json` with a `journey` and `step` field added to each result, plus a journey-level summary (PASS only if every step PASS).
