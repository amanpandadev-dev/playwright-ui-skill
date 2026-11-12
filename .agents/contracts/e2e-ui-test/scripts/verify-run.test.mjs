// Tests for the e2e-ui-test-verify-run wiring: file scope, pipeline state and the entry gate.
// Run: node --test .agents/contracts/e2e-ui-test/scripts/verify-run.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scopeViolations, SKILLS } from './check-file-scope.mjs';
import { verifyState } from './pipeline-status.mjs';
import { fingerprint } from './validate-coverage.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SKILL = 'e2e-ui-test-verify-run';

// ---------------------------------------------------------------- file scope
const setup = { testDir: 'e2e', lanes: [{ laneId: 'local', fixtureEntryPoint: 'e2e/fixtures/test.ts', testData: { dataModule: 'e2e/data' } }] };
const violations = paths => scopeViolations({ skill: SKILL, setup, docsRoot: 'docs/e2e', touched: paths.map(p => ({ path: p, change: 'modified' })) });

test('verify-run is a known skill with its own record name', () => assert.ok(SKILLS.includes(SKILL)));
test('verify-run may change test sources, run reports and coverage views', () =>
  assert.deepEqual(violations(['e2e/specs/orders.spec.ts', 'e2e/pages/orders-page.ts', 'docs/e2e/runs/20260930-1000/run-1.json',
    'docs/e2e/runs/20260930-1000/repair-1.json', 'docs/e2e/coverage-manifest.json', 'docs/e2e/coverage-ledger.md', 'docs/e2e/scope/verify-202609301000.json']), []));
test('verify-run may not change fixtures, data builders, the catalog, setup or evaluations', () => {
  const found = violations(['e2e/fixtures/test.ts', 'e2e/data/orders.ts', 'e2e/test-catalog.json', 'e2e/test-catalog.schema.json',
    'docs/e2e/setup-decisions.json', 'docs/e2e/requirements-inventory.json', 'docs/e2e/evaluations/evaluation-tests-20260930-1000.json', 'playwright.config.ts']);
  assert.equal(found.length, 8, found.join('\n'));
});
test('the generator keeps its existing scope', () =>
  assert.deepEqual(scopeViolations({ skill: 'e2e-ui-test-generator', setup, docsRoot: 'docs/e2e', touched: [{ path: 'e2e/data/orders.ts', change: 'modified' }] }), []));

// ---------------------------------------------------------------- pipeline state
function docs({ runs = {}, specs = { 'e2e/specs/orders.spec.ts': 'spec v1' }, recorded = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-state-'));
  for (const [rel, content] of Object.entries(specs)) { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), content); }
  for (const [rel, content] of Object.entries(runs)) {
    const file = path.join(root, 'docs/e2e/runs', rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  }
  const manifest = { obligations: [{ obligationId: 'O-1', testIds: ['TC-J01'], ...(recorded ? { executionStatus: 'Failed', resultReference: recorded } : { executionStatus: 'NotRun' }) }] };
  return { root, docsAbs: path.join(root, 'docs/e2e'), manifest };
}
const runReport = (root, { repairable = 0, specContent = 'spec v1' } = {}) => ({
  specs: [{ path: 'e2e/specs/orders.spec.ts', fingerprint: `sha256:${fingerprint(specContent)}` }],
  tests: [{ testId: 'TC-J01', outcome: repairable ? 'Failed' : 'Passed', ...(repairable ? { failure: { class: 'Mechanical', reason: 'locator-timeout', repairable: true } } : {}) }],
  counts: {},
});

test('no runs directory means no run', () => assert.equal(verifyState(docs()).phase, 'no-run'));
test('a raw report without a run report needs classifying', () => {
  const s = verifyState(docs({ runs: { '20260930-1000/playwright/report-1.json': '{}' } }));
  assert.deepEqual([s.phase, s.runId, s.attempt], ['classify', '20260930-1000', 1]);
});
test('repairable failures within the attempt limit need repairing', () => {
  const s = verifyState(docs({ runs: { '20260930-1000/playwright/report-1.json': '{}', '20260930-1000/run-1.json': runReport(null, { repairable: 1 }) } }));
  assert.deepEqual([s.phase, s.repairable], ['repair', 1]);
});
const overruling = (over = {}) => ({ schemaVersion: '1.0', runId: '20260930-1000', attempt: 1, triagedBy: 'x', items: [{ testId: 'TC-J01', fault: 'DeveloperBug', confidence: 'Likely',
  whatHappened: 'w', whyItHappened: 'y', evidence: [{ source: 'a.ts:1', detail: 'd' }], fix: 'f', fixOwner: 'o', classifierDisagreement: 'the element is absent', ...over }] });
