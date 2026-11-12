// Tests for record-execution.mjs. Run: node --test .agents/contracts/e2e-ui-test/scripts/record-execution.test.mjs
// Needs a TypeScript parser: E2E_TYPESCRIPT=<path to typescript.js>, or typescript installed at the repository root.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classifyFailure, executionPatch, matchCase } from './record-execution.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
const tsPath = process.env.E2E_TYPESCRIPT || path.join(repoRoot, 'node_modules/typescript/lib/typescript.js');
const skip = fs.existsSync(tsPath) ? false : 'no TypeScript parser: set E2E_TYPESCRIPT';

// ---------------------------------------------------------------- classification (messages as Playwright prints them)
const LOCATOR_TIMEOUT = `Error: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Approve' })`;
const STRICT = `Error: locator.click: Error: strict mode violation: getByRole('button', { name: 'Approve' }) resolved to 2 elements:
    1) <button>Approve</button> aka getByRole('button', { name: 'Approve' }).first()`;
const NOT_FOUND = `Error: Timed out 5000ms waiting for expect(locator).toHaveText(expected)

Locator: getByRole('status')
Expected string: "Approved"
Received: <element(s) not found>`;
const MISMATCH = `Error: Timed out 5000ms waiting for expect(locator).toHaveText(expected)

Locator: getByRole('status')
Expected string: "Approved"
Received string: "Pending for Jane Customer"`;
const err = (message, file = 'e2e/specs/orders.spec.ts', line = 8) => ({ message, location: { file, line, column: 3 } });

test('locator timeout is a repairable mechanical failure with its locator', () => {
  const f = classifyFailure([err(LOCATOR_TIMEOUT)]);
  assert.deepEqual(f, { class: 'Mechanical', reason: 'locator-timeout', repairable: true, locator: "getByRole('button', { name: 'Approve' })", location: 'e2e/specs/orders.spec.ts:8' });
});
test('strict mode violation is mechanical', () => assert.equal(classifyFailure([err(STRICT)]).reason, 'strict-mode-violation'));
test('an assertion whose locator never resolves is mechanical', () => {
  const f = classifyFailure([err(NOT_FOUND)]);
  assert.equal(f.reason, 'assertion-locator-unresolved');
  assert.equal(f.matcher, 'toHaveText');
  assert.equal(f.locator, "getByRole('status')");
});
test('a wrong value is behavioural, never repairable, and keeps no page text', () => {
  const f = classifyFailure([err(MISMATCH)]);
  assert.equal(f.class, 'Behavioural');
  assert.equal(f.repairable, false);
  assert.doesNotMatch(JSON.stringify(f), /Pending|Jane/);
});
test('an unreachable target is environment', () =>
  assert.equal(classifyFailure([err('Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/orders')]).reason, 'target-unreachable'));
test('a 403 from seeding is environment', () =>
  assert.equal(classifyFailure([err('Error: apiRequestContext.post: 403 Forbidden')]).reason, 'auth-rejected'));
test('a failure inside a fixture directory is environment', () => {
  const f = classifyFailure([err(LOCATOR_TIMEOUT, 'e2e/fixtures/test.ts', 20)], { protectedDirs: ['e2e/fixtures'] });
  assert.deepEqual([f.class, f.reason], ['Environment', 'fixture-or-seed-failure']);
});
test('environment outranks other failures in the same result', () =>
  assert.equal(classifyFailure([err(MISMATCH), err('Error: page.goto: net::ERR_NAME_NOT_RESOLVED')]).class, 'Environment'));
test('a bare test timeout is unclassified', () =>
  assert.deepEqual(classifyFailure([err('Test timeout of 30000ms exceeded.')]), { class: 'Unclassified', reason: 'test-timeout', repairable: false, location: 'e2e/specs/orders.spec.ts:8' }));
test('ANSI colour codes are ignored', () =>
  assert.equal(classifyFailure([err('\u001b[31mError: locator.fill: Timeout 5000ms exceeded.\u001b[39m\nCall log:\n  - waiting for getByLabel(\'Reason\')')]).locator, "getByLabel('Reason')"));

