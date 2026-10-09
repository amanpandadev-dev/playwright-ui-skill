---
name: test-buttons-controls
description: Test every button, toggle and button-like control for labeling, state, click outcome, double-click safety, loading state and keyboard use.
---

## When to use
For each page in the coverage map that has buttons or toggles.

## Inputs
Coverage map; `allowDestructive`; `expectations`.

## Preconditions
Preflight passed; logged in as the role the page needs.

## Steps
For each control: locate by role+name, check state, activate, observe, restore state. Skip destructive controls (delete, pay, send) unless `allowDestructive` and the target record was created by this run.

## Checks
- BTN-01 Visible with accessible name (icon-only buttons need aria-label).
- BTN-02 Enabled/disabled state correct for context (e.g. submit disabled until valid).
- BTN-03 Click produces an observable result (navigation, state change, toast, network call).
- BTN-04 Double-click does not fire the action twice (count network calls / records).
- BTN-05 Slow action shows a loading state and prevents repeat clicks.
- BTN-06 Keyboard: reachable by Tab, activates with Enter and Space (links: Enter).
- BTN-07 No new console errors on click.
- BTN-08 Toggles/checkboxes reflect state (aria-pressed/checked) and persist as expected.
- BTN-09 Links styled as buttons, split buttons, dropdown toggles behave as their role says.

## Evidence to capture
Before/after screenshots, network log of the click, console delta.

## Blockers
B-OVERLAY, B-DIALOG, B-TAB, B-A11Y-TREE, B-HANG.

## Output
Results per control in `test-buttons-controls.json` (foundation schema).