const classified = () => ({ ...runReport(null, { repairable: 1 }), runId: '20260930-1000', attempt: 1 });
test('a valid triage can overrule a repairable failure', () =>
  assert.equal(verifyState(docs({ runs: { '20260930-1000/run-1.json': classified(), '20260930-1000/triage-1.json': overruling() } })).phase, 'record'));
test('a triage blaming the test code leaves it repairable', () =>
  assert.equal(verifyState(docs({ runs: { '20260930-1000/run-1.json': classified(), '20260930-1000/triage-1.json': overruling({ fault: 'AgentTestBug' }) } })).phase, 'repair'));
test('an invalid triage overrules nothing', () =>
  assert.equal(verifyState(docs({ runs: { '20260930-1000/run-1.json': classified(), '20260930-1000/triage-1.json': overruling({ evidence: [] }) } })).phase, 'repair'));
test('repaired specs need a new run', () => {
  const s = verifyState(docs({ specs: { 'e2e/specs/orders.spec.ts': 'spec v2' }, runs: { '20260930-1000/run-1.json': runReport(null, { repairable: 1 }) } }));
  assert.deepEqual([s.phase, s.attempt], ['rerun', 2]);
});
test('repairable failures after the last attempt go to recording', () =>
  assert.equal(verifyState(docs({ runs: { '20260930-1000/run-3.json': runReport(null, { repairable: 1 }) } })).phase, 'record'));
test('a recorded attempt must be explained before the pipeline moves on', () => {
  const runs = { '20260930-1000/run-1.json': runReport(null) };
  const s = verifyState(docs({ runs, recorded: 'docs/e2e/runs/20260930-1000/run-1.json' }));
  assert.deepEqual([s.phase, s.missing], ['explain', ['dashboard-1.html']]);
});
test('a recorded attempt with a failure also needs its triage', () => {
  const runs = { '20260930-1000/run-1.json': { ...runReport(null, { repairable: 1 }), tests: [{ testId: 'TC-J01', outcome: 'Failed', failure: { class: 'Behavioural', reason: 'assertion-mismatch', repairable: false } }] }, '20260930-1000/dashboard-1.html': '<p>x</p>' };
  const s = verifyState(docs({ runs, recorded: 'docs/e2e/runs/20260930-1000/run-1.json' }));
  assert.deepEqual([s.phase, s.missing], ['explain', ['triage-1.json']]);
});
test('a clean run is recorded once, then done', () => {
  assert.equal(verifyState(docs({ runs: { '20260930-1000/run-1.json': runReport(null) } })).phase, 'record');
  assert.equal(verifyState(docs({ runs: { '20260930-1000/run-1.json': runReport(null), '20260930-1000/dashboard-1.html': '<p>x</p>' }, recorded: 'docs/e2e/runs/20260930-1000/run-1.json' })).phase, 'recorded');
});
test('the latest run ID wins', () =>
  assert.equal(verifyState(docs({ runs: { '20260929-0900/run-1.json': runReport(null), '20260930-1000/playwright/report-1.json': '{}' } })).runId, '20260930-1000'));

// ---------------------------------------------------------------- entry gate
test('the gate refuses without setup decisions and names env-setup', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-gate-'));
  const out = spawnSync(process.execPath, [path.join(here, 'check-gates.mjs'), '--skill', SKILL, '--docs-root', 'docs/e2e', '--root', root], { encoding: 'utf8' });
  assert.equal(out.status, 2, out.stdout + out.stderr);
  assert.match(out.stdout, /REFUSED \(e2e-ui-test-verify-run\): setup-decisions\.json not found.*e2e-ui-test-env-setup/);
});
test('the skill declares its contracts and carries the shared invariants verbatim', () => {
  const read = name => fs.readFileSync(path.resolve(here, '../../../skills', name, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
  const block = text => text.slice(text.indexOf('## Invariants (shared, verbatim)'), text.indexOf('Requires contracts:'));
  const skill = read(SKILL);
  assert.match(skill, /\nRequires contracts: \^\d+\.\d+\.\d+\s*\n/);
  assert.equal(block(skill), block(read('e2e-ui-test-generator')));
});
