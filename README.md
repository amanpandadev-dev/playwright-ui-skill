# Playwright E2E UI test skills

Agent skills that take user stories from requirements to reviewed Playwright tests, with shared contracts and
scripts that keep every step checkable. Contracts version: see `.agents/contracts/e2e-ui-test/CONTRACTS_VERSION`.

## Skills

| Skill | What it does |
| --- | --- |
| `e2e-ui-test-env-setup` | Sets up or records the Playwright environment: config, personas, auth, test data, `setup-decisions.json` |
| `e2e-ui-test-plan-generator` | Plans coverage: requirements inventory, obligations, `TC-Jxx` journeys, ledger and gap register |
| `e2e-ui-test-generator` | Writes `.spec.ts` tests from an approved plan and records assertion evidence |
| `e2e-ui-test-verify-run` | Turns a developer's Playwright run into recorded evidence: classify, repair locators, triage, dashboard |
| `e2e-ui-test-coverage-evaluator` | Deterministic gates plus a blinded judge; scored PASS, REVIEW or FAIL report |
| `e2e-ui-test-orchestrator` | Runs the whole pipeline in order and routes findings to the owning skill |

Each skill lives in `.agents/skills/<name>/SKILL.md`. Shared contracts, schemas and scripts are in
`.agents/contracts/e2e-ui-test/`; start with its `README.md` and `GUIDE.md`.

## Rules the skills keep

- Skills never run Playwright, browsers or the application; a developer runs the specs.
- Application code is never changed; an application bug is reported to its developer.
- Plans are approved at Gate A by a person only.
- Local or dev lanes only, never production.

## Running the contract tests

The scripts need Node.js and a TypeScript install, used only as a parser:

```bash
E2E_TYPESCRIPT=/path/to/node_modules/typescript/lib/typescript.js node --test .agents/contracts/e2e-ui-test/scripts/*.test.mjs
```

Without `E2E_TYPESCRIPT`, the tests that need the parser are skipped.
