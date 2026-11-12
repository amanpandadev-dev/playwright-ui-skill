#!/usr/bin/env node
// Readable dashboard for one verify attempt. Reads runs/<id>/run-<n>.json (the results, transcribed from the
// developer's Playwright report) and the optional runs/<id>/triage-<n>.json (the explanation of each failure), and
// writes one self-contained runs/<id>/dashboard-<n>.html. It never runs Playwright, browsers or tests, and it reports
// no result that run-<n>.json does not hold.
//
//   node render-run-dashboard.mjs --docs-root <dir> --run-id <id> [--attempt <n>] [--root <repo>] [--catalog <file>] [--strict]
//
// Exit codes: 0 written, 1 usage, 2 refused (invalid triage, or with --strict a failure without triage).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from './json-schema-lite.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = JSON.parse(fs.readFileSync(path.join(here, '..', 'schemas', 'run-triage.schema.json'), 'utf8'));

export const FAULTS = {
  DeveloperBug: { label: 'Developer bug', blurb: 'The application does not do what the requirement says. Fix the application; the test stays as written.' },
  AgentTestBug: { label: 'Agent test-code bug', blurb: 'The generated test is wrong while the application is right. Fix the test.' },
  Environment: { label: 'Environment', blurb: 'The lane was not usable: servers, sign-in, browser or variables.' },
  TestData: { label: 'Test data', blurb: 'The data the test relied on was not in the state it expected.' },
  RequirementGap: { label: 'Requirement gap', blurb: 'The requirement does not settle what should happen. A person decides.' },
  Undetermined: { label: 'Not determined', blurb: 'The evidence does not settle whose fault this is. A person opens the trace and decides.' },
};
const ORDER = ['DeveloperBug', 'AgentTestBug', 'Environment', 'TestData', 'RequirementGap', 'Undetermined'];

/** The fault a failure gets from its class alone, before anyone has explained it. */
export function defaultFault(failure) {
  if (!failure) return 'Undetermined';
  if (failure.class === 'Mechanical') return 'AgentTestBug';
  if (failure.class === 'Environment') return 'Environment';
  return 'Undetermined';
}

/** Rules a schema cannot state. Returns a list of problems. */
export function checkTriage(run, triage) {
  const problems = validate(SCHEMA, triage).map(e => typeof e === 'string' ? e : JSON.stringify(e));
  if (problems.length) return problems;
  if (triage.runId !== run.runId) problems.push(`triage is for run ${triage.runId}, not ${run.runId}`);
  if (triage.attempt !== run.attempt) problems.push(`triage is for attempt ${triage.attempt}, not ${run.attempt}`);
  const known = new Map((run.tests || []).map(t => [t.testId, t]));
  const seen = new Set();
  for (const item of triage.items) {
    const test = known.get(item.testId);
    if (seen.has(item.testId)) problems.push(`${item.testId}: triaged twice`);
    seen.add(item.testId);
    if (!test) problems.push(`${item.testId}: not in this run`);
    else if (test.outcome === 'Passed') problems.push(`${item.testId}: passed, so there is nothing to triage`);
    if (['DeveloperBug', 'AgentTestBug'].includes(item.fault) && !item.evidence.length) problems.push(`${item.testId}: blaming ${item.fault} needs evidence`);
    if (triage.schemaVersion === '1.1' && ['DeveloperBug', 'AgentTestBug'].includes(item.fault) && !item.whyThisFault) problems.push(`${item.testId}: blaming ${item.fault} needs whyThisFault`);
    if (item.confidence === 'Confirmed' && !item.evidence.length) problems.push(`${item.testId}: Confirmed needs evidence`);
    if (item.fault === 'Undetermined' && item.confidence === 'Confirmed') problems.push(`${item.testId}: Undetermined cannot be Confirmed`);
    const expected = test?.failure ? defaultFault(test.failure) : null;
    if (test?.failure?.class === 'Mechanical' && item.fault !== expected && !item.classifierDisagreement) problems.push(`${item.testId}: the classifier says Mechanical; explain the disagreement in classifierDisagreement`);
  }
  const check = reconcile(run);
  if (run.playwrightTotals && (check.unmapped || check.runErrors) && !(triage.notes || []).length)
    problems.push(`${check.unmapped} result(s) not matched to a testId and ${check.runErrors} run error(s): explain them in notes`);
  return problems;
}

