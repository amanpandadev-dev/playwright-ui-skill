# Test Generation Standard (extract: plan requirements)

## Markdown plan requirements

Every journey must give concrete trigger, inputs, actions and observable assertions, obligation IDs,
evidence layer, mocked calls, relevant side-effect evidence, cleanup and limitations. Phrases such as
"exercise the journey" or "primary behavior is visible" cannot substitute for a behavioral contract.
Include the manifest-derived machine projection and keep all human-readable tables consistent with it.
Review rendered prose separately; the static projection comparison does not interpret Markdown prose.

Each story or feature plan must include:

1. Metadata: project mode, operation mode, classification evidence, developer-confirmed application ID
   and display name, confirmed feature/story scope, execution target/environment, agent platform,
   frontend/backend variable names, auth mode, primary source, generation mode, application stack,
   framework, browser targets, executable test root, generation date, and `Execution status: Not run`.
2. Scope summary and source inventory.
3. An E2E journey table containing stable test ID, journey ID, source criterion, business persona,
   runtime auth profile, explicit role-sensitive flag, developer-supplied access profile when
   role-sensitive, portal eligibility, execution readiness, lifecycle status, risk, priority,
   environment applicability, expected outcome, and justified technical tags/test packs.
4. For every `TC-Jxx` journey:
   - source requirement or code evidence;
   - stable test ID plus business persona, permissions, approved runtime auth profile, and the
     developer-supplied required access profile when role-sensitive;
   - preconditions;
   - realistic deterministic seed data;
   - UI steps and expected visible outcomes;
   - expected API requests/responses where observable;
   - cleanup or reset behavior;
   - local/staging suitability;
   - limitations or explicit skip reason.
5. A requirement-to-journey traceability matrix.
6. A gap section listing every backend-only, credential-dependent, access-profile-blocked,
   unavailable-data, or unimplemented criterion with classification, blocker, remediation action,
   owner, and the journey that becomes live when cleared or `N/A` when no browser journey is valid.
   Every entry must match the repository ledger and consolidated gap register.
7. Manual execution instructions and an explicit statement that no results report exists because nothing was run.
