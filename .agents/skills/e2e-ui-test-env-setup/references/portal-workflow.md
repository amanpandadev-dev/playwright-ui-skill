# Business Portal Integration Contract (extract: portal workflow)

## When to author the workflow

Ask whether a GitHub execution portal is wanted at all; it is not an implied part of setup. Portal
metadata in catalog entries is cheap. The workflow, the selection script and the protected-environment
contract are not, and they are inert when nothing can be dispatched.

Author the workflow and selection script only when the developer wants the portal **and** at least one
catalog entry can reach `executionReadiness=Ready` under the confirmed authentication: a lane with
`authMode` `none` or `app-dev-auth`, or a lane whose unattended authentication is confirmed
(`unattendedAuth: true`). An interactively captured local Entra session cannot exist on an unattended
runner, so every entry of such a lane is `ManualAuthRequired`.

Otherwise do not author them. Set `portal.enabled: false` with a `reason` naming the precise condition
that would make dispatch possible, and record it as a readiness gap. When the portal is enabled, record
`portal.readyBasis`. `check-setup.mjs verify` fails an enabled portal whose catalog has no `Ready` entry.
A pre-existing workflow is never deleted: the artifact inventory marks it inert until the condition is met.

## Portal workflow authoring

The standardized workflow is a GitHub Actions setup/onboarding artifact. When the conditions above hold, during setup mode, create or
minimally update the single workflow at the established path or
`.github/workflows/execute-tests.yml`. Preserve a compatible repository-owned workflow instead of
creating a duplicate. In incremental, replacement, and sweep modes, leave it unchanged. Do not create
other workflow-platform variants.

The workflow must be valid YAML and capable of executing the generated Playwright tests later; do not
create a placeholder. It must:

- use `workflow_dispatch` as its execution trigger, with no `push`, `pull_request`, or `schedule`;
- accept controlled inputs for catalog test IDs or test pack, approved environment, and configured
  browser project, using repository/platform input names when already standardized;
- validate the supported schema version, catalog publication version and source commit, requested IDs,
  and pack membership against `test-catalog.json`; fail closed for unknown or empty selections, and map
  only catalog-owned `applicationId + testId` identity to exact embedded Playwright `testId` metadata;
- dispatch only entries where `portalEligible=true`, `status=Active`, and
  `executionReadiness=Ready`, after environment, browser, feature/release, persona, and required-access
  checks also succeed;
- require a concrete feature or release selector for the `Feature` pack and never expand `Feature` to
  every catalog entry;
- use the detected package manager, lockfile, supported Node version, owning package, Playwright config,
  and browser project rather than introducing a second runner;
- install dependencies and the selected browser as later workflow runtime steps, then invoke the
  repository's established Playwright command for the selected tests;
- bind endpoint and authentication values from the selected protected GitHub Environment, repository
  variables, and secrets without echoing or persisting secret values;
- avoid `eval`, shell construction from raw portal input, production defaults, application deployment,
  mutation of test data outside the approved cleanup contract, and portal callbacks not defined by an
  authoritative platform contract; and
- publish only the repository's standard Playwright report/results artifacts with `if: always()` and a
  bounded retention period, without claiming success before the test command completes.

If exact workflow inputs, environment-to-secret mappings, package command, or report contract cannot be
resolved from authoritative repository/platform documentation, stop workflow authoring and request
those details. Do not guess an executable integration contract. This does not block catalog generation.
Never dispatch, syntax-load through an Actions runner, or otherwise execute the workflow while using
this skill.
