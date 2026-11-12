#!/usr/bin/env node
// Next step of the E2E pipeline, decided only from the hand-off files, the entry gates and the latest evaluation
// report. Used by e2e-ui-test-orchestrator. Static only: reads files and runs check-gates.mjs; never runs tests.
//
//   node pipeline-status.mjs --root <repo> --docs-root <dir> [--catalog <catalog>] [--verify] [--json]
//
// Steps: setup, plan, gate-a (human approval), author, run-specs (a developer runs Playwright) and verify (both only
// with --verify or once <docs-root>/runs/ exists), evaluate, route-findings, human-review, done.
// Exit codes: 0 status printed, 1 usage or internal error.
import fs from 'node:fs';
import { checkTriage } from './render-run-dashboard.mjs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fingerprint, normalizeText } from './validate-coverage.mjs';
import { validate } from './json-schema-lite.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ORDER = ['e2e-ui-test-env-setup', 'e2e-ui-test-plan-generator', 'e2e-ui-test-generator', 'e2e-ui-test-verify-run'];
const JUDGE_PENDING = new Set(['judge_not_run', 'judge_incomplete', 'rederivation_not_run']);
// Two repair rounds: repairs after attempts 1 and 2, so attempt 3 is the last.
const MAX_ATTEMPTS = 3;

// Failures the classifier calls repairable but a valid triage says are not test-code bugs. Nothing is left to repair
// for these: the element is not on the page. An invalid triage overrules nothing.
function overruledByTriage(dir, attempt, report) {
  const file = path.join(dir, `triage-${attempt}.json`);
  if (!fs.existsSync(file)) return new Set();
  let triage;
  try { triage = JSON.parse(normalizeText(fs.readFileSync(file, 'utf8'))); } catch { return new Set(); }
  if (checkTriage(report, triage).length) return new Set();
  return new Set(triage.items.filter(i => i.classifierDisagreement && i.fault !== 'AgentTestBug').map(i => i.testId));
}

// The verify-run state, from files only. Run IDs are timestamps (YYYYMMDD-HHmm), so the latest sorts last. Raw
// Playwright reports are runs/<id>/playwright/report-<n>.json; classified reports are runs/<id>/run-<n>.json.
export function verifyState({ root, docsAbs, manifest }) {
  const runsDir = path.join(docsAbs, 'runs');
  const posix = p => path.relative(root, p).split(path.sep).join('/');
  const ids = fs.existsSync(runsDir) ? fs.readdirSync(runsDir).filter(d => fs.statSync(path.join(runsDir, d)).isDirectory()).sort() : [];
  if (!ids.length) return { phase: 'no-run' };
  const runId = ids.at(-1);
  const dir = path.join(runsDir, runId);
  const attempts = file => (fs.existsSync(file) ? fs.readdirSync(file) : []).map(f => f.match(/^(?:run|report)-(\d+)\.json$/)).filter(Boolean).map(m => Number(m[1]));
  const raw = attempts(path.join(dir, 'playwright'));
  const classified = attempts(dir);
  const latestRaw = raw.length ? Math.max(...raw) : 0;
  const latest = classified.length ? Math.max(...classified) : 0;
  if (latestRaw > latest) return { phase: 'classify', runId, attempt: latestRaw };
  if (!latest) return { phase: 'no-run', runId };
  const reportFile = path.join(dir, `run-${latest}.json`);
  let report;
  try { report = JSON.parse(normalizeText(fs.readFileSync(reportFile, 'utf8'))); } catch { return { phase: 'invalid', runId, attempt: latest, file: posix(reportFile) }; }
  const fresh = (report.specs || []).every(s => {
    const file = path.resolve(root, s.path);
    return fs.existsSync(file) && `sha256:${fingerprint(fs.readFileSync(file, 'utf8'))}` === s.fingerprint;
  });
  if (!fresh) return { phase: 'rerun', runId, attempt: latest + 1, reason: 'specs changed after attempt ' + latest };
  const overruled = overruledByTriage(dir, latest, report);
  const repairable = (report.tests || []).filter(t => t.failure?.repairable && !overruled.has(t.testId)).length;
  if (repairable && latest < MAX_ATTEMPTS) return { phase: 'repair', runId, attempt: latest, repairable };
  const recorded = manifest.obligations.some(o => o.resultReference === posix(reportFile));
  if (!recorded) return { phase: 'record', runId, attempt: latest, file: posix(reportFile) };
  // A recorded attempt is not finished until a person can read it: a dashboard always, and a triage when any test did
  // not simply pass, or any result was not matched to a testId, or Playwright raised errors outside any test
  // (render-run-dashboard.mjs and references/run-dashboard.md).
  const needsTriage = (report.tests || []).some(t => t.outcome !== 'Passed') || (report.unmapped || []).length > 0 || (report.runErrors || []).length > 0;
  const missing = [...(fs.existsSync(path.join(dir, `dashboard-${latest}.html`)) ? [] : [`dashboard-${latest}.html`]),
    ...(needsTriage && !fs.existsSync(path.join(dir, `triage-${latest}.json`)) ? [`triage-${latest}.json`] : [])];
  if (missing.length) return { phase: 'explain', runId, attempt: latest, missing };
  return { phase: 'recorded', runId, attempt: latest, file: posix(reportFile), counts: report.counts };
}

