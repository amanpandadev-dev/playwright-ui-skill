# <Story ID>: <Feature>

<!-- Authoring template: replace placeholders; use coverage-manifest.md for exact machine projections.
     This template does not authorize application setup changes or execution. -->

## Metadata and authority

| Field | Value |
| --- | --- |
| Project / operation mode | <confirmed modes> |
| Application ID / display name | <authoritative values> |
| Confirmed scope / primary authority | <story IDs and source paths/headings> |
| Target / environment / browser projects | <confirmed existing contracts> |
| Agent platform / auth mode | <confirmed values> |
| Frontend / backend variable names | <non-secret variable names> |
| Stack / framework / test root | <repository evidence> |
| Generated date | <date> |
| Execution status | NotRun |

## Independent source inventory and obligations

Link `requirements-inventory.json` and its verbatim ACs/source fingerprints; link the matching
`coverage-manifest.json`. Include every scoped rule and decompose every clause before selecting tests.

| Requirement ID | Obligation IDs | Persona / scope | Expected behavior | Evidence layer |
| --- | --- | --- | --- | --- |
| <source-owned ID> | <stable derived IDs> | <evidenced persona> | <concrete outcome> | <declared layer> |

## Scenario applicability

| Scenario class | Applicable rule / variants | Test IDs or precise exclusion reason |
| --- | --- | --- |
| Primary and alternate success | <actions> | <IDs> |
| Validation and boundaries | <missing/empty/whitespace/invalid/min/max cases> | <IDs> |
| Authorization | <signed-out/wrong-role/wrong-object/authorized> | <IDs> |
| State, concurrency and retries | <invalid/stale/completed/duplicate/idempotence> | <IDs> |
| Failure and recovery | <API/network> | <IDs> |
| Presentation and navigation | <loading/empty/populated/error/filter/order/direct link> | <IDs> |
| Accessibility | <required keyboard/focus/dialog/validation> | <IDs> |
| Internal side effects | <persistence/audit/notification/rollback> | <evidence or gap> |

Do not use a fixed number of journeys or generate unrelated Cartesian combinations.

## Journey index

| Test ID | Journey ID | Obligation IDs | Persona / runtime auth / access profile | Role sensitive | Portal eligibility / readiness / lifecycle | Risk / priority / environments / tags |
| --- | --- | --- | --- | --- | --- | --- |
| <stable testId> | TC-J01 | <IDs> | <authoritative distinct values> | <boolean> | <authoritative values> | <justified values> |

## TC-J01 — <concrete business action and expected outcome>

- **Test and obligation IDs:** <exact IDs and source path/heading>
- **Persona and permissions:** <business persona, object scope, runtime auth and required access profile>
- **Starting state and deterministic data:** <record state/version, inputs, isolation prerequisites>
- **Trigger and UI actions:** <actual controls and ordered interactions>
- **Expected requests/responses:** <method/path, material payload fields, expected response; or N/A reason>
- **Visible assertions:** <exact visible result and state; failure must preserve required state>
- **Mutation prevention:** <when required, observation window/completion signal and no-request assertion>
- **Side-effect evidence:** <planned appropriate-layer evidence for persistence/audit/notifications or precise gaps>
- **Evidence layer / planned mocking scope:** <layer and every call planned for interception, including replaced behavior>
- **Cleanup/reset:** <approved deterministic contract or readiness blocker>
- **Environment suitability:** <confirmed local/staging applicability>
- **Limitations / blocker / remediation / owner:** <plan-time blocker, if any, with evidenced accountable owner>

<!-- coverage-view:start -->
Written by `e2e-ui-test-generator` after Gate A; excluded from the approval fingerprint. No headings here.

- **Coverage / execution status:** Planned; NotRun
- **Assertion references:** <testId, root-relative path, @e2e-evidence anchor for each supported obligation>
- **Semantic review:** <trigger, input, action, assertions, limitations and review status>
<!-- coverage-view:end -->

Repeat this section for every distinct journey required by obligations. Generic directions such as
"exercise the journey" do not define a test contract.

## Traceability, gaps and conflicts

Render reviewed manifest requirement/obligation/test mappings and exact gap entries inside a
`<!-- coverage-view:start -->` ... `<!-- coverage-view:end -->` region, because they change when tests are
authored. Identify covered and missing children of partial ACs separately. Record source/implementation conflicts with both paths,
expected values, precedence or decision needed; continue unaffected scenarios.

Insert the exact `<!-- coverage-data JSON -->` projection prescribed by
`references/coverage-manifest.md`; derive it from the manifest, not independently edited claims.
Human-readable tables must agree with that projection and require semantic review too.

## Continuation and handoff

For batched work, list completed, incomplete and blocked obligations. Report validated scope, obligation,
reviewed browser/internal coverage, blocked, unsupported and unaccounted counts. Distinguish accounting
completion from full authored browser/cross-layer coverage and runtime readiness.

Document only the established developer-run commands as unexecuted follow-ups. No tests, discovery,
compilation, apps, browsers, agents, endpoints, authentication, token flows or workflows were run, and
generation creates no execution results report.
