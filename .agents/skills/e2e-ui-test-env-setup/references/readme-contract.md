# Generated README Contract

Setup mode maintains two README files. Merge required sections into established E2E README files
without deleting repository-specific guidance.

## Executable-root README

`<executable-test-root>/README.md` contains these sections in order:

1. **What this is** — project/operation modes, evidence, executable and documentation roots,
   application identity, and application target.
2. **Configuration reference** — every explicitly configured Playwright setting with its exact value,
   rationale, and expected effect. Include `testDir`, lane matching, `fullyParallel`, `workers`,
   `retries`, `forbidOnly`, global/expect/action/navigation timeouts, `testIdAttribute`, `outputDir`,
   reporters, `baseURL`, trace, screenshot, video, and the absence of `webServer`.
3. **Browser projects** — project name, device, branded channel, lane, and exact project command. Edge
   guidance tells VS Code users to select the `Microsoft Edge` profile; project order does not select
   it.
4. **Environment contract** — the complete table from
   [env-contract.md](env-contract.md), target-specific requirements, and value sources.
5. **What happens when you run it** — discovery-safe config behavior, worker runtime gate, and the
   precise errors or skips for unsupported targets, inert placeholders, remote HTTP, missing personas,
   and absent/expired auth state.
6. **Manual prerequisites** — application startup, browser installation, interactive auth, and
   seed/cleanup commands, all labelled as developer-run instructions.
7. **Commands** — every generated package script and static validator, with purpose and timing.
   `e2e:validate` runs `.agents/contracts/e2e-ui-test/scripts/validate-all.mjs`, which runs setup conformance,
   test inventory, catalog, config module format and coverage completeness together.
8. **Artifact inventory by necessity** — the load-bearing, governance and inert artifacts reported by
   `check-setup.mjs verify`, with the prerequisite that would make each inert artifact load-bearing.
9. **Portability** — which assets are reusable on another target and which are specific to this lane.
10. **What was not done** — no test, browser, application, agent, endpoint, auth/token flow, workflow,
    or results report was run.

State values as configured, never as execution-verified. For Azure, describe ordinary Playwright use
on developer machines or GitHub Actions only; do not mention managed browser services.

## Documentation-root README

`<docs-e2e-root>/README.md` indexes plans by story/feature, the coverage ledger, gap register,
authority sources, and the traceability convention. It contains no executable source.

## Static validation

- Both README files exist in setup mode and contain every required heading.
- Config-to-README comparison succeeds in both directions.
- Project rows match config projects and package scripts.
- Environment rows and `.env.e2e.example` variables match in both directions.
- Documented paths and commands resolve to generated or established artifacts.
- External managed-browser and alternate workflow-platform configuration is absent.
