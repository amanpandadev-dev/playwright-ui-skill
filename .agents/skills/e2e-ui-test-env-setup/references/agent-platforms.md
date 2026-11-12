# Agent Platform Selection

Ask which coding-agent platform should own the Playwright planner, generator, and healer definitions on
every invocation. Do not infer the choice from repository files or from the assistant executing the
skill.

## Platform question

Ask or confirm:

> Which agent platform should this Playwright setup use: GitHub Copilot/VS Code, Claude Code, Codex,
> OpenCode, another supported client, or no agent definitions?

Combine this with the execution-target question when both are missing so the developer receives one
concise blocking request.

## First-party loop mapping

| Developer choice | `init-agents` loop |
| --- | --- |
| GitHub Copilot / VS Code | `vscode` |
| Claude Code | `claude` |
| Codex | `codex` |
| OpenCode | `opencode` |

Run only the confirmed loop in explicit setup mode, for example:

```text
npx playwright init-agents --loop=codex
```

The initializer writes static planner, generator, and healer definitions. Never invoke those agents.

## Other clients

- If the developer names another client, confirm that the installed Playwright version supports a
  matching `init-agents` loop using current first-party documentation or existing repository evidence.
- Do not invent a loop name or translate another client's definitions automatically.
- If no supported loop exists, preserve the rest of the setup, document the limitation, and ask whether
  the developer wants one of the supported platforms or no agent definitions.
- Generate standard MCP configuration for another client only when the developer explicitly requests
  it and provides or confirms the client-specific location/schema.

## Greenfield and brownfield setup

- Greenfield: initialize only the selected platform's definitions and related MCP configuration.
- Brownfield setup: inventory all existing agent/MCP files, preserve custom content, and add or repair
  only the selected platform.
- Multiple platforms: support them only when explicitly requested. Initialize one confirmed loop at a
  time and inspect file overlap so one platform does not overwrite another.
- No agents: do not run `init-agents`; record the opt-out in the manual handoff. "No agents" is a fully
  supported answer, and the correct one when the team's assistant is not a listed platform. Existing
  Playwright agent definitions for an unchosen platform are listed as inert in the artifact inventory;
  never delete them.

## Incremental generation

Confirm the platform but do not initialize, regenerate, or modify its definitions. If the requested
platform differs from the configured one, stop and request a separate setup operation. The current
feature-generation request remains add-only and setup-frozen.

## Static agent contract alignment

During authorized setup/update only, merge these instructions into skill-owned planner/generator/healer
definitions while preserving custom content: inventory and decompose every scoped AC before selecting
journeys; retain obligation IDs and concrete actions/assertions; distinguish mock and integrated evidence;
reject unrelated mappings; separate authored coverage from execution; preserve precise gaps and source
conflicts; apply [../../e2e-ui-test-coverage-evaluator/references/semantic-review.md](../../e2e-ui-test-coverage-evaluator/references/semantic-review.md) to actual bodies and helpers. A healer must not
weaken requirement expectations to match an implementation defect or replace valid scenarios by scope
inference. These are authoring contracts, not permission to invoke agents or their browser tools.

Inline or human semantic review satisfies the generation workflow. Do not require installed agents,
invoke a planner/generator/healer, launch a browser, or edit application-owned agent definitions during
an ordinary coverage operation or a skill-package-only hardening task.

## Documentation

- [Playwright Test Agents](https://playwright.dev/docs/test-agents)
