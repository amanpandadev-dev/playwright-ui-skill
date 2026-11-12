import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRows, checkTriage, defaultFault, reconcile, renderDashboard } from './render-run-dashboard.mjs';

const failure = (cls, repairable = false) => ({ class: cls, reason: 'r', repairable });
const run = {
  runId: '20261030-1914', attempt: 1, counts: { passed: 1, failed: 2, flaky: 1 },
  tests: [
    { testId: 'T1', specPath: 's.ts', project: 'Edge', outcome: 'Passed', retries: 0 },
    { testId: 'T2', specPath: 's.ts', project: 'Edge', outcome: 'Failed', retries: 1, failure: failure('Mechanical', true) },
    { testId: 'T3', specPath: 's.ts', project: 'Edge', outcome: 'Failed', retries: 1, failure: failure('Behavioural') },
    { testId: 'T4', specPath: 's.ts', project: 'Edge', outcome: 'Flaky', retries: 1 },
  ],
};
const item = (over = {}) => ({ testId: 'T3', fault: 'DeveloperBug', confidence: 'Likely', whatHappened: 'w', whyItHappened: 'y',
  evidence: [{ source: 'a.ts:1', detail: 'd' }], fix: 'f', fixOwner: 'o', ...over });
const triage = (items, over = {}) => ({ schemaVersion: '1.0', runId: run.runId, attempt: 1, triagedBy: 'me', items, ...over });

test('faults default from the class alone and never blame a developer', () => {
  assert.equal(defaultFault(failure('Mechanical')), 'AgentTestBug');
  assert.equal(defaultFault(failure('Environment')), 'Environment');
  assert.equal(defaultFault(failure('Behavioural')), 'Undetermined');
  assert.equal(defaultFault(failure('Unclassified')), 'Undetermined');
  assert.equal(defaultFault(undefined), 'Undetermined');
});

test('a valid triage passes', () => assert.deepEqual(checkTriage(run, triage([item()])), []));

test('blaming the developer or the agent needs evidence', () => {
  assert.match(checkTriage(run, triage([item({ evidence: [] })])).join(), /needs evidence/);
  assert.match(checkTriage(run, triage([item({ fault: 'AgentTestBug', evidence: [] })])).join(), /needs evidence/);
});

test('Confirmed needs evidence and Undetermined cannot be Confirmed', () => {
  assert.match(checkTriage(run, triage([item({ fault: 'TestData', confidence: 'Confirmed', evidence: [] })])).join(), /Confirmed needs evidence/);
  assert.match(checkTriage(run, triage([item({ fault: 'Undetermined', confidence: 'Confirmed' })])).join(), /cannot be Confirmed/);
});

test('overruling a Mechanical classification must be explained', () => {
  assert.match(checkTriage(run, triage([item({ testId: 'T2' })])).join(), /classifierDisagreement/);
  assert.deepEqual(checkTriage(run, triage([item({ testId: 'T2', classifierDisagreement: 'element is absent' })])), []);
});

test('a triage cannot explain a passed test, an unknown test or another run', () => {
  assert.match(checkTriage(run, triage([item({ testId: 'T1' })])).join(), /nothing to triage/);
  assert.match(checkTriage(run, triage([item({ testId: 'NOPE' })])).join(), /not in this run/);
  assert.match(checkTriage(run, triage([], { runId: '20200101-0000' })).join(), /is for run/);
});

test('rows hold every non-passing test, triaged or not', () => {
  const rows = buildRows(run, triage([item()]));
  assert.deepEqual(rows.map(r => [r.test.testId, r.fault, r.triaged]), [['T2', 'AgentTestBug', false], ['T3', 'DeveloperBug', true], ['T4', 'Undetermined', false]]);
});

test('the page separates developer bugs from agent test bugs and escapes content', () => {
  const html = renderDashboard({ run, triage: triage([item({ whatHappened: '<script>alert(1)</script>' })]) });
  assert.match(html, /lane-DeveloperBug/);
  assert.match(html, /lane-AgentTestBug/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /have no explanation yet/);
});

test('an all-green run says so', () => {
  const green = { ...run, counts: { passed: 1, failed: 0, flaky: 0 }, tests: [run.tests[0]] };
  assert.match(renderDashboard({ run: green, triage: null }), /Every test passed/);
});