// ---------------------------------------------------------------- manifest patch
const manifestWith = obligations => ({ obligations: obligations.map(([obligationId, testIds, coverageStatus = 'Covered']) => ({ obligationId, testIds, coverageStatus })) });
const run = tests => ({ tests: tests.map(([testId, outcome, project = 'chromium']) => ({ testId, outcome, project })) });

test('execution status aggregates every test and project of an obligation', () => {
  const { patch, skipped } = executionPatch(
    manifestWith([['O-1', ['TC-J01']], ['O-2', ['TC-J01', 'TC-J02']], ['O-3', ['TC-J03']], ['O-4', ['TC-J04']], ['O-5', ['TC-J09']], ['O-6', [], 'Blocked'], ['O-7', [], 'Planned']]),
    run([['TC-J01', 'Passed'], ['TC-J01', 'Flaky', 'firefox'], ['TC-J02', 'Failed'], ['TC-J03', 'Skipped'], ['TC-J04', 'Skipped'], ['TC-J04', 'Passed', 'firefox']]),
    'docs/e2e/runs/r1/run-2.json');
  assert.deepEqual(patch.obligations.map(o => [o.obligationId, o.set.executionStatus]), [['O-1', 'Passed'], ['O-2', 'Failed'], ['O-3', 'Skipped'], ['O-4', 'Passed']]);
  assert.ok(patch.obligations.every(o => o.set.resultReference === 'docs/e2e/runs/r1/run-2.json' && Object.keys(o.set).length === 2));
  assert.deepEqual(skipped, [{ obligationId: 'O-5', reason: 'not in this run: TC-J09' }]);
});

// ---------------------------------------------------------------- CLI against a temporary repository
const SPEC = `import { test, expect } from '../fixtures/test';

// @e2e-meta {"testId":"TC-J01","journeyId":"J01","portalEligible":true}
test('approver approves a pending order', async ({ page }) => {
  await page.getByRole('button', { name: 'Approve' }).click();
  // @e2e-evidence approve-status
  await expect(page.getByRole('status')).toHaveText('Approved');
});

// @e2e-meta {"testId":"TC-J02","journeyId":"J01","portalEligible":true}
test('viewer cannot approve', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
});
`;
const obligation = (obligationId, testIds) => ({ obligationId, requirementId: 'R-1', persona: 'approver', preconditions: 'pending order exists',
  expectedBehavior: 'order is approved', evidenceLayer: 'BrowserIntegrated', mockingScope: [], testIds,
  assertionReferences: [{ testId: testIds[0], path: 'e2e/specs/orders.spec.ts', anchor: 'approve-status' }],
  review: { status: 'Supported' }, coverageStatus: 'Covered', executionStatus: 'NotRun' });

