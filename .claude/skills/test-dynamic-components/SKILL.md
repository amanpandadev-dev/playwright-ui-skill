---
name: test-dynamic-components
description: Test modals, toasts, tabs, accordions, tables, infinite scroll, tooltips and carousels for behavior, focus and states.
---

## When to use
Pages whose coverage map lists these components.

## Inputs
Coverage map, `expectations`.

## Preconditions
Preflight passed.

## Steps
Trigger each component, interact by mouse and keyboard, observe focus and DOM state.

## Checks
- DYN-01 Modal opens; closes with X, Esc, backdrop (where designed); focus trapped inside, returns to trigger.
- DYN-02 Modal has role=dialog, accessible name, and scroll lock.
- DYN-03 Toasts appear, are readable long enough, dismissible, announced (live region).
- DYN-04 Tabs/accordions: state, arrow-key navigation, aria-selected/expanded.
- DYN-05 Tables: sort, filter, pagination, empty state, long values, loading skeleton.
- DYN-06 Infinite scroll loads more, no duplicates, has end state.
- DYN-07 Tooltips appear on hover and focus, dismiss with Esc.
- DYN-08 Carousels: controls, keyboard, pause for auto-rotate.

## Evidence to capture
Screenshots per state, focus element before/after.

## Blockers
B-OVERLAY, B-FRAME, B-A11Y-TREE.

## Output
`test-dynamic-components.json`.
