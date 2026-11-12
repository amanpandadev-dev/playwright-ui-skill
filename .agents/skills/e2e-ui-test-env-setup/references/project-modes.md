# Greenfield and Brownfield Modes

Classify the package that owns E2E orchestration before installing or generating anything. The purpose
is to bootstrap new projects cleanly while avoiding accidental migration or duplication in established
repositories.

## Classification

| Evidence in owning package/repository | Mode | Reason |
| --- | --- | --- |
| No Playwright dependency, config, suites, fixtures, or agent definitions | Greenfield | There is no existing E2E contract to preserve. |
| Any Playwright dependency, config, suite, fixture, MCP entry, or agent definition | Brownfield | Even a partial setup can encode user-owned conventions. |
| Multiple packages with different states | Per-package | Classify the package that owns the requested journeys. |
| Conflicting or ambiguous artifacts | Brownfield | Compatibility-first handling is safer than scaffolding a parallel runner. |

An explicit developer choice overrides inference. Record the mode and evidence in the manual handoff.
Execution target and agent platform are never inferred from project mode; confirm both separately.

## Node module-format detection

Determine the format of each Playwright config before generating or repairing it. Apply these rules in
order; an explicit config extension overrides the owning package declaration:

| Config extension | Module format |
| --- | --- |
| `.mts` or `.mjs` | ESM |
| `.cts` or `.cjs` | CommonJS |
| `.ts` or `.js` with nearest `package.json` containing `"type": "module"` | ESM |
| `.ts` or `.js` with `"type": "commonjs"`, no `type`, or no owning `package.json` | CommonJS |

For CommonJS, use `const configDir = __dirname;` and do not emit the ESM-only `node:url` import. For
ESM, use `fileURLToPath(import.meta.url)` to derive the config directory. Do not add or change
`package.json#type` solely for Playwright. This rule is based on Node package ownership and therefore
applies equally to Next.js, React/Vite, Angular, Vue, Svelte, and other Node-hosted web stacks.

Project mode and operation mode are separate decisions. An established brownfield project may need an
explicit setup/configuration integration, or it may need incremental test generation only. When the
request concerns additional feature coverage and setup already exists, use incremental generation and
freeze setup files as defined in [../../e2e-ui-test-plan-generator/references/scope-modes.md](../../e2e-ui-test-plan-generator/references/scope-modes.md).
An explicit full-manifest request may use full-coverage sweep mode only after compatible setup,
catalog, ledger, and gap-register artifacts exist; it remains add-only and setup-frozen.

## Greenfield behavior

- Detect the application package and existing package manager before creating files.
- Use an existing package as the E2E owner when practical. Create a private root package only for
  genuinely cross-package journeys with no suitable owner.
- Create one Playwright configuration, the default `tests/e2e/<scope>` tree, E2E-specific documentation
  root, shared fixtures, manual scripts, output ignores, and missing agent definitions.
- Use bundled Chromium as the fallback only when no other browser is selected. An explicit Microsoft Edge choice
  produces a primary `msedge` project instead of an implicit Chrome/Chromium project; add other projects only for
  requested cross-browser coverage.
- When only a PRD or spec exists, create contract-first plans. Keep implementation-dependent tests
  skipped with precise reasons until routes, accessible names, API contracts, and auth exist.
- Do not invent an application framework, dev-server command, port, authentication mechanism, or API
  schema that is not evidenced by requirements or repository files.

## Brownfield behavior

Build an inventory before editing:

- package owner, package manager, lockfile, Playwright version, and module format;
- every Playwright configuration and its `testDir`, projects, reporters, output paths, timeouts, retries,
  dependencies, and global setup/teardown;
- E2E suites, fixtures, page objects, helpers, storage-state conventions, scripts, and documentation;
- Playwright agent definitions and MCP settings;
- ignored artifacts and any workflow files, which remain out of scope.

Then integrate minimally:

- Select the existing owning config. If multiple active configs exist, use explicit scripts and package
  ownership to identify the requested one; document ambiguity rather than creating another.
- Preserve existing projects during unrelated updates. In explicit browser setup, add or repair only the confirmed
  targets; never add Chromium or Chrome merely because Microsoft Edge was selected.
- Preserve the current Playwright version range. Do not upgrade a major version without an explicit
  migration request.
- Keep the established `testDir`, filename patterns, imports, fixtures, page-object style, tags, and
  reporter/output conventions when compatible with the request.
- Preserve a module-compatible config-directory bootstrap. If the existing bootstrap conflicts with
  the detected format, replace only that bootstrap and its now-unused import; do not migrate the
  package or replace the full config.
- Reuse existing auth and data helpers, but never commit credentials or storage state.
- Add only missing manual scripts. Do not rename or repoint existing scripts unless requested.
- Initialize agents only when definitions are missing and the installed version supports the command.
  Merge MCP settings and custom agent content instead of overwriting them.
- Do not relocate suites, rewrite all selectors, replace config wholesale, or adopt greenfield folder
  defaults as an implicit migration.

## Conflict handling

- Prefer preservation when an existing convention is valid but differs from the greenfield default.
- If a requested browser or agent needs a dependency change that is incompatible with the current
  setup, generate the compatible artifacts that are safe, document the blocker, and provide a manual
  migration option. Do not claim full installation.
- If requirements describe UI that the brownfield source does not implement, trace the mismatch and use
  an explicit skip instead of fabricating selectors.
- If existing files contain unrelated uncommitted changes, edit narrowly or stop when a safe merge is
  not possible.

## Idempotency check

After a successful greenfield setup, the next invocation must classify the project as brownfield. A
repeat run should update the same config, documentation root, suite root, fixtures, and agent files
without creating numbered duplicates or a second runner. If the repeat request is only for additional
features, do not update setup artifacts at all; generate only the confirmed uncovered feature scope.
