---
name: e2e-ui-test-orchestrator
description: >
  Run the whole Playwright E2E pipeline end to end by driving the four E2E skills in order: set up the
  environment, plan coverage from requirements, stop for the human plan approval (Gate A), author tests
  from the approved plan, optionally verify them against a developer's run (e2e-ui-test-verify-run), evaluate
  them, and route each evaluation finding back to the skill that owns it
  until the verdict is PASS or a person must decide. Decides every next step from the repository's
  hand-off files and entry gates with pipeline-status.mjs, never from memory. Use when the user asks to
  run, continue, resume or finish the E2E pipeline, take stories from requirements to reviewed Playwright
  tests, or asks what the next E2E step is. Not for a single step: setup or reconfiguration
  (e2e-ui-test-env-setup), only a plan (e2e-ui-test-plan-generator), only specs (e2e-ui-test-generator), or only an
  evaluation (e2e-ui-test-coverage-evaluator). Never approves plans, fixes findings itself, or runs tests,
  browsers or applications.
---

# E2E UI Test Orchestrator

Drive `e2e-ui-test-env-setup`, `e2e-ui-test-plan-generator`, `e2e-ui-test-generator`, the optional `e2e-ui-test-verify-run`
and `e2e-ui-test-coverage-evaluator` end to end. This
skill owns no artifacts: every file is written by the skill that owns it. The orchestrator decides what runs next,
invokes that skill, and stops wherever a person must act.

## Invariants (shared, verbatim)

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

Never:

- run Playwright discovery or execution, including `test`, `test --list`, `show-report`, `codegen`, UI,
  or headed modes;
- run repository tests, TypeScript compilation, application builds, generated agents, browsers,
  applications, containers, emulators, endpoints, authentication, token flows, or workflows;
- probe DNS, TLS, health endpoints, redirects, APIs, or credentials;
- create results reports or claim generated tests passed;
- create push, pull-request, or scheduled automation, alternate workflow-platform files, external
  managed-browser configuration, deployments, provisioning, or unrelated CI/CD/PR artifacts.

If generation and execution are requested together, perform only generation and identify execution as
a developer-owned follow-up.

Requires contracts: ^3.0.0

Invoking the sibling E2E skills is this skill's purpose; "agents" in the invariants means Playwright or other
generated test agents, which remain out of bounds.

## Who runs what

Run every contract script yourself: `pipeline-status.mjs`, the entry gates, `validate-all.mjs` and whatever the
invoked skill runs. They are static file checks, so running them is not execution. Never ask the developer to run
one and report the output back.

A developer runs a command in exactly three places: printing the plan fingerprints to approve the plan at Gate A,
running the new specs against a local or dev lane when the verify stage asks (`run-specs`), and running the
Playwright suite once the pipeline is `done`. All three are deliberately theirs.

## Workflow

### 1. Establish the run

Confirm, or ask once for:

- the **docs root** (default `docs/tests_e2e`, or the one `setup-decisions.json` records);
- the **scope**: exact story IDs or feature, and the requirements authority (spec or PRD paths). Broad phrases
  such as "everything new" do not establish scope; ask for identifiers;
- the **round limit** for fix-and-re-evaluate cycles (default 3);
- whether to **verify** the new tests against a developer's run before evaluation (default no). When yes, pass
  `--verify` to every `pipeline-status` call. Once `<docs-e2e-root>/runs/` exists, the verify stage applies anyway.

Check the code graph once, before the loop, so that every later step (and every sub-agent) can use it or skip it:

```text
node .agents/contracts/e2e-ui-test/scripts/code-nav.mjs status --root <repo> --docs-root <docs-e2e-root>
```

When `ask` is `true`, ask the person with AskUserQuestion: update the graph with the graphify skill (recommended), or
skip it (`code-nav.mjs decide --choice skip`). A `fresh` graph needs no question. Details are in
[code-navigation.md](../../contracts/e2e-ui-test/code-navigation.md). Never build the graph without that answer.

Locate the repository's TypeScript parser (`node_modules/typescript/lib/typescript.js`) and the test catalog path
once, before the loop: the validation and evaluation steps need them, and finding them mid-loop interrupts a run.

### 2. Decide the next step

Run:

```text
node .agents/contracts/e2e-ui-test/scripts/pipeline-status.mjs --root <repo> --docs-root <docs-e2e-root> [--catalog <catalog>] [--verify] --json
```