function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-'));
  const files = {
    '.gitignore': 'docs/e2e/runs/**/playwright/\n',
    'e2e/specs/orders.spec.ts': SPEC,
    'e2e/fixtures/test.ts': 'export { test, expect } from "@playwright/test";\n',
    'docs/e2e/setup-decisions.json': JSON.stringify({ testDir: 'e2e', lanes: [
      { laneId: 'local', target: 'local', environment: 'local-dev', fixtureEntryPoint: 'e2e/fixtures/test.ts' },
      { laneId: 'azure-prod', target: 'azure', environment: 'production', fixtureEntryPoint: 'e2e/fixtures/test.ts' }] }),
    'docs/e2e/requirements-inventory.json': JSON.stringify({ requirements: [{ requirementId: 'R-1' }] }),
    'docs/e2e/coverage-manifest.json': `${JSON.stringify({ applicationId: 'app', requirementsInventoryRef: { path: 'docs/e2e/requirements-inventory.json' },
      artifacts: { ledger: 'docs/e2e/ledger.md', gaps: 'docs/e2e/gaps.md', plans: [{ path: 'docs/e2e/plan.md', obligationIds: ['O-1', 'O-2'] }] },
      requirements: [], obligations: [obligation('O-1', ['TC-J01']), obligation('O-2', ['TC-J02'])] }, null, 2)}\n`,
    'docs/e2e/ledger.md': '# Ledger\n', 'docs/e2e/gaps.md': '# Gaps\n', 'docs/e2e/plan.md': '# Plan\n',
  };
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  spawnSync('git', ['init', '-q', root]);
  // Bring the derived views in line with the manifest, as the plan generator leaves a real repository.
  spawnSync(process.execPath, [path.join(here, 'sync-coverage.mjs'), '--skill', 'e2e-ui-test-plan-generator', '--root', root, '--docs-root', 'docs/e2e', '--typescript', tsPath]);
  return root;
}
const playwrightReport = (root, where = 'docs/e2e/runs/r1/playwright/report-1.json') => {
  const results = (status, message) => [{ status, retry: 0, errors: message ? [{ message, location: { file: path.join(root, 'e2e/specs/orders.spec.ts'), line: 7, column: 3 } }] : [] }];
  const report = { config: { version: '1.55.0', rootDir: path.join(root, 'e2e') }, stats: { startTime: '2026-09-30T10:00:00.000Z' }, errors: [],
    suites: [{ title: 'specs/orders.spec.ts', file: 'specs/orders.spec.ts', specs: [], suites: [{ title: 'group', file: 'specs/orders.spec.ts', suites: [], specs: [
      { title: 'approver approves a pending order', file: 'specs/orders.spec.ts', line: 4, column: 1, tests: [
        { projectName: 'chromium', status: 'unexpected', results: [...results('failed', LOCATOR_TIMEOUT), { ...results('failed', MISMATCH)[0], retry: 1 }] }] },
      { title: 'viewer cannot approve', file: 'specs/orders.spec.ts', line: 11, column: 1, tests: [{ projectName: 'chromium', status: 'expected', results: results('passed') }] },
      { title: 'dynamic test', file: 'specs/orders.spec.ts', line: 99, column: 1, tests: [{ projectName: 'chromium', status: 'expected', results: results('passed') }] },
    ] }] }] };
  const file = path.join(root, where);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(report));
  return file;
};
const cli = (...args) => spawnSync(process.execPath, [path.join(here, 'record-execution.mjs'), ...args, '--typescript', tsPath], { encoding: 'utf8' });
const classify = (root, report, ...extra) => cli('classify', '--root', root, '--docs-root', 'docs/e2e', '--report', report, '--run-id', 'r1', '--attempt', '1', '--lane', 'local', ...extra);

test('classify writes a schema-valid run report without page text', { skip }, () => {
  const root = repo();
  const out = classify(root, playwrightReport(root));
  assert.equal(out.status, 0, out.stdout + out.stderr);
  const report = JSON.parse(fs.readFileSync(path.join(root, 'docs/e2e/runs/r1/run-1.json'), 'utf8'));
  assert.deepEqual(report.tests.map(t => [t.testId, t.outcome, t.retries]), [['TC-J01', 'Failed', 1], ['TC-J02', 'Passed', 0]]);
  assert.equal(report.tests[0].failure.class, 'Behavioural', 'the last attempt decides the class');
  assert.equal(report.unmapped.length, 1);
  assert.deepEqual([report.unmapped[0].outcome, report.unmapped[0].project], ['Passed', 'chromium'], 'an unmatched result keeps its outcome');
  assert.deepEqual(report.runErrors, []);
  assert.match(report.specs[0].fingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.equal(report.source.playwrightReport, 'docs/e2e/runs/r1/playwright/report-1.json');
  assert.doesNotMatch(JSON.stringify(report), /Pending|Jane/);
  assert.match(out.stdout, /BLOCK  TC-J01 \[chromium\] Behavioural\/assertion-mismatch/);
  assert.match(out.stdout, /UNMAPPED/);
});

test('classify refuses production lanes, tracked reports and overwrites', { skip }, () => {
  const root = repo();
  const report = playwrightReport(root);
  let out = cli('classify', '--root', root, '--docs-root', 'docs/e2e', '--report', report, '--run-id', 'r1', '--attempt', '1', '--lane', 'azure-prod');
  assert.equal(out.status, 2);
  assert.match(out.stdout, /production/);
  out = classify(root, playwrightReport(root, 'docs/e2e/report.json'));
  assert.equal(out.status, 2);
  assert.match(out.stdout, /not git-ignored/);
  assert.equal(classify(root, report).status, 0);
  out = classify(root, report);
  assert.equal(out.status, 2);
  assert.match(out.stdout, /never overwritten/);
});

test('record sets execution status through sync-coverage and leaves coverage status alone', { skip }, () => {
  const root = repo();
  assert.equal(classify(root, playwrightReport(root)).status, 0);
  const out = cli('record', '--root', root, '--docs-root', 'docs/e2e', '--run', 'docs/e2e/runs/r1/run-1.json');
  assert.match(out.stdout, /2 obligation\(s\) patched/, out.stdout + out.stderr);
  assert.match(out.stdout, /Plan fingerprint unchanged/);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/e2e/coverage-manifest.json'), 'utf8'));
  assert.deepEqual(manifest.obligations.map(o => [o.obligationId, o.coverageStatus, o.executionStatus, o.resultReference]),
    [['O-1', 'Covered', 'Failed', 'docs/e2e/runs/r1/run-1.json'], ['O-2', 'Covered', 'Passed', 'docs/e2e/runs/r1/run-1.json']]);
});

test('record refuses a run whose specs changed afterwards', { skip }, () => {
  const root = repo();
  assert.equal(classify(root, playwrightReport(root)).status, 0);
  fs.appendFileSync(path.join(root, 'e2e/specs/orders.spec.ts'), '\n');
  const out = cli('record', '--root', root, '--docs-root', 'docs/e2e', '--run', 'docs/e2e/runs/r1/run-1.json');
  assert.equal(out.status, 2);
  assert.match(out.stdout, /changed after the run/);
});

test('sync-coverage lets verify-run set execution fields only', { skip }, () => {
  const root = repo();
  const patch = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'exec-patch-')), 'patch.json');
  fs.writeFileSync(patch, JSON.stringify({ obligations: [{ obligationId: 'O-1', set: { coverageStatus: 'Blocked' } }] }));
  const out = spawnSync(process.execPath, [path.join(here, 'sync-coverage.mjs'), '--skill', 'e2e-ui-test-verify-run', '--root', root, '--docs-root', 'docs/e2e', '--patch', patch, '--typescript', tsPath], { encoding: 'utf8' });
  assert.equal(out.status, 2, out.stdout + out.stderr);
  assert.match(out.stdout, /records execution only/);
});

