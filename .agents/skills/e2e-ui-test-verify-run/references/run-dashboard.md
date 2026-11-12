# Run dashboard and triage

Every classified attempt gets one readable page, `runs/<run-id>/dashboard-<n>.html`, so a person can see what went
wrong, whose fault it was and how to fix it without opening traces. The results come from `run-<n>.json`. The
explanations come from `runs/<run-id>/triage-<n>.json`, which this skill writes and
`schemas/run-triage.schema.json` validates.

## Whose fault is it?

Give each failed or flaky test exactly one fault.

| Fault | Meaning | Decide it when | Fix |
| --- | --- | --- | --- |
| `DeveloperBug` | The application breaks a requirement | The SPEC or PRD states the behaviour, the test asserts that behaviour, and the page or API shows otherwise | Application developer. The test stays as written |
| `AgentTestBug` | The generated test is wrong and the application is right | The snapshot shows the correct behaviour under another locator, a wait was wrong, or the test asserts something the requirement does not say | This skill for locators and waits, otherwise `e2e-ui-test-generator` |
| `Environment` | The lane was not usable | Servers down, sign-in rejected, browser missing, variables unset | Whoever owns the lane, or `e2e-ui-test-env-setup` |
| `TestData` | The data was not in the expected state | A precondition failed on shared or leftover data before the behaviour under test ran | The developer resets the data, or `e2e-ui-test-generator` makes the test seed its own data |
| `RequirementGap` | The requirement does not settle it | Application and test both have a fair reading | A person decides, then `e2e-ui-test-plan-generator` |
| `Undetermined` | The evidence is not enough | Anything else | A person opens the trace |

Rules:

- Check the test before blaming the application. Compare the assertion with the requirement text, then with what the
  failure snapshot shows. A test asserting wording that exists only in the plan is not, on that alone, a developer bug.
- Failure classes are not faults. `Mechanical` starts as `AgentTestBug`, and `Environment` starts as `Environment`.
  `Behavioural` and `Unclassified` start as `Undetermined`: a mismatch shows that test and application disagree, not
  which is wrong.
- Blaming `DeveloperBug` or `AgentTestBug` also needs `whyThisFault` (schema version 1.1): what the requirement says
  (with its source), what the test asserts, what the application shows, and why the other side is not at fault. The
  dashboard prints these four lines under "Why this is a developer bug" or "Why this is a test-code bug", so a reader
  can check the call without opening the trace. A schema 1.0 file stays valid without it.
- Overruling a `Mechanical` classification needs `classifierDisagreement`, stating what the snapshot shows.
- Blaming `DeveloperBug` or `AgentTestBug` needs at least one evidence entry: a `file:line` or artifact and what it shows.
- `confidence` is `Confirmed` when the evidence shows the fault directly, `Likely` when part of the explanation is
  inferred, and `Unknown` otherwise. Say in `whyItHappened` which part is inferred.
- Explain in plain language. Evidence holds short pointers, never pasted page content, tokens or personal data.
- Use `notes` for anything about the run that a reader should know and that is not one test's failure, such as a
  check that was worked around.
- Every Playwright result reaches the page. Results not matched to a testId and errors outside any test have their own
  sections, and the page warns when its counts differ from Playwright's totals (`--strict` refuses then). When the run
  has any of them, the triage must say in `notes` what happened to them and who fixes it; a triage without such a note
  is refused. Runs classified before contracts 3.7.0 keep the old rule and show unmatched outcomes as unknown.

## Writing it

```json
{
  "schemaVersion": "1.1",
  "runId": "20261030-1914",
  "attempt": 1,
  "triagedBy": "e2e-ui-test-verify-run",
  "items": [
    {
      "testId": "TAP-J000",
      "fault": "DeveloperBug",
      "confidence": "Likely",
      "whatHappened": "What the reader would have seen on screen.",
      "whyItHappened": "The cause, and which part of it is inferred.",
      "whyThisFault": {
        "requirementSays": "What the SPEC or PRD requires, with its line.",
        "testAsserts": "What the test checks, with its line.",
        "applicationShows": "What the page or API did, from the snapshot or trace.",
        "whyNotTheOther": "Why the test is right (developer bug) or the application is right (test-code bug)."
      },
      "evidence": [{ "source": "docs/specs/SPEC.md:232", "detail": "What this line establishes." }],
      "fix": "What to change.",
      "fixOwner": "Application developer"
    }
  ],
  "notes": []
}
```

Then render it. Use `--strict` at hand-off, because it refuses a failure with no explanation:

```text
node .agents/contracts/e2e-ui-test/scripts/render-run-dashboard.mjs --root <repo> --docs-root <docs-e2e-root> --run-id <run-id> --attempt <n> --strict
```
