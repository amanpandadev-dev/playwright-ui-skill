---
name: test-responsive
description: Test layout at mobile, tablet and desktop widths - scroll, nav collapse, tap targets, modals, text overlap and P0 journey completion.
---

## When to use
Key pages and P0 journeys at three viewports.

## Inputs
Mobile device (default iPhone 15), tablet 768px, desktop 1280px+.

## Preconditions
Preflight passed.

## Steps
Repeat page walkthroughs per viewport; then rerun each P0 journey on mobile.

## Checks
- RESP-01 No horizontal scroll at any viewport.
- RESP-02 Nav collapses to a working menu on mobile.
- RESP-03 Tap targets at least 24x24 CSS px (prefer 44) and not overlapping.
- RESP-04 Modals and drawers fit the viewport and are scrollable.
- RESP-05 Text not clipped or overlapping; images scale.
- RESP-06 Forms usable with the on-screen keyboard (inputs not hidden).
- RESP-07 P0 journeys complete on mobile.
- RESP-08 Orientation change (portrait/landscape) does not break layout.

## Evidence to capture
Screenshot per viewport per page.

## Blockers
B-OVERLAY (cookie banners often cover mobile), B-HANG.

## Output
`test-responsive.json` with `viewport` set on each result.