// ---------------------------------------------------------------- parameterized cases (no parser needed)
const cases = ids => ids.map(testId => ({ testId, line: 40 }));
const roles = cases(['US001-J03-platform-admin', 'US001-J03-cxo', 'US001-J03-ai-spoc', 'US001-J03-ai-developer']);
const roleTitle = r => `US001-J03 Each role's dashboard lists sections in layout order (${r})`;
const roleTitles = ['platform-admin', 'cxo', 'ai-spoc', 'ai-developer'].map(roleTitle);

test('a parameterized title matches its case by the case value, without the testId', () => {
  for (const [i, r] of ['platform-admin', 'cxo', 'ai-spoc', 'ai-developer'].entries()) {
    const m = matchCase(roles, roleTitle(r), roleTitles);
    assert.equal(m.record?.testId, roles[i].testId, r);
    assert.equal(m.matchedBy, 'case value in title');
  }
});

test('the testId in the title still wins', () =>
  assert.equal(matchCase(roles, 'US001-J03-cxo layout', ['US001-J03-cxo layout']).matchedBy, 'testId in title'));

test('case values that also appear in the shared title are told apart by the part that differs', () => {
  const files = cases(['US002-J11-oversized', 'US002-J11-empty', 'US002-J11-unsupported-type']);
  const title = v => `US002-J11 Oversized, empty and unsupported attachments are refused (${v})`;
  const titles = ['oversized', 'empty', 'unsupported'].map(title);
  assert.deepEqual(titles.map(t => matchCase(files, t, titles).record?.testId), files.map(f => f.testId));
});

test('a filtered run with one result of the loop falls back to the last parenthesised group', () =>
  assert.equal(matchCase(roles, roleTitle('ai-spoc'), [roleTitle('ai-spoc')]).record?.testId, 'US001-J03-ai-spoc'));

test('a title that fits no case, or several, says why and names the case values', () => {
  const m = matchCase(roles, 'US001-J03 layout order (viewer)', ['US001-J03 layout order (viewer)']);
  assert.equal(m.record, undefined);
  assert.match(m.reason, /4 parameterized cases share this line.*platform-admin, cxo, ai-spoc, ai-developer/);
});
