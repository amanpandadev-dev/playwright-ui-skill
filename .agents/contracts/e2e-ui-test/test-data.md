# Test-data contract

Shared by `e2e-ui-test-env-setup`, `e2e-ui-test-plan-generator`, `e2e-ui-test-generator` and `e2e-ui-test-coverage-evaluator`. It applies to any application and stack: nothing here assumes a domain,
framework, database or identity provider. The skills generate code and records only; seeding and cleanup
happen when a developer runs the tests.

## Why

Route mocks prove how the UI handles a response. They cannot prove persistence, server validation, state
transitions, authorization scope, sorting, audit or notifications. Synthetic data created through the
application's own interfaces can, while staying reproducible, isolated and free of real personal data.

## 1. Choose the strategy (`e2e-ui-test-env-setup`)

Run `node .agents/contracts/e2e-ui-test/scripts/check-setup.mjs discover --root <repo>` first. Besides authentication
evidence it lists **data seams**: create and action routes, delete routes, reset or seed routes, and seed or
fixture scripts, across common stacks. Then ask, per lane:

> How should test data be established:
> (a) synthetic data created through the application's own API or an evidenced seed interface;
> (b) an existing deterministic non-production dataset;
> (c) route-interception mocks only?
> Option (c) produces UI-contract evidence and cannot establish persistence, server validation, sorting,
> audit or notification behaviour.

Recommend (a) when discovery shows evidenced create interfaces and the lane has a real or `app-token`
identity to seed with; recommend (c) only for UI-contract scope. Never select without an explicit answer, and
never offer (a) without evidence. Record `lanes[].dataStrategy` and, for (a) and (b), `lanes[].data`:

| Field | Meaning |
| --- | --- |
| `seed` | One committed integer seed for every generator in the lane |
| `seedAs` | Default persona whose identity creates records; must be `real` or `app-token` |
| `createInterfaces` | `{entity, interface, evidence, seedAs?}`: an API route (`POST /path`) or a seed command, with the files that prove it |
| `cleanup.mode` | `api-delete` (evidenced delete interfaces), `reset-command` (evidenced reset route or command), `disposable-environment` (local lane only, confirmed by a named person), or `none` |
| `namespace` | Where the per-worker namespace is written on created records (a title prefix, an external reference) |
| `applicationApiPatterns` | URL globs of the application's own API; seeded specs must not fake these |
| `externalMocks` | Genuinely external dependencies that may still be faked, each with a reason |
| `dataModule` | Directory of the generated builders, under the test directory |
| `dataset` | For (b): the named dataset, whether it is read-only, and how it is reset |

`cleanup.mode: none` is allowed, but then every obligation that changes data stays `Blocked`. Setup never
invents a create, delete or reset interface and never changes application code to add one: a missing
interface is a blocker with application-developer remediation. Never target production.

Setup generates the shared plumbing from the templates in `templates/fixtures/`:
`synthetic-data.ts` (seeded generator, reserved-domain values, boundary helpers, teardown registry) and
`seeded-data.ts` (a fixture that creates records through the API as a persona and registers their cleanup).
Wire the fixture into the shared entry point with the existing `data-namespace.ts` namespace.

## 2. Derive data needs from requirements (`e2e-ui-test-plan-generator`)

In `api-seeded` and `existing-dataset` lanes, every browser obligation records `dataRequirements`, derived
from its criterion rather than from a fixed sample:

```json
"dataRequirements": {
  "entities": [{ "entity": "<entity>", "state": "<state the criterion needs>", "count": 1, "owner": "<persona>" }],
  "variants": ["<boundary, empty set, suppressed row, invalid input, error state>"],
  "mutates": true
}
```

Derive variants from the source: an inclusive length rule of 20 to 2000 yields 19, 20, 2000 and 2001; a
list criterion yields empty and populated sets; a privacy rule yields a suppressed row. `dataRequirements` is
plan-owned and part of the approval fingerprint. An obligation with `mutates: true` in a lane without a
cleanup contract is planned `Blocked` with a precise blocker, remediation and owner, never `Planned`.

## 3. Generate the data module (`e2e-ui-test-generator`)

- Write builders under `dataModule`, one per entity the plan needs, producing a coherent graph of related
  records and every planned variant, driven only by the lane seed and the worker namespace.
- Create records through the evidenced interfaces with the seeding persona's request context, through
  `SeededData.create`, so validation, state transitions, locking and audit are genuine. Use the identifiers
  the application returns; never hard-code record identifiers.
- Values are obviously synthetic: e-mail addresses on `example.test` (or another reserved domain), names and
  free text carrying the namespace, dates relative to the fixed synthetic epoch. Never copy production or
  personal data.
- Register every created record for cleanup; the fixture removes them after the test in reverse order.
- Keep static expected values in the module (for example `expected.ts`); they describe outcomes, not the data
  source.
- Fake only declared `externalMocks`. Record them in `mockingScope`; seeded, unmocked journeys can claim
  `BrowserIntegrated` evidence.
- A file named for seeding must seed. Rename a smoke or navigation check that seeds nothing.

## 4. Check it (`e2e-ui-test-coverage-evaluator` and `check-setup.mjs verify`)

`check-setup.mjs verify`, gate G-D12 at the tests stage, checks the recorded contract and the specs: a data
contract exists for every seeded lane (setups recorded without one stay schema-valid and are reported here
instead), evidenced create and cleanup interfaces, a non-simulated seeding identity, a namespace rule, a disposable
environment only on a local lane, no faked application-API routes and no hard-coded record identifiers in
seeded specs, and reserved e-mail domains in specs and the data module. Findings about specs or the data module
are routed to `e2e-ui-test-generator`; the rest to `e2e-ui-test-env-setup`. `validate-coverage.mjs` (gate G-D04) requires
`dataRequirements` in seeded lanes and rejects a planned mutation without cleanup, routed to
`e2e-ui-test-plan-generator`.

## What seeded data still does not prove

Identity-provider role assignment, and behaviour of external services that remain mocked. Keep those criteria
blocked or scoped to the evidence layer that establishes them.
