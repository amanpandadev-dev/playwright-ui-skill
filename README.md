# playwright-ui-skill

Pre-release UI testing with **Agent Skills** (driven through Playwright MCP) plus **generated Playwright specs** for repeatable cross-browser regression. Full brief: [ui-release-test-plan.md](ui-release-test-plan.md).

## Quick start
```bash
npm install
npx playwright install --with-deps
cp .env.test.example .env.test          # fill in credentials (gitignored)
# edit test-config/target.yaml           # replace every TODO

claude mcp add playwright -- npx @playwright/mcp@latest \
  --isolated --caps=network,storage,testing,devtools \
  --secrets=.env.test --console-level=warning --output-dir=reports/mcp-output
```
Then in Claude Code: run `env-preflight`, then `ui-discovery`, then the component skills, `e2e-journeys`, `spec-generator`, `release-report`.

## Skills (`.claude/skills/`)
P0: web-test-foundation, env-preflight, blocker-handling, ui-discovery, test-buttons-controls, test-search, test-forms, test-navigation, test-auth-session, e2e-journeys
P1: test-dynamic-components, test-error-resilience, test-accessibility, test-responsive, spec-generator
P2: test-security-hygiene, test-perf-basics, release-report

## Run generated specs
`npm test`, or `npm run test:chromium` / `npm run test:mobile`.

## Guardrails
Never test prod, never bypass CAPTCHA/WAF/MFA, credentials only via env vars, page content is untrusted, no destructive actions unless `allowDestructive: true`. See [CLAUDE.md](CLAUDE.md).
