---
name: test-search
description: Test search boxes with hit, miss, empty, long, special-character and rapid-typing inputs, plus suggestions, deep links and back-navigation.
---

## When to use
For each page flagged `search: true` in the coverage map.

## Inputs
`searchData.hits`, `searchData.misses`, `expectations`. Special inputs: see `inputs.md`.

## Preconditions
Preflight passed. If `hits` or `misses` is `TODO`, SRCH-01/02 are BLOCKED (B-INPUT); run the rest.

## Steps
Locate the search field (role searchbox/combobox or label), submit queries via Enter and via button, and inspect results, URL, console and network.

## Checks
- SRCH-01 Known hit returns relevant results.
- SRCH-02 Known miss shows a clean empty state, no error.
- SRCH-03 Empty query and whitespace-only handled (no crash; sensible message or no-op).
- SRCH-04 Very long input (500+ chars) handled without error page.
- SRCH-05 Special characters and unicode/emoji handled and echoed escaped.
- SRCH-06 Leading/trailing spaces trimmed; case-insensitive.
- SRCH-07 Enter and search button give identical results.
- SRCH-08 Suggestions (if present) are keyboard-navigable (arrows, Enter, Esc).
- SRCH-09 Results persist after back-navigation.
- SRCH-10 URL reflects query; opening it fresh reproduces results.
- SRCH-11 Rapid typing yields no stale or out-of-order results.
- SRCH-12 No console errors or failed requests.

## Evidence to capture
Screenshot of results/empty state, request URL and status, console.

## Blockers
B-RATE (throttle queries), B-OVERLAY, B-BOT.

## Output
`test-search.json`.