const OUTCOME_KEY = { Passed: 'passed', Failed: 'failed', Flaky: 'flaky', Skipped: 'skipped' };

/**
 * Every Playwright result must reach the page: matched to a testId, or listed as not matched. Compares those with
 * Playwright's own totals. A run classified before contracts 3.7.0 has no totals and unmatched results without outcomes.
 */
export function reconcile(run) {
  const unmapped = run.unmapped || [];
  const seen = { passed: 0, failed: 0, flaky: 0, skipped: 0 };
  for (const t of [...(run.tests || []), ...unmapped.filter(u => u.outcome)]) seen[OUTCOME_KEY[t.outcome]]++;
  const totals = run.playwrightTotals || null;
  const differences = totals ? Object.keys(seen).filter(k => seen[k] !== totals[k]).map(k => `${k}: Playwright ${totals[k]}, this page ${seen[k]}`) : [];
  return { seen, totals, differences, unmapped: unmapped.length, unmappedFailed: unmapped.filter(u => u.outcome === 'Failed').length,
    unknownOutcome: unmapped.filter(u => !u.outcome).length, runErrors: (run.runErrors || []).length };
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** One row per test that did not simply pass, merged with its triage. */
export function buildRows(run, triage, titles = {}) {
  const items = new Map((triage?.items || []).map(i => [i.testId, i]));
  return (run.tests || []).filter(t => t.outcome !== 'Passed').map(t => {
    const item = items.get(t.testId);
    return { test: t, title: titles[t.testId] || '', item, fault: item?.fault ?? defaultFault(t.failure), triaged: !!item };
  });
}

function card(row) {
  const { test, title, item, fault, triaged } = row;
  const f = test.failure;
  const where = f?.location || test.specPath;
  const evidence = (item?.evidence || []).map(e => `<li><code>${esc(e.source)}</code> ${esc(e.detail)}</li>`).join('');
  const w = item?.whyThisFault;
  const reasoning = w ? `<dt>Why this is ${fault === 'DeveloperBug' ? 'a developer bug' : fault === 'AgentTestBug' ? 'a test-code bug' : 'this fault'}</dt><dd><ul class="reasoning">
        <li><b>The requirement says:</b> ${esc(w.requirementSays)}</li>
        <li><b>The test asserts:</b> ${esc(w.testAsserts)}</li>
        <li><b>The application shows:</b> ${esc(w.applicationShows)}</li>
        <li><b>Why it is not ${fault === 'DeveloperBug' ? 'the test' : 'the application'}:</b> ${esc(w.whyNotTheOther)}</li></ul></dd>` : '';
  const body = triaged ? `
    <dl>
      <dt>What went wrong</dt><dd>${esc(item.whatHappened)}</dd>
      <dt>Why</dt><dd>${esc(item.whyItHappened)}</dd>
      ${reasoning}
      <dt>How to fix it</dt><dd>${esc(item.fix)} <strong>Owner: ${esc(item.fixOwner)}.</strong></dd>
      ${evidence ? `<dt>Evidence</dt><dd><ul>${evidence}</ul></dd>` : ''}
      ${item.classifierDisagreement ? `<dt>Differs from the classifier</dt><dd>${esc(item.classifierDisagreement)}</dd>` : ''}
    </dl>` : `<p class="untriaged">Not explained yet. The fault shown comes from the failure class alone.</p>`;
  return `
  <article class="card" data-fault="${esc(fault)}">
    <header>
      <div><h4>${esc(test.testId)}${title ? ` <span>${esc(title)}</span>` : ''}</h4>
      <p class="where"><code>${esc(where)}</code></p></div>
      <div class="tags"><span class="tag fault-${esc(fault)}">${esc(FAULTS[fault].label)}</span>
      <span class="tag plain">${esc(test.outcome)}</span>
      ${item ? `<span class="tag plain">${esc(item.confidence)}</span>` : ''}</div>
    </header>
    <p class="classifier">Classifier: ${f ? `${esc(f.class)} / ${esc(f.reason)}${f.repairable ? ' / repairable' : ''}` : 'no failure on the last attempt'}${test.retries ? ` · retries ${esc(test.retries)}` : ''}</p>
    ${body}
  </article>`;
}

function unmatchedSection(run) {
  const list = [...(run.unmapped || [])].sort((a, b) => (a.outcome === 'Failed' ? 0 : 1) - (b.outcome === 'Failed' ? 0 : 1));
  if (!list.length) return '';
  const row = u => `<tr${u.outcome === 'Failed' ? ' class="failed"' : ''}><td><code>${esc(u.file)}:${esc(u.line)}</code></td><td>${esc(u.title)}</td><td>${esc(u.project ?? '')}</td>
<td>${esc(u.outcome ?? 'unknown')}</td><td>${u.failure ? `${esc(u.failure.class)} / ${esc(u.failure.reason)}${u.failure.location ? ` at <code>${esc(u.failure.location)}</code>` : ''}` : ''}</td><td>${esc(u.reason)}</td></tr>`;
  return `<h2>Not matched to a test ID <span class="n">${list.length}</span></h2>
<p class="blurb">Playwright ran these, but no @e2e-meta testId could be matched to them, so no obligation records their result.
The title or metadata needs fixing (e2e-ui-test-generator), or the matching tool does (contracts owner).</p>
<div class="scroll"><table><thead><tr><th>Spec</th><th>Title</th><th>Project</th><th>Outcome</th><th>Classifier</th><th>Why not matched</th></tr></thead><tbody>
${list.map(row).join('\n')}
</tbody></table></div>`;
}

function runErrorsSection(run) {
  const list = run.runErrors || [];
  if (!list.length) return '';
  return `<h2>Errors outside any test <span class="n">${list.length}</span></h2>
<p class="blurb">Raised while loading specs or in global setup or teardown. The messages are in the Playwright report.</p>
<table><thead><tr><th>Classifier</th><th>Where</th></tr></thead><tbody>
${list.map(f => `<tr class="failed"><td>${esc(f.class)} / ${esc(f.reason)}</td><td><code>${esc(f.location ?? '')}</code></td></tr>`).join('\n')}
</tbody></table>`;
}

function tile(value, label, cls = '') {
  return `<div class="tile ${cls}"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`;
}

export function renderDashboard({ run, triage, titles = {} }) {
  const rows = buildRows(run, triage, titles);
  const counts = run.counts || {};
  const check = reconcile(run);
  const total = (run.tests || []).length + check.unmapped;
  const failedAll = (counts.failed ?? 0) + check.unmappedFailed;
  const passedClean = (run.tests || []).filter(t => t.outcome === 'Passed');
  const byFault = Object.fromEntries(ORDER.map(k => [k, rows.filter(r => r.fault === k)]));
  const lane = (key) => {
    const list = byFault[key];
    return `<section class="lane lane-${key}">
      <h3>${esc(FAULTS[key].label)} <span class="n">${list.length}</span></h3>
      <p class="blurb">${esc(FAULTS[key].blurb)}</p>
      ${list.length ? list.map(card).join('') : '<p class="none">None in this attempt.</p>'}
    </section>`;
  };
  const others = ORDER.slice(2).filter(k => byFault[k].length);
  const untriaged = rows.filter(r => !r.triaged).length;
  const notes = (triage?.notes || []).map(n => `<li><strong>${esc(n.title)}</strong> ${esc(n.detail)} <em>Owner: ${esc(n.owner)}.</em></li>`).join('');
  const headline = rows.length === 0 && !check.unmappedFailed && !check.runErrors ? (check.unmapped ? 'Every matched test passed.' : 'Every test passed.')
    : `${failedAll} of ${total} tests failed${counts.flaky ? ` and ${counts.flaky} passed only on retry` : ''}`
      + (rows.length ? ': ' + ORDER.filter(k => byFault[k].length).map(k => `${byFault[k].length} ${FAULTS[k].label.toLowerCase()}${byFault[k].length > 1 && /(bug|gap)$/i.test(FAULTS[k].label) ? 's' : ''}`).join(', ') : '')
      + (check.unmappedFailed ? `${rows.length ? ', ' : ': '}${check.unmappedFailed} not matched to a test ID` : '')
      + (check.runErrors ? `, plus ${check.runErrors} error(s) outside any test` : '') + '.';
  const alerts = [
    check.unmapped ? `${check.unmapped} Playwright result(s) are not matched to a test ID${check.unmappedFailed ? ` (${check.unmappedFailed} failed)` : ''}. They are listed below, and no obligation records them.` : '',
    check.unknownOutcome ? `${check.unknownOutcome} of them were classified before contracts 3.7.0, so their outcome is unknown. Classify the report again to see it.` : '',
    check.runErrors ? `Playwright raised ${check.runErrors} error(s) outside any test.` : '',
    ...check.differences.map(d => `Counts differ from the Playwright report, ${d}.`),
  ].filter(Boolean);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>E2E Run Dashboard</title>
<style>
:root{--bg:#f7f7f5;--surface:#fff;--ink:#1c1d1f;--muted:#5f6368;--line:#dfe0dc;--dev:#b3261e;--dev-bg:#fbeae8;--agent:#1f5fbf;--agent-bg:#e8f0fb;--env:#8a5a00;--env-bg:#f8efdc;--data:#6a3fb0;--data-bg:#f0eafa;--req:#0b6b63;--req-bg:#e2f3f1;--und:#55585c;--und-bg:#ececea;--pass:#1b7a3d}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#161719;--surface:#202225;--ink:#ececea;--muted:#a4a7ab;--line:#37393d;--dev:#f28b82;--dev-bg:#3b2120;--agent:#8ab4f8;--agent-bg:#1e2c42;--env:#e5b95c;--env-bg:#3a2e16;--data:#c3a6f5;--data-bg:#2e2542;--req:#6fd0c5;--req-bg:#143330;--und:#b4b6b9;--und-bg:#2c2e31;--pass:#6fcf8e}}
:root[data-theme="dark"]{--bg:#161719;--surface:#202225;--ink:#ececea;--muted:#a4a7ab;--line:#37393d;--dev:#f28b82;--dev-bg:#3b2120;--agent:#8ab4f8;--agent-bg:#1e2c42;--env:#e5b95c;--env-bg:#3a2e16;--data:#c3a6f5;--data-bg:#2e2542;--req:#6fd0c5;--req-bg:#143330;--und:#b4b6b9;--und-bg:#2c2e31;--pass:#6fcf8e}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,"Segoe UI",sans-serif}
main{max-width:1180px;margin:0 auto;padding:32px 16px 56px}h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:36px 0 12px}
.meta,.blurb,.where,.classifier,.none{color:var(--muted)}.meta{margin:0}.lead{font-size:18px;margin:16px 0 20px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}.tile{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:12px 14px}.tile strong{display:block;font-size:26px;font-variant-numeric:tabular-nums}.tile span{color:var(--muted);font-size:13px}.tile.dev strong{color:var(--dev)}.tile.agent strong{color:var(--agent)}.tile.ok strong{color:var(--pass)}
.compare{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:16px}.lane{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:16px;min-width:0}.lane h3{margin:0;font-size:17px}.lane-DeveloperBug{border-top:4px solid var(--dev)}.lane-AgentTestBug{border-top:4px solid var(--agent)}.n{color:var(--muted);font-weight:400}.blurb{margin:4px 0 12px;font-size:14px}
.card{border:1px solid var(--line);border-radius:8px;padding:12px 14px;margin-top:12px;background:var(--bg);min-width:0}.card header{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px}h4{margin:0;font-size:15px}h4 span{font-weight:400}.where{margin:2px 0 0;font-size:12px;overflow-wrap:anywhere}.tags{display:flex;flex-wrap:wrap;gap:6px;align-items:flex-start}.tag{font-size:12px;border-radius:999px;padding:2px 9px;white-space:nowrap}.tag.plain{border:1px solid var(--line);color:var(--muted)}
.fault-DeveloperBug{background:var(--dev-bg);color:var(--dev)}.fault-AgentTestBug{background:var(--agent-bg);color:var(--agent)}.fault-Environment{background:var(--env-bg);color:var(--env)}.fault-TestData{background:var(--data-bg);color:var(--data)}.fault-RequirementGap{background:var(--req-bg);color:var(--req)}.fault-Undetermined{background:var(--und-bg);color:var(--und)}
.classifier{font-size:12.5px;margin:8px 0 0}dl{margin:8px 0 0}dt{font-size:12.5px;font-weight:600;color:var(--muted);margin-top:8px}dd{margin:1px 0 0}dd ul{margin:2px 0 0;padding-left:18px}code{font:12.5px ui-monospace,Consolas,monospace;overflow-wrap:anywhere}.untriaged{font-style:italic}
.alert{background:var(--env-bg);color:var(--ink);border-left:4px solid var(--env);border-radius:6px;padding:10px 14px;margin:12px 0}.alert p{margin:2px 0}.tile.warn strong{color:var(--env)}tr.failed td:first-child{border-left:3px solid var(--dev)}.scroll{overflow-x:auto}
.others{display:grid;gap:16px}details{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:10px 14px;margin-top:16px}summary{cursor:pointer;font-weight:600}table{width:100%;border-collapse:collapse;margin-top:8px;font-size:14px}th,td{text-align:left;padding:5px 8px;border-bottom:1px solid var(--line);vertical-align:top}.notes li{margin-bottom:8px}footer{margin-top:36px;color:var(--muted);font-size:13px}
</style></head><body><main>
<h1>E2E run ${esc(run.runId)}, attempt ${esc(run.attempt)}</h1>
<p class="meta">Lane ${esc(run.target?.laneId ?? '')} · ${esc(run.target?.environment ?? '')} · Playwright ${esc(run.source?.playwrightVersion ?? '')} · started ${esc(run.source?.startTime ?? '')}</p>
<p class="lead">${esc(headline)}</p>
<div class="tiles">
${tile(total, 'tests run')}${tile(counts.passed ?? 0, 'passed', 'ok')}${tile(counts.flaky ?? 0, 'passed on retry')}${tile(failedAll, 'failed')}${tile(byFault.DeveloperBug.length, 'developer bugs', 'dev')}${tile(byFault.AgentTestBug.length, 'agent test-code bugs', 'agent')}${check.unmapped ? tile(check.unmapped, 'not matched to a test ID', 'warn') : ''}${check.runErrors ? tile(check.runErrors, 'errors outside tests', 'warn') : ''}
</div>
${alerts.length ? `<div class="alert">${alerts.map(a => `<p>${esc(a)}</p>`).join('')}</div>` : ''}
${untriaged ? `<p class="untriaged">${untriaged} result(s) have no explanation yet.</p>` : ''}
<h2>Whose fault is it?</h2>
<div class="compare">${lane('DeveloperBug')}${lane('AgentTestBug')}</div>
${others.length ? `<h2>Neither the application nor the test code</h2><div class="others">${others.map(lane).join('')}</div>` : ''}
${notes ? `<h2>Things to know about this run</h2><ul class="notes">${notes}</ul>` : ''}
${unmatchedSection(run)}
${runErrorsSection(run)}
<details><summary>Passed tests (${passedClean.length})</summary>
<table><thead><tr><th>Test</th><th>Title</th><th>Project</th></tr></thead><tbody>
${passedClean.map(t => `<tr><td>${esc(t.testId)}</td><td>${esc(titles[t.testId] || '')}</td><td>${esc(t.project)}</td></tr>`).join('')}
</tbody></table></details>
<footer>Results are transcribed from the developer's Playwright report through run-${esc(run.attempt)}.json. Explanations are by ${esc(triage?.triagedBy ?? 'nobody yet')}. Generating this page ran no test, browser or application.</footer>
</main></body></html>
`;
}

function titlesFrom(file) {
  if (!file || !fs.existsSync(file)) return {};
  const catalog = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Object.fromEntries((catalog.tests || []).map(t => [t.testId, t.businessTitle || '']));
}

function main() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--strict') args.strict = true;
    else if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[++i];
  }
  const usage = m => { console.error(`${m}\nUsage: render-run-dashboard.mjs --docs-root <dir> --run-id <id> [--attempt <n>] [--root <repo>] [--catalog <file>] [--strict]`); process.exit(1); };
  if (!args['docs-root'] || !args['run-id']) usage('--docs-root and --run-id are required');
  const root = path.resolve(args.root || '.');
  const dir = path.join(root, args['docs-root'], 'runs', args['run-id']);
  const attempts = fs.existsSync(dir) ? fs.readdirSync(dir).map(f => f.match(/^run-(\d+)\.json$/)?.[1]).filter(Boolean).map(Number) : [];
  const attempt = args.attempt ? Number(args.attempt) : attempts.length ? Math.max(...attempts) : 0;
  const runFile = path.join(dir, `run-${attempt}.json`);
  if (!fs.existsSync(runFile)) usage(`no classified attempt found at ${runFile}; run record-execution.mjs classify first`);
  const run = JSON.parse(fs.readFileSync(runFile, 'utf8'));
  const triageFile = path.join(dir, `triage-${attempt}.json`);
  const triage = fs.existsSync(triageFile) ? JSON.parse(fs.readFileSync(triageFile, 'utf8')) : null;
  if (triage) {
    const problems = checkTriage(run, triage);
    if (problems.length) { console.error(`REFUSED: ${triageFile}\n  ${problems.join('\n  ')}`); process.exit(2); }
  }
  const setupFile = path.join(root, args['docs-root'], 'setup-decisions.json');
  const catalog = args.catalog || (fs.existsSync(setupFile) ? JSON.parse(fs.readFileSync(setupFile, 'utf8')).catalogPath : null);
  const titles = titlesFrom(catalog && path.resolve(root, catalog));
  const missing = buildRows(run, triage, titles).filter(r => !r.triaged);
  if (args.strict && missing.length) { console.error(`REFUSED: no triage for ${missing.map(r => r.test.testId).join(', ')}`); process.exit(2); }
  const check = reconcile(run);
  check.differences.forEach(d => console.error(`WARN counts differ from the Playwright report, ${d}`));
  if (args.strict && check.differences.length) { console.error('REFUSED: the page would not show every Playwright result'); process.exit(2); }
  if (check.unmapped || check.runErrors) console.log(`note: ${check.unmapped} result(s) not matched to a testId and ${check.runErrors} run error(s) are listed on the page`);
  const out = path.join(dir, `dashboard-${attempt}.html`);
  fs.writeFileSync(out, renderDashboard({ run, triage, titles }));
  console.log(`${path.relative(root, out).replace(/\\/g, '/')}${missing.length ? ` (${missing.length} result(s) not triaged)` : ''}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
