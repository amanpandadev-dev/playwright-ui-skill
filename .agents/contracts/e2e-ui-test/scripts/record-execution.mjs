#!/usr/bin/env node
// Execution evidence for e2e-ui-test-verify-run. A developer runs the generated specs against a local or dev lane with
// Playwright's JSON reporter; this script turns that report into a verify-run report and records it in the coverage
// manifest. It never runs Playwright, browsers or tests: it reads a report someone else produced.
//
//   node record-execution.mjs classify --root <repo> --docs-root <dir> --report <playwright.json> --run-id <id>
//        --attempt <n> --lane <laneId> [--typescript <typescript.js>] [--out <file>]
//   node record-execution.mjs record --root <repo> --docs-root <dir> --run <verify-run report>
//        [--typescript <typescript.js>] [--catalog <catalog>] [--dry-run]
//
// classify matches every Playwright result to its @e2e-meta testId (spec file and line), classifies each failure as
// Mechanical (a test bug a repair may fix), Environment, Behavioural (a possible application defect) or Unclassified,
// and writes <docs-root>/runs/<run-id>/run-<attempt>.json. That file holds no page text; error messages stay in the
// git-ignored Playwright output. Only Mechanical failures are repairable, within check-repair-diff.mjs limits.
// record refuses a stale report (a spec changed after the run), then sets executionStatus and resultReference on every
// obligation whose tests all ran, through sync-coverage.mjs. Coverage status is never changed here: execution is
// recorded separately from authored coverage.
// Exit codes: classify 0 written, 1 usage or internal error, 2 refused. record passes on sync-coverage's exit code.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parser, inspect } from './source-evidence.mjs';
import { fingerprint, findTypescript, normalizeText } from './validate-coverage.mjs';
import { validate } from './json-schema-lite.mjs';
import { reconcile } from './render-run-dashboard.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const CONTRACTS_VERSION = fs.readFileSync(path.join(here, '..', 'CONTRACTS_VERSION'), 'utf8').trim();
const SCHEMA = JSON.parse(fs.readFileSync(path.join(here, '..', 'schemas', 'verify-run-report.schema.json'), 'utf8'));
export const VERIFY = 'e2e-ui-test-verify-run';
const posix = p => p.split(path.sep).join('/').replace(/^\.\//, '');
const inside = (p, dir) => { const d = posix(dir).replace(/\/$/, ''); return p === d || p.startsWith(`${d}/`); };
const specFingerprint = text => `sha256:${fingerprint(text)}`;
const ANSI = /\u001b\[[0-9;]*m/g;
const PRODUCTION = /\bprod(?:uction)?\b/i;

// ---------------------------------------------------------------- failure classification
// Ordered: an environment problem explains everything after it (a 403 on seeding also leaves elements missing), and a
// locator that never resolves is a test bug before it is a wrong value.
const RULES = [
  ['Environment', 'target-unreachable', /net::ERR_(?:CONNECTION_REFUSED|CONNECTION_RESET|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|TIMED_OUT|ADDRESS_UNREACHABLE|CERT_\w+|SSL_\w+)|\b(?:ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT)\b/],
  ['Environment', 'browser-unavailable', /browserType\.launch|Executable doesn't exist|Target page, context or browser has been closed/],
  ['Environment', 'auth-state-missing', /storageState|ENOENT[^\n]*(?:auth|\.json)/i],
  ['Environment', 'auth-rejected', /\b(?:401|403)\b[^\n]*\b(?:Unauthorized|Forbidden)\b|\b(?:Unauthorized|Forbidden)\b[^\n]*\b(?:401|403)\b|status(?: code)?:?\s*(?:401|403)\b/i],
  ['Environment', 'api-request-failed', /apiRequestContext\.\w+:/],
  ['Environment', 'environment-contract', /environment contract|\bE2E_[A-Z0-9_]+\b[^\n]*(?:missing|required|invalid)/i],
  ['Mechanical', 'strict-mode-violation', /strict mode violation/],
  ['Mechanical', 'element-detached', /not attached to the DOM|detached from the DOM|Element is not attached/i],
  ['Mechanical', 'not-actionable', /intercepts pointer events|outside of the viewport/],
  ['Mechanical', 'assertion-locator-unresolved', /element\(s\) not found/],
  ['Mechanical', 'locator-timeout', /(?:locator|page|frame|frameLocator)\.\w+: Timeout \d+ms exceeded/],
  ['Behavioural', 'assertion-mismatch', /expect\([^)]*\)[\w.]*\.(?:not\.)?(?:to\w+)\(|\bExpected\b[\s\S]*\bReceived\b/],
  ['Unclassified', 'test-timeout', /Test timeout of \d+ms exceeded/],
];
const RANK = { Environment: 0, Mechanical: 1, Behavioural: 2, Unclassified: 3 };

// errors: Playwright result errors ({message, location}). protectedDirs: fixture and synthetic-data directories, whose
// failures are environment or seeding problems rather than test bugs.
export function classifyFailure(errors, { protectedDirs = [], root = '.' } = {}) {
  let best = null;
  for (const error of errors || []) {
    const message = String(error.message || error.value || '').replace(ANSI, '');
    const file = error.location?.file ? posix(path.isAbsolute(error.location.file) ? path.relative(root, error.location.file) : error.location.file) : null;
    let found = RULES.find(([, , pattern]) => pattern.test(message));
    if (file && protectedDirs.some(d => inside(file, d)) && (!found || found[0] !== 'Environment')) found = ['Environment', 'fixture-or-seed-failure'];
    const [cls, reason] = found || ['Unclassified', 'unrecognised'];
    const failure = { class: cls, reason, repairable: cls === 'Mechanical' };
    // Test-authored text only: the locator and matcher the test used, and where it failed. Never received values.
    const locator = message.match(/^\s*(?:-\s*)?waiting for ((?:getBy\w+|locator|frameLocator)\(.*\))\s*$/m)?.[1] || message.match(/^Locator: (.+)$/m)?.[1];
    const matcher = message.match(/expect\([^)]*\)((?:\.not)?\.to\w+)\(/)?.[1];
    if (locator) failure.locator = locator.trim();
    if (matcher) failure.matcher = matcher.replace(/^\./, '');
    if (file) failure.location = `${file}:${error.location.line}`;
    if (!best || RANK[cls] < RANK[best.class]) best = failure;
  }
  return best || { class: 'Unclassified', reason: 'unrecognised', repairable: false };
}

// ---------------------------------------------------------------- parameterized cases
// Identifiers live in metadata, never only in titles, so a parameterized title need not carry its testId. A case is
// matched by the part of its testId that differs between the cases (US001-J03-cxo gives cxo) against the part of the
// title that differs between the loop's results at the same line ("... order (cxo)"). A filtered run that holds one
// result of the loop falls back to the title's last parenthesised group, then to a whole word of the title.
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const WORD = /[A-Za-z0-9_-]/;
function commonPrefix(list) {
  let prefix = list[0] || '';
  for (const s of list) while (!s.startsWith(prefix)) prefix = prefix.slice(0, -1);
  return prefix;
}
const reversed = s => [...s].reverse().join('');
function varyingPart(title, siblings) {
  const distinct = [...new Set(siblings)];
  if (distinct.length < 2 || !distinct.includes(title)) return null;
  let start = commonPrefix(distinct).length;
  let end = Math.max(start, title.length - commonPrefix(distinct.map(reversed)).length);
  while (start > 0 && WORD.test(title[start - 1])) start--;
  while (end < title.length && WORD.test(title[end])) end++;
  return slug(title.slice(start, end)) || null;
}

/** The one record among the parameterized cases at a line that a result title belongs to, or why there is none. */
export function matchCase(candidates, title = '', siblings = []) {
  const unique = (list, matchedBy) => (list.length === 1 ? { record: list[0], matchedBy } : null);
  const byId = unique(candidates.filter(r => title.includes(r.testId)), 'testId in title');
  if (byId) return byId;
  const prefix = commonPrefix(candidates.map(r => r.testId));
  const cut = prefix.slice(0, prefix.lastIndexOf('-') + 1);
  const keyed = candidates.map(r => ({ r, key: slug(r.testId.slice(cut.length)) })).filter(c => c.key);
  const fits = (part, key) => part === key || part.endsWith(`-${key}`) || key.endsWith(`-${part}`) || key.startsWith(`${part}-`);
  const varying = varyingPart(title, siblings);
  const byVarying = varying && unique(keyed.filter(c => fits(varying, c.key)).map(c => c.r), 'case value in title');
  if (byVarying) return byVarying;
  const group = slug(title.match(/\(([^()]*)\)\s*$/)?.[1] || '');
  const byGroup = group && unique(keyed.filter(c => fits(group, c.key)).map(c => c.r), 'case value in title');
  if (byGroup) return byGroup;
  const words = `-${slug(title)}-`;
  const byWord = unique(keyed.filter(c => words.includes(`-${c.key}-`)).map(c => c.r), 'case value in title');
  if (byWord) return byWord;
  return { reason: `${candidates.length} parameterized cases share this line and the title matches none of them uniquely; put the case value (${keyed.map(c => c.key).join(', ')}) or the testId in the title` };
}

// ---------------------------------------------------------------- Playwright report
function* specsOf(suite) {
  for (const spec of suite.specs || []) yield spec;
  for (const child of suite.suites || []) yield* specsOf(child);
}

function outcomeOf(test) {
  const last = test.results?.at(-1);
  if (test.status === 'flaky') return 'Flaky';
  if (test.status === 'unexpected') return 'Failed';
  if (test.status === 'skipped' || last?.status === 'skipped' || !last) return 'Skipped';
  return 'Passed';
}

export function buildRunReport({ ts, root, report, testDir, protectedDirs = [], runId, attempt, lane, reportPath }) {
  const tests = [], unmapped = [], specs = new Map(), records = new Map();
  const recordsOf = rel => {
    if (!records.has(rel)) records.set(rel, inspect(ts, path.join(root, rel)).records);
    return records.get(rel);
  };
  // Every result keeps its outcome, matched or not, so the dashboard can show what the console showed.
  const resultOf = test => {
    const result = { project: test.projectName || '', outcome: outcomeOf(test), retries: Math.max(0, (test.results?.length || 1) - 1) };
    if (result.outcome === 'Failed') result.failure = classifyFailure(test.results.at(-1)?.errors || [test.results.at(-1)?.error].filter(Boolean), { protectedDirs, root });
    return result;
  };
  const all = report.suites?.flatMap(suite => [...specsOf(suite)]) || [];
  const titlesAt = new Map();
  for (const spec of all) {
    const key = `${spec.file}:${spec.line}`;
    titlesAt.set(key, [...(titlesAt.get(key) || []), spec.title || '']);
  }
  for (const spec of all) {
    const rel = [path.posix.join(posix(testDir), posix(spec.file)), posix(spec.file)].find(p => fs.existsSync(path.join(root, p)));
    const where = { file: posix(spec.file || '(unknown)'), line: spec.line ?? 0, title: spec.title || '' };
    const miss = reason => {
      if (!spec.tests?.length) unmapped.push({ ...where, reason });
      for (const test of spec.tests || []) unmapped.push({ ...where, reason, ...resultOf(test) });
    };
    if (!rel) { miss(`spec file not found under ${testDir}`); continue; }
    let candidates;
    try { candidates = recordsOf(rel).filter(r => r.line === spec.line); } catch (error) { miss(error.message); continue; }
    if (!candidates.length) { miss('no @e2e-meta test declared at this line'); continue; }
    let record = candidates[0];
    if (candidates.length > 1) {
      const match = matchCase(candidates, spec.title || '', titlesAt.get(`${spec.file}:${spec.line}`));
      if (!match.record) { miss(match.reason); continue; }
      record = match.record;
    }
    specs.set(rel, specFingerprint(fs.readFileSync(path.join(root, rel), 'utf8')));
    for (const test of spec.tests || []) tests.push({ testId: record.testId, specPath: rel, ...resultOf(test) });
  }
  const count = outcome => tests.filter(t => t.outcome === outcome).length;
  const byClass = {};
  for (const t of tests) if (t.failure) byClass[t.failure.class] = (byClass[t.failure.class] || 0) + 1;
  const stats = report.stats || {};
  return {
    schemaVersion: '1.0', contractsVersion: CONTRACTS_VERSION, runId, attempt,
    source: { playwrightReport: reportPath, playwrightVersion: report.config?.version ?? null, startTime: report.stats?.startTime ?? null },
    target: { laneId: lane.laneId, target: lane.target, environment: lane.environment },
    specs: [...specs].sort().map(([p, f]) => ({ path: p, fingerprint: f })),
    tests, counts: { passed: count('Passed'), failed: count('Failed'), skipped: count('Skipped'), flaky: count('Flaky'), byClass }, unmapped,
    // Playwright's own totals, so the dashboard can prove it lost nothing, and errors raised outside any test (a spec
    // that fails to load, a global setup that throws). Classified like test failures; the messages stay in the report.
    ...(typeof stats.expected === 'number' ? { playwrightTotals: { passed: stats.expected, failed: stats.unexpected ?? 0, flaky: stats.flaky ?? 0, skipped: stats.skipped ?? 0 } } : {}),
    runErrors: (report.errors || []).map(error => classifyFailure([error], { protectedDirs, root })),
  };
}

// ---------------------------------------------------------------- manifest patch
// An obligation gets an execution result only when every one of its tests ran in this report.
export function executionPatch(manifest, run, resultReference) {
  const obligations = [], skipped = [];
  for (const o of manifest.obligations) {
    if (!o.testIds?.length || o.coverageStatus === 'Planned') continue;
    const rows = o.testIds.map(id => [id, run.tests.filter(t => t.testId === id)]);
    const missing = rows.filter(([, r]) => !r.length).map(([id]) => id);
    if (missing.length) { skipped.push({ obligationId: o.obligationId, reason: `not in this run: ${missing.join(', ')}` }); continue; }
    const all = rows.flatMap(([, r]) => r);
    const executionStatus = all.some(t => t.outcome === 'Failed') ? 'Failed' : all.every(t => t.outcome === 'Skipped') ? 'Skipped' : 'Passed';
    obligations.push({ obligationId: o.obligationId, set: { executionStatus, resultReference } });
  }
  return { patch: { obligations }, skipped };
}

// ---------------------------------------------------------------- CLI
function loadSetup(root, docsRoot) {
  const file = path.join(root, docsRoot, 'setup-decisions.json');
  if (!fs.existsSync(file)) throw new Error(`setup-decisions.json not found under ${docsRoot}`);
  const setup = JSON.parse(normalizeText(fs.readFileSync(file, 'utf8')));
  const protectedDirs = new Set();
  for (const lane of setup.lanes || []) if (lane.fixtureEntryPoint) protectedDirs.add(path.posix.dirname(posix(lane.fixtureEntryPoint)));
  const collect = value => {
    if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) k === 'dataModule' && typeof v === 'string' ? protectedDirs.add(posix(v)) : collect(v);
  };
  collect(setup);
  return { setup, protectedDirs: [...protectedDirs].filter(d => d && d !== '.') };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  const args = {};
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i].replace(/^--/, '');
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true; else { args[key] = next; i++; }
  }
  const usage = message => { console.error(`record-execution: ${message}`); process.exit(1); };
  const refuse = message => { console.log(`REFUSED ${message}`); console.log('Nothing was written.'); process.exit(2); };
  try {
    for (const key of ['root', 'docs-root']) if (!args[key]) usage(`--${key} is required`);
    const root = path.resolve(args.root);
    const docsRoot = posix(path.relative(root, path.resolve(root, args['docs-root'])));
    const rel = file => posix(path.relative(root, file));
    const ignoredOrOutside = file => {
      const r = path.relative(root, file);
      // check-ignore exits 1 only for "not ignored"; outside a git work tree there is no version control to keep it out of.
      return r.startsWith('..') || path.isAbsolute(r) || spawnSync('git', ['-C', root, 'check-ignore', '-q', '--', posix(r)]).status !== 1;
    };
    const { setup, protectedDirs } = loadSetup(root, docsRoot);
    const typescript = args.typescript ? path.resolve(args.typescript) : findTypescript(root, setup);

    if (command === 'classify') {
      for (const key of ['report', 'run-id', 'attempt', 'lane']) if (!args[key]) usage(`--${key} is required`);
      if (!/^[A-Za-z0-9._-]+$/.test(args['run-id'])) usage('--run-id may contain only letters, digits, dot, underscore and hyphen');
      const attempt = Number(args.attempt);
      if (!Number.isInteger(attempt) || attempt < 1) usage('--attempt must be a positive integer');
      const lane = (setup.lanes || []).find(l => l.laneId === args.lane);
      if (!lane) usage(`lane ${args.lane} is not in setup-decisions.json (${(setup.lanes || []).map(l => l.laneId).join(', ') || 'none'})`);
      if (PRODUCTION.test(lane.environment || '') || PRODUCTION.test(lane.laneId)) refuse(`lane ${lane.laneId} (${lane.environment}) looks like production; verify runs use local or dev lanes only`);
      const reportFile = path.resolve(args.report);
      if (!fs.existsSync(reportFile)) usage(`Playwright report ${args.report} not found`);
      if (!ignoredOrOutside(reportFile)) refuse(`${rel(reportFile)} is inside the repository and not git-ignored; Playwright output can hold page text and stays out of version control`);
      if (!typescript) usage('no TypeScript parser found under the owning package or the repository root; pass --typescript');
      const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
      if (!Array.isArray(report.suites)) usage(`${args.report} is not a Playwright JSON report (run with --reporter=json)`);
      const run = buildRunReport({ ts: parser(root, typescript), root, report, testDir: setup.testDir, protectedDirs, runId: args['run-id'], attempt, lane,
        reportPath: ignoredOrOutside(reportFile) && !path.relative(root, reportFile).startsWith('..') ? rel(reportFile) : path.basename(reportFile) });
      const errors = validate(SCHEMA, run);
      if (errors.length) throw new Error(`run report does not match its schema: ${errors.slice(0, 5).join('; ')}`);
      const out = path.resolve(root, args.out && args.out !== true ? args.out : path.posix.join(docsRoot, 'runs', args['run-id'], `run-${attempt}.json`));
      if (fs.existsSync(out)) refuse(`${rel(out)} already exists; run reports are never overwritten, use the next --attempt`);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, `${JSON.stringify(run, null, 2)}\n`);
      const c = run.counts;
      console.log(`Run ${run.runId} attempt ${attempt} on ${lane.laneId}: ${c.passed} passed, ${c.failed} failed, ${c.flaky} flaky, ${c.skipped} skipped`);
      for (const t of run.tests.filter(t => t.failure)) {
        const f = t.failure;
        console.log(`  ${f.repairable ? 'REPAIR' : 'BLOCK '} ${t.testId} [${t.project}] ${f.class}/${f.reason}${f.locator ? ` ${f.locator}` : ''}${f.location ? ` at ${f.location}` : ''}`);
      }
      run.unmapped.forEach(u => console.log(`  UNMAPPED ${u.outcome ? `${u.outcome} ` : ''}${u.file}:${u.line} "${u.title}": ${u.reason}`));
      run.runErrors.forEach(f => console.log(`  RUN ERROR ${f.class}/${f.reason}${f.location ? ` at ${f.location}` : ''}`));
      const check = reconcile(run);
      const t = run.playwrightTotals;
      if (t) console.log(`Playwright reported ${t.passed + t.failed + t.flaky + t.skipped} test(s) and ${run.runErrors.length} run error(s): ${run.tests.length} matched, ${run.unmapped.length} not matched to a testId`);
      check.differences.forEach(d => console.log(`  WARN count differs, ${d}`));
      console.log(`Written: ${rel(out)}`);
    } else if (command === 'record') {
      if (!args.run) usage('--run <verify-run report> is required');
      const runFile = path.resolve(root, args.run);
      const run = JSON.parse(fs.readFileSync(runFile, 'utf8'));
      const errors = validate(SCHEMA, run);
      if (errors.length) refuse(`${rel(runFile)} is not a valid verify-run report: ${errors.slice(0, 5).join('; ')}`);
      if (!inside(rel(runFile), path.posix.join(docsRoot, 'runs'))) refuse(`${rel(runFile)} is outside ${docsRoot}/runs; resultReference must point at a committed run report`);
      const stale = run.specs.filter(s => !fs.existsSync(path.join(root, s.path)) || specFingerprint(fs.readFileSync(path.join(root, s.path), 'utf8')) !== s.fingerprint);
      if (stale.length) refuse(`spec(s) changed after the run, so its results no longer describe them: ${stale.map(s => s.path).join(', ')}; run them again and classify a new attempt`);
      if (run.unmapped.length) console.log(`note: ${run.unmapped.length} unmapped Playwright test(s) are not recorded`);
      const manifest = JSON.parse(normalizeText(fs.readFileSync(path.join(root, docsRoot, 'coverage-manifest.json'), 'utf8')));
      const { patch, skipped } = executionPatch(manifest, run, rel(runFile));
      skipped.forEach(s => console.log(`skip ${s.obligationId}: ${s.reason}`));
      const patchFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-exec-')), 'execution-patch.json');
      fs.writeFileSync(patchFile, `${JSON.stringify(patch, null, 2)}\n`);
      const sync = spawnSync(process.execPath, [path.join(here, 'sync-coverage.mjs'), '--skill', VERIFY, '--root', root, '--docs-root', docsRoot, '--patch', patchFile,
        ...(typescript ? ['--typescript', typescript] : []), ...(typeof args.catalog === 'string' ? ['--catalog', args.catalog] : []), ...(args['dry-run'] ? ['--dry-run'] : [])],
      { encoding: 'utf8' });
      process.stdout.write(sync.stdout || '');
      process.stderr.write(sync.stderr || '');
      process.exitCode = sync.status ?? 1;
    } else usage('command must be classify or record');
  } catch (error) { console.error(`record-execution: ${error.message}`); process.exitCode = 1; }
}