It runs the entry gates and reads the hand-off files and the latest evaluation report, then returns `step`,
`skill`, `humanCheckpoint`, `reason`, hints (`operation`, `scopeHint`, `next`, `runCommand`) and `findingsByRoute`. Act on it
exactly; never override it from conversation memory.

| `step` | Action |
| --- | --- |
| `setup` | Invoke `e2e-ui-test-env-setup` with the `operation` hint. It asks the developer its setup questions; relay them and wait for answers. |
| `plan` | Invoke `e2e-ui-test-plan-generator` with the run's scope and authority and the `scopeHint` (for example `adopt-existing` or `replacement`). |
| `gate-a` | **Stop.** Present the plans, ledger and gap register, and optionally run the plan-stage evaluation. A person approves by printing the fingerprints and setting the manifest `review` block. Never approve or edit the `review` block yourself. |
| `author` | Invoke `e2e-ui-test-generator` for the approved plan. |
| `run-specs` | **Stop.** Give the developer `runCommand` (with the lane's variables from the README) and wait until they say the run finished. Never run it yourself. |
| `verify` | Invoke `e2e-ui-test-verify-run`. It classifies the latest attempt, repairs mechanical failures within its limits, records the results, or explains the attempt (triage and dashboard), as `reason` says. |
| `evaluate` | Invoke `e2e-ui-test-coverage-evaluator` at the tests stage, including the blinded judge samples its protocol requires. Samples are dispatched batched by sample number (one agent per sample number, not per bundle sample) and the report is run with `--dispatch batched`. |
| `route-findings` | Invoke the skill in `skill` with its findings from `findingsByRoute`; upstream owners come first (setup, then plan, then test, then verify). Never fix a finding yourself. |
| `human-review` | **Stop.** Present the findings that need a person, such as judge disagreements. |
| `done` | **Stop.** Report completion; developers run the suite. |

### 3. Loop

After each invoked skill finishes:

1. Run `node .agents/contracts/e2e-ui-test/scripts/validate-all.mjs --docs-root <docs-e2e-root>` and include its result in
   the step report. A failure is information for the next decision, not something to fix outside the owning skill.
2. Report the step: the skill run, files it wrote (its scope record), gate and validation results, and the next
   step.
3. Return to step 2.

Stop the loop when `humanCheckpoint` is true, when `step` is `done`, when the same `step` and `reason` repeat twice
in a row without any file changing (the owning skill could not make progress: report its blocker), or when the
number of tests-stage evaluations in this run exceeds the round limit (`state.testsEvaluations` minus its value
at the start of the run).

Each skill runs its own snapshot-to-record cycle: the finishing skill records its scope (`check-file-scope.mjs check
--record`) before the next skill takes its snapshot, so two skills' changes never overlap. A change that belongs to
another skill, such as a `setup-decisions.json` edit found during planning, goes back to that skill as its own step.

**Run each stage in a fresh context.** Every call re-sends the whole conversation, and a stage never needs the
previous stage's working context: `pipeline-status` reconstructs the state from the files. So:

- Delegate each non-interactive step (authoring, verify, evaluation) to a fresh sub-agent with its own context when the host
  supports it, one at a time. Give it only the skill, the docs root, the scope and the paths it needs, never this
  conversation. The evaluation step must always start fresh: the judge must not inherit the generator's context.
- Never delegate a step with a human checkpoint or one that asks the developer questions (setup, planning). When the
  context is already large, end the step report by telling the developer to continue the pipeline in a new chat.
- After a delegated step, re-run `pipeline-status` here rather than trusting the sub-agent's account of what it did.

A long pipeline can outlast one session or one context window. Nothing is lost: `pipeline-status` reconstructs the
state from the files, so a later session resumes from the same point. Only the round budget lives in the
conversation, so state it and the verify choice in every step report and re-establish them when resuming.

### 4. Hand off

Summarize the run: the steps taken with each skill's result, the current `pipeline-status` step and reason, open
findings by owner, the evaluation verdict and report path, the latest `runs/<run-id>/dashboard-<n>.html` when a verify run exists, and what a person must do next (answer setup
questions, approve the plan, run the specs for a verify attempt, decide flagged findings, or run the suite).
Confirm that no skill ran a test, browser, application, authentication flow or workflow; any execution results came
from runs the developer performed.

## Idempotency and safety

- Reuse existing roots, config, catalog, schema, ledger, gap register, README files, and workflow.
- Preserve stable journey/test identities and unrelated user content.
- Never target production or commit secrets, tokens, auth state, production data, or private results.
- Keep state-changing journeys isolated and blocked until approved deterministic setup and cleanup
  exist.