export function pipelineStatus({ root, docsRoot, catalog, verify = false }) {
  const abs = rel => path.resolve(root, rel);
  const docsAbs = abs(docsRoot);
  const posix = p => path.relative(root, p).split(path.sep).join('/');
  const readJson = file => { try { return JSON.parse(normalizeText(fs.readFileSync(file, 'utf8'))); } catch { return undefined; } };
  const gate = skill => {
    const run = spawnSync(process.execPath, [path.join(here, 'check-gates.mjs'), '--skill', skill, '--docs-root', docsAbs, '--root', root], { encoding: 'utf8' });
    return { status: run.status, refusals: run.stdout.split(/\r?\n/).filter(l => l.startsWith('REFUSED')).map(l => l.replace(/^REFUSED \([^)]*\): /, '')) };
  };
  const commands = {
    gates: skill => `node .agents/contracts/e2e-ui-test/scripts/check-gates.mjs --skill ${skill} --docs-root ${docsRoot}`,
    validate: `node .agents/contracts/e2e-ui-test/scripts/validate-all.mjs --docs-root ${docsRoot}`,
    fingerprints: `node .agents/contracts/e2e-ui-test/scripts/check-gates.mjs --print-fingerprints --docs-root ${docsRoot}`,
  };
  const state = { setupDecisions: false, manifest: null, reviewStatus: null, obligations: 0, planned: 0, testScopeRecord: false,
    testsEvaluations: 0, latestEvaluation: null, verify: null };
  const result = (step, skill, reason, extra = {}) => ({ step, skill, humanCheckpoint: skill === null && step !== 'done', reason, state, ...extra });

  // 1. Setup decisions and the plan generator's entry gate.
  state.setupDecisions = fs.existsSync(path.join(docsAbs, 'setup-decisions.json'));
  const planGate = gate('e2e-ui-test-plan-generator');
  if (planGate.status === 2) {
    return result('setup', 'e2e-ui-test-env-setup', planGate.refusals.join(' '), { next: commands.gates('e2e-ui-test-env-setup'),
      operation: state.setupDecisions ? 'reconfigure' : 'new setup, or "Record existing setup" when Playwright already exists' });
  }
  if (planGate.status !== 0) throw new Error(`check-gates failed for e2e-ui-test-plan-generator (exit ${planGate.status})`);
  const setup = readJson(path.join(docsAbs, 'setup-decisions.json'));

  // 2. Coverage manifest.
  const manifestFile = path.join(docsAbs, 'coverage-manifest.json');
  if (!fs.existsSync(manifestFile)) {
    const hasCoverage = ['coverage-ledger.md', 'gap-register.md', 'plans'].some(f => fs.existsSync(path.join(docsAbs, f)));
    return result('plan', 'e2e-ui-test-plan-generator', 'No coverage manifest exists for this docs root.', { next: commands.gates('e2e-ui-test-plan-generator'),
      scopeHint: hasCoverage ? 'adopt-existing (plans or a ledger already exist)' : 'setup-initial, incremental or full-sweep with exact story IDs and authority' });
  }
  const manifest = readJson(manifestFile);
  const schema = JSON.parse(fs.readFileSync(path.join(here, '..', 'schemas', 'coverage-manifest.schema.json'), 'utf8'));
  if (!manifest || validate(schema, manifest).length) {
    return result('plan', 'e2e-ui-test-plan-generator', 'coverage-manifest.json is not valid JSON or does not match its schema; regenerate the plan.', { next: commands.gates('e2e-ui-test-plan-generator') });
  }
  state.manifest = posix(manifestFile);
  state.obligations = manifest.obligations.length;
  state.planned = manifest.obligations.filter(o => o.coverageStatus === 'Planned').length;
  state.reviewStatus = manifest.review?.status ?? null;

  // 3. Gate A.
  if (!manifest.review) return result('plan', 'e2e-ui-test-plan-generator', 'The manifest has no review gate (schema 1.0); re-plan to schema 1.1.');
  if (manifest.review.status === 'Draft') {
    return result('gate-a', null, 'The plan is Draft: a person reviews the plans, ledger and gap register, then records the approval.', {
      next: commands.fingerprints,
      optional: `node .agents/contracts/e2e-ui-test/scripts/evaluate.mjs report --stage plan --root . --docs-root ${docsRoot} --typescript <typescript.js>` });
  }
  if (['ChangesRequested', 'Superseded'].includes(manifest.review.status)) {
    return result('plan', 'e2e-ui-test-plan-generator', `The plan is ${manifest.review.status}${manifest.review.notes ? `: ${manifest.review.notes}` : ''}.`, { next: commands.gates('e2e-ui-test-plan-generator') });
  }

  // 4. The test generator's entry gate.
  const testGate = gate('e2e-ui-test-generator');
  if (testGate.status === 2) {
    const text = testGate.refusals.join(' ');
    if (/Plan changed after approval/.test(text)) return result('gate-a', null, `${text} Re-approve if the change is intended; otherwise re-plan.`, { next: commands.fingerprints });
    if (/ignored by git|setup-decisions\.json/.test(text)) return result('setup', 'e2e-ui-test-env-setup', text, { next: commands.gates('e2e-ui-test-env-setup') });
    return result('plan', 'e2e-ui-test-plan-generator', text, { next: commands.gates('e2e-ui-test-plan-generator'),
      scopeHint: /Source spec changed/.test(text) ? 'replacement, naming the affected plans or journeys' : undefined });
  }

  // 5. Authoring.
  const scopeDir = path.join(docsAbs, 'scope');
  state.testScopeRecord = fs.existsSync(scopeDir) && fs.readdirSync(scopeDir).some(f => /^test-.*\.json$/.test(f));
  if (state.planned > 0 || !state.testScopeRecord) {
    return result('author', 'e2e-ui-test-generator', state.planned > 0
      ? `${state.planned} obligation(s) are still Planned.` : 'The test generator has not recorded an authoring run (scope record) for this docs root.',
    { next: commands.gates('e2e-ui-test-generator') });
  }

  // 6. Optional verify run: a developer runs the specs, verify-run classifies, repairs and records the results.
  if (verify || fs.existsSync(path.join(docsAbs, 'runs'))) {
    const v = verifyState({ root, docsAbs, manifest });
    state.verify = v;
    const verifyGate = commands.gates('e2e-ui-test-verify-run');
    const runHint = (runId, attempt) => `Developer runs the new specs against a local or dev lane with PLAYWRIGHT_JSON_OUTPUT_NAME=${docsRoot}/runs/${runId}/playwright/report-${attempt}.json npx playwright test <specs> --reporter=json --retries=1 --trace=retain-on-failure --output=${docsRoot}/runs/${runId}/playwright/artifacts-${attempt}`;
    if (v.phase === 'no-run') {
      return result('run-specs', null, 'No verify run exists yet: a developer runs the generated specs once against a local or dev lane.',
        { next: verifyGate, runCommand: runHint(v.runId || '<YYYYMMDD-HHmm>', 1) });
    }
    if (v.phase === 'rerun') {
      return result('run-specs', null, `Repaired specs need a new run (${v.reason}): a developer runs attempt ${v.attempt} of run ${v.runId}.`,
        { runCommand: runHint(v.runId, v.attempt) });
    }
    if (v.phase === 'invalid') return result('verify', 'e2e-ui-test-verify-run', `${v.file} is not readable JSON; classify the attempt again.`, { next: verifyGate });
    if (v.phase !== 'recorded') {
      const what = { classify: `classify attempt ${v.attempt} of run ${v.runId}`, repair: `repair ${v.repairable} mechanical failure(s) from attempt ${v.attempt} of run ${v.runId}`,
        record: `record the results of ${v.file} in the manifest`,
        explain: `explain attempt ${v.attempt} of run ${v.runId}: write ${v.missing?.join(' and ')} (references/run-dashboard.md)` }[v.phase];
      return result('verify', 'e2e-ui-test-verify-run', `Verify run in progress: ${what}.`, { next: verifyGate });
    }
  }

  // 7. Evaluation.
  const evalDir = path.join(docsAbs, 'evaluations');
  const order = name => { const m = name.match(/^evaluation-tests-(\d{8}-\d{4})(?:-(\d+))?\.json$/); return m ? `${m[1]}-${String(m[2] || 1).padStart(4, '0')}` : null; };
  const reports = fs.existsSync(evalDir) ? fs.readdirSync(evalDir).filter(order).sort((a, b) => order(a).localeCompare(order(b))) : [];
  state.testsEvaluations = reports.length;
  const catalogPath = catalog || setup?.catalogPath || path.posix.join(setup?.testDir || 'tests/e2e', 'test-catalog.json');
  const evaluateNext = `node .agents/contracts/e2e-ui-test/scripts/evaluate.mjs prepare-judge --root . --docs-root ${docsRoot} --catalog ${catalogPath} --typescript <typescript.js>`;
  if (!reports.length) return result('evaluate', 'e2e-ui-test-coverage-evaluator', 'The tests stage has not been evaluated.', { next: evaluateNext });
  const latestFile = path.join(evalDir, reports.at(-1));
  const report = readJson(latestFile);
  state.latestEvaluation = { file: posix(latestFile), verdict: report?.verdict ?? null };
  const stale = !report || Object.entries(report.inputs || {}).some(([, ref]) => {
    const file = abs(ref.path);
    return !fs.existsSync(file) || fingerprint(fs.readFileSync(file, 'utf8')) !== ref.fingerprint;
  });
  if (stale) {
    state.latestEvaluation.stale = true;
    return result('evaluate', 'e2e-ui-test-coverage-evaluator', 'The manifest, inventory, setup decisions or catalog changed after the latest evaluation.', { next: evaluateNext });
  }
  const findings = report.findings || [];
  const byRoute = {};
  for (const f of findings) (byRoute[f.routeTo] ||= []).push(`${f.findingId} ${f.type}: ${f.description}`);

  if (report.verdict === 'FAIL') {
    const owner = SKILL_ORDER.find(s => byRoute[s]);
    if (!owner) return result('human-review', null, 'The verdict is FAIL with findings only a person can resolve.', { findingsByRoute: byRoute });
    return result('route-findings', owner, `The verdict is FAIL. Upstream owners go first: fix ${owner}'s findings, then re-evaluate.`, { findingsByRoute: byRoute, next: commands.gates(owner) });
  }
  if (report.verdict === 'REVIEW') {
    if (findings.some(f => JUDGE_PENDING.has(f.type))) {
      return result('evaluate', 'e2e-ui-test-coverage-evaluator', 'The verdict is REVIEW because judge samples are missing or incomplete: collect them and report again.', { findingsByRoute: byRoute, next: evaluateNext });
    }
    return result('human-review', null, 'The verdict is REVIEW: a person decides on the flagged findings, then routes any fixes.', { findingsByRoute: byRoute });
  }
  return result('done', null, 'The tests stage passed evaluation. Developers can now run the suite; execution stays outside the skills.', { findingsByRoute: byRoute });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const key = process.argv[i].replace(/^--/, '');
    const next = process.argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true; else { args[key] = next; i++; }
  }
  try {
    if (!args['docs-root']) throw new Error('--docs-root is required');
    const root = path.resolve(args.root || process.cwd());
    const docsRoot = path.relative(root, path.resolve(root, args['docs-root'])).split(path.sep).join('/');
    const status = pipelineStatus({ root, docsRoot, catalog: typeof args.catalog === 'string' ? args.catalog : undefined, verify: !!args.verify });
    if (args.json) console.log(JSON.stringify(status, null, 2));
    else {
      const s = status.state;
      console.log(`Next step: ${status.step}${status.skill ? ` -> ${status.skill}` : status.step === 'done' ? '' : ' -> human checkpoint'}`);
      console.log(`Why: ${status.reason}`);
      for (const key of ['operation', 'scopeHint', 'next', 'runCommand', 'optional']) if (status[key]) console.log(`${key === 'next' ? 'Run first' : key}: ${status[key]}`);
      for (const [route, items] of Object.entries(status.findingsByRoute || {})) { console.log(`Findings for ${route}:`); items.forEach(i => console.log(`  - ${i}`)); }
      console.log(`State: setup-decisions ${s.setupDecisions ? 'present' : 'missing'}; manifest ${s.manifest ? `${s.reviewStatus}, ${s.obligations} obligations, ${s.planned} Planned` : 'missing'}; test scope record ${s.testScopeRecord ? 'present' : 'missing'}; verify ${s.verify ? `${s.verify.phase}${s.verify.runId ? ` (run ${s.verify.runId})` : ''}` : 'off'}; tests evaluations ${s.testsEvaluations}${s.latestEvaluation ? `, latest ${s.latestEvaluation.verdict}${s.latestEvaluation.stale ? ' (stale)' : ''}` : ''}`);
    }
  } catch (error) { console.error(`pipeline-status: ${error.message}`); process.exitCode = 1; }
}
