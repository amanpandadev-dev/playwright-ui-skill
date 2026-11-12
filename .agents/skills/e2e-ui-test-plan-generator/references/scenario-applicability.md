# Test Generation Standard (extract: scenario applicability and conflicts)

## Scenario expansion and evidence boundaries

Assess and record applicability for each story or rule, including reasons for excluded classes:

1. Successful primary and alternate business actions.
2. Required, missing, empty, whitespace-only and invalid inputs.
3. Below-minimum, exact-minimum, exact-maximum and above-maximum boundaries.
4. Authorized, wrong-role, wrong-object-scope and signed-out access.
5. Valid, invalid, already-completed and stale state transitions.
6. Duplicate submission, concurrent action and idempotent retry.
7. API errors, network failure and recovery.
8. Empty, loading, populated and error presentation.
9. Navigation, filters, ordering and direct links.
10. Keyboard access, focus, dialogs and accessible validation where required.
11. Audit, persistence, notification and rollback at the appropriate evidence layer.

Avoid a Cartesian product of unrelated variants. Deduplicate only when preserved cases still establish
every applicable rule. Parameterized tests must retain a distinct stable identity for each concrete
case. Follow the static inventory's supported contract; unresolved dynamic factories require explicit
review/remediation rather than invented inventory identities. Trace shared helper assertions and their
actual invocation with case-specific inputs; importing a helper is not evidence of exercising it.

When source and implementation conflict, record both paths, the exact divergent outcome and precedence.
Author requirement-based expectations when precedence resolves them and flag the implementation mismatch;
otherwise block only the affected obligation pending a decision and continue unaffected coverage.
For example, a specification `Draft` versus implementation `Rejected`
after rejection must remain visible, not silently normalized into a passing expectation.