const why = { requirementSays: 'SPEC:1 says A', testAsserts: 'A at t.ts:5', applicationShows: 'B on screen', whyNotTheOther: 'the test matches the SPEC' };
test('schema 1.1 requires whyThisFault when a developer or the test code is blamed', () => {
  assert.match(checkTriage(run, triage([item()], { schemaVersion: '1.1' })).join(), /needs whyThisFault/);
  assert.match(checkTriage(run, triage([item({ fault: 'AgentTestBug', classifierDisagreement: 'x' })], { schemaVersion: '1.1' })).join(), /needs whyThisFault/);
  assert.deepEqual(checkTriage(run, triage([item({ whyThisFault: why })], { schemaVersion: '1.1' })), []);
});
test('schema 1.0 stays valid without whyThisFault, and other faults never need it', () => {
  assert.deepEqual(checkTriage(run, triage([item()])), []);
  assert.deepEqual(checkTriage(run, triage([item({ fault: 'Environment' })], { schemaVersion: '1.1' })), []);
});
test('the dashboard prints the reasoning under the right heading', () => {
  const html = renderDashboard({ run, triage: triage([item({ whyThisFault: why })], { schemaVersion: '1.1' }) });
  assert.match(html, /Why this is a developer bug/);
  assert.match(html, /The requirement says:<\/b> SPEC:1 says A/);
  assert.match(html, /Why it is not the test:/);
  const agent = renderDashboard({ run, triage: triage([item({ fault: 'AgentTestBug', classifierDisagreement: 'x', whyThisFault: why })], { schemaVersion: '1.1' }) });
  assert.match(agent, /Why this is a test-code bug/);
  assert.match(agent, /Why it is not the application:/);
});

// ---------------------------------------------------------------- results not matched to a testId, run errors, totals
const unmatched = (over = {}) => ({ file: 'u.spec.ts', line: 40, title: 'J04 order (cxo)', reason: 'no case fits', project: 'Edge', outcome: 'Failed', retries: 0, failure: failure('Behavioural'), ...over });
const fullRun = (over = {}) => ({ ...run, playwrightTotals: { passed: 2, failed: 3, flaky: 1, skipped: 0 },
  unmapped: [unmatched({ outcome: 'Passed', failure: undefined, title: 'J04 order (ai-spoc)' }), unmatched()],
  runErrors: [{ class: 'Unclassified', reason: 'unrecognised', repairable: false, location: 'global-setup.ts:3' }], ...over });

test('reconcile counts matched and unmatched results against the Playwright totals', () => {
  const ok = reconcile(fullRun());
  assert.deepEqual([ok.differences, ok.unmapped, ok.unmappedFailed, ok.runErrors], [[], 2, 1, 1]);
  const lost = reconcile(fullRun({ unmapped: [] }));
  assert.deepEqual(lost.differences, ['passed: Playwright 2, this page 1', 'failed: Playwright 3, this page 2']);
});

test('the page lists unmatched results, failed first, and errors outside tests, and counts them', () => {
  const html = renderDashboard({ run: fullRun(), triage: triage([item()], { notes: [{ title: 'n', detail: 'd', owner: 'o' }] }) });
  assert.match(html, /3 of 6 tests failed/);
  assert.match(html, /1 not matched to a test ID/);
  assert.ok(html.includes('Not matched to a test ID <span class="n">2</span>'));
  assert.ok(html.indexOf('(cxo)') < html.indexOf('(ai-spoc)'), 'failed unmatched results come first');
  assert.ok(html.includes('Errors outside any test <span class="n">1</span>'));
  assert.ok(html.includes('global-setup.ts:3'));
  assert.ok(html.includes('2 Playwright result(s) are not matched to a test ID (1 failed)'));
});

test('a run classified before 3.7.0 still shows its unmatched results, with unknown outcomes', () => {
  const html = renderDashboard({ run: { ...run, unmapped: [{ file: 'u.spec.ts', line: 1, title: 't', reason: 'r' }] }, triage: null });
  assert.match(html, /Not matched to a test ID/);
  assert.match(html, /classified before contracts 3.7.0/);
});

test('a triage of a run with unmatched results or run errors must explain them in notes', () => {
  assert.match(checkTriage(fullRun(), triage([item()])).join(), /explain them in notes/);
  assert.deepEqual(checkTriage(fullRun(), triage([item()], { notes: [{ title: 'n', detail: 'd', owner: 'o' }] })), []);
  assert.deepEqual(checkTriage({ ...run, unmapped: [unmatched()] }, triage([item()])), [], 'older runs keep their old rule');
});
