---
name: test-forms
description: Test forms for required and format validation, error messaging, single submit, data retention, input widgets, uploads and keyboard flow.
---

## When to use
For each form in the coverage map.

## Inputs
Valid/invalid sample values from `target.yaml` (never real personal data); `allowDestructive`.

## Preconditions
Preflight passed. Valid submissions that create records require `allowDestructive: true`; otherwise only test validation paths and mark success-path checks BLOCKED (B-INPUT, note destructive disallowed).

## Steps
Fill fields individually, submit empty, submit invalid, submit valid; observe errors, network, and resulting state.

## Checks
- FORM-01 Required fields flagged when empty.
- FORM-02 Format validation: email, phone, number, date.
- FORM-03 Min/max length enforced.
- FORM-04 Errors are specific, adjacent to the field, and announced (aria-live / aria-describedby / role=alert).
- FORM-05 Valid submit succeeds exactly once; double-submit is guarded.
- FORM-06 Entered data kept after a validation error; cleared after success as expected.
- FORM-07 Dropdowns, radios, checkboxes, date pickers work by mouse and keyboard.
- FORM-08 File upload: valid type, invalid type, oversize each handled with clear message.
- FORM-09 Paste works like typing; browser autofill not broken.
- FORM-10 Tab order logical; labels associated to inputs.
- FORM-11 Unsaved-changes warning (if app has one) fires (B-DIALOG).
- FORM-12 Submit button shows loading state and no console errors.

## Evidence to capture
Screenshot of each error state, request/response status on submit.

## Blockers
B-DIALOG, B-OVERLAY, B-FRAME (payment frames: only "loads"), B-BOT.

## Output
`test-forms.json`.
