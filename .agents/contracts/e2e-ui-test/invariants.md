# Shared invariants

Copied byte-identically into every E2E skill under "## Invariants (shared, verbatim)".

1. **Non-execution.** Never run Playwright discovery or execution (`test`, `--list`, `show-report`,
   `codegen`, UI, headed), repository tests, TypeScript compilation, builds, browsers, applications,
   containers, endpoints, authentication, token flows, agents or workflows. Never probe DNS, TLS, health,
   redirects, APIs or credentials. Never create results reports or claim tests passed.
2. **Secrets.** Never request or commit secret values, tokens, cookies, storage state, auth headers,
   production data or private results. Never implement ROPC/password grants.
3. **Honest status.** Status vocabulary is exactly `Planned`, `Covered`, `PartiallyCovered`, `Blocked`,
   `NotBrowserObservable`, `OutOfScope`. `Planned` means a planned journey is not yet authored and never
   survives test authoring; execution is `NotRun` unless execution evidence is supplied. Never soften
   these to satisfy a gate.
4. **Stable identity.** Preserve `applicationId + testId`, `TC-Jxx` and obligation IDs when meaning is
   unchanged.
5. **Preserve user work.** Preserve unrelated and uncommitted changes; never delete a pre-existing file.
6. **No production.** Never target production.
7. **Application code is out of bounds.** A change required in application code is a blocker with
   application-developer remediation, never an edit.
