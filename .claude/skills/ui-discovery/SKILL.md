---
name: ui-discovery
description: Crawl in-scope pages and inventory interactive elements into a coverage map that decides which component test skills run where.
---

## When to use
After `env-preflight` passes, before component skills.

## Inputs
`baseUrl`, `outOfScope`, crawl depth N (default 2), roles.

## Preconditions
Preflight passed. Storage state exists for roles to crawl.

## Steps
1. Start at `baseUrl`; follow same-origin in-scope links up to N levels. Skip `outOfScope`, logout links, and anything destructive.
2. Per page take a snapshot and inventory: buttons, links, inputs, search boxes, forms, tables, modals/dialog triggers, tabs, menus, file inputs, iframes.
3. Tag each page with component skills that apply (e.g. has search -> `test-search`).
4. Repeat per role; note pages only some roles reach.

## Checks
- DISC-01 Each page loads without 4xx/5xx.
- DISC-02 Interactive elements without accessible role or name are listed (B-A11Y-TREE; a11y finding S3, S2 if on a P0 journey).
- DISC-03 Pages reachable by one role but not another match expectations (NEEDS-REVIEW if unclear).

## Evidence to capture
Screenshot per page, page title, final URL.

## Blockers
B-BOT, B-ACCESS, B-RATE, B-PROD while crawling. Throttle requests; no parallel hammering.

## Output
`reports/runs/<ts>/coverage-map.json`:
```json
{ "pages": [ { "path": "/", "title": "", "roles": ["standard"],
  "elements": { "buttons": 0, "links": 0, "inputs": 0, "forms": 0, "search": false, "tables": 0, "modals": 0, "tabs": 0, "iframes": 0 },
  "skills": ["test-buttons-controls", "test-navigation"], "unnamedInteractive": [] } ],
  "skipped": [ { "path": "", "reason": "" } ] }
```
