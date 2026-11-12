# Test Generation Standard (extract: shared artifacts and fixtures)


## Shared artifact creation

Create or extend the following only during an explicitly confirmed setup/configuration operation:

- A file named for seeding (for example `seed.spec.ts`) must create data; a smoke or navigation check that
  seeds nothing gets a name that says what it checks.
- Generate role-aware fixtures only for personas evidenced by requirements or code.
- Generate or extend one automatic environment-contract fixture that validates the target and endpoint variables at
  future test runtime. Keep Playwright config import discovery-safe so IDE/Test Explorer can enumerate suites without
  terminal-scoped variables.
- Follow the lane's `dataStrategy` and [../../../contracts/e2e-ui-test/test-data.md](../../../contracts/e2e-ui-test/test-data.md): route mocks only
  in `route-mocks` lanes, or for declared external dependencies in seeded lanes.
- Provide helpers for applicable loading, empty, error, privacy-suppressed, and unauthorized states.
- Provide staging-auth scaffolding that validates required environment variables and skips safely when absent.
- Keep manual execution commands in a README. Do not execute them while generating artifacts.

## Fixture construction standard

- Export `test` and `expect` from one `fixtures/test.ts` entry point using an explicit
  `test.extend<TestFixtures, WorkerFixtures>()` contract.
- Compose independently extended fixtures with `mergeTests`/`mergeExpects`; do not chain partial test
  exports across files.
- Make the environment-contract fixture `{ scope: 'worker', auto: true }`. Keep auth state worker-
  scoped and mutable per-test data test-scoped.
- Define project/lane-tunable values as fixture options with `[defaultValue, { option: true }]`.
- Provide page objects through fixtures instead of constructing them repeatedly inside tests.
- Release every acquired resource after `await use(...)`. A fixture without teardown needs a written
  plan justification.
- Namespace created records with a run ID and `testInfo.parallelIndex`; never let parallel workers
  contend for one shared record.
- Use a committed fixed seed for deterministic generators. Runtime timestamps or random seeds are not
  deterministic test data.
- Register route handlers during fixture setup and remove them during teardown.

Maintain `<docs-e2e-root>/gap-register.md` using the normalized rules in
[../../e2e-ui-test-plan-generator/references/coverage-completeness.md](../../e2e-ui-test-plan-generator/references/coverage-completeness.md). Regenerate affected entries whenever a plan gap
changes.

In incremental or explicit replacement mode, reuse shared artifacts unchanged. If a required fixture, seed, auth
scaffold, or helper is missing or incompatible, stop and request a separate setup/configuration operation rather than
creating or modifying it as part of feature coverage.

The planner, generator, and healer agent definitions are installation artifacts only. Never invoke those agents during this workflow because they can explore the application, launch browsers, or run tests.
