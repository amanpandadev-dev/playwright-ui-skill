#!/usr/bin/env node
// Entry gates for the E2E skills.
// Static only: reads JSON and Markdown, computes fingerprints, never imports or executes tests.
//
//   node check-gates.mjs --skill <e2e-ui-test-env-setup|e2e-ui-test-plan-generator|e2e-ui-test-generator|e2e-ui-test-verify-run|e2e-ui-test-coverage-evaluator>
//                        --docs-root <dir> [--root <repo>] [--stage plan|tests] [--catalog <file>]
//   node check-gates.mjs --print-fingerprints --docs-root <dir> [--root <repo>]
//
// Exit codes: 0 gates satisfied, 2 refused (remediation printed), 1 usage or internal error.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fingerprint, planFingerprint, normalizeText, coverageViewProblems } from './validate-coverage.mjs';
import { validate } from './json-schema-lite.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const contracts = path.resolve(here, '..');
const SKILLS = ['e2e-ui-test-env-setup', 'e2e-ui-test-plan-generator', 'e2e-ui-test-generator', 'e2e-ui-test-verify-run', 'e2e-ui-test-coverage-evaluator'];

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i].replace(/^--/, '');
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[key] = true;
  else { args[key] = next; i++; }
}
function usage(message) {
  console.error(`check-gates: ${message}`);
  process.exit(1);
}
if (!args['docs-root']) usage('--docs-root is required');
const root = path.resolve(args.root ?? process.cwd());
const docsRoot = path.resolve(root, args['docs-root']);
const setupPath = path.join(docsRoot, 'setup-decisions.json');
const manifestPath = path.join(docsRoot, 'coverage-manifest.json');
const rel = file => path.relative(root, file).split(path.sep).join('/');
const readText = file => normalizeText(fs.readFileSync(file, 'utf8'));
const readJson = file => JSON.parse(readText(file));
const schema = name => readJson(path.join(contracts, 'schemas', `${name}.schema.json`));

if (args['print-fingerprints']) {
  const manifest = readJson(manifestPath);
  const setupFile = path.resolve(root, manifest.setupDecisionsRef?.path ?? rel(setupPath));
  console.log(JSON.stringify({
    setupDecisionsRef: { path: rel(setupFile), fingerprint: fingerprint(readText(setupFile)) },
    requirementsInventoryRef: { path: manifest.requirementsInventoryRef.path, fingerprint: fingerprint(readText(path.resolve(root, manifest.requirementsInventoryRef.path))) },
    planFingerprint: planFingerprint(root, manifest),
  }, null, 2));
  process.exit(0);
}

const skill = args.skill;
if (!SKILLS.includes(skill)) usage(`--skill must be one of ${SKILLS.join(', ')}`);

const refusals = [];
const notes = [];
const refuse = message => refusals.push(message);

function requiredContracts(name) {
  const skillFile = path.resolve(contracts, '../../skills', name, 'SKILL.md');
  const match = readText(skillFile).match(/\nRequires contracts: \^(\d+)\.(\d+)\.(\d+)\s*\n/);
  if (!match) usage(`${rel(skillFile)} does not declare "Requires contracts: ^x.y.z"`);
  return match.slice(1).map(Number);
}
function satisfies(version, [major, minor, patch]) {
  const parts = String(version).split('.').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return false;
  const [a, b, c] = parts;
  return a === major && (b > minor || (b === minor && c >= patch));
}

function checkSetupDecisions(consumer) {
  if (!fs.existsSync(setupPath)) {
    refuse(`setup-decisions.json not found at ${rel(setupPath)}. Run e2e-ui-test-env-setup (use "Record existing setup" when a Playwright setup already exists).`);
    return null;
  }
  let decisions;
  try { decisions = readJson(setupPath); }
  catch { refuse(`setup-decisions.json is not valid JSON. Run e2e-ui-test-env-setup.`); return null; }
  const errors = validate(schema('setup-decisions'), decisions);
  if (errors.length) {
    refuse(`setup-decisions.json is invalid (${errors.length} error(s)). Run e2e-ui-test-env-setup.`);
    errors.forEach(e => notes.push(`  setup-decisions ${e}`));
    return null;
  }
  const range = requiredContracts(consumer);
  if (!satisfies(decisions.contractsVersion, range)) {
    refuse(`setup-decisions.json uses contracts ${decisions.contractsVersion}; ${consumer} requires ^${range.join('.')}. Run e2e-ui-test-env-setup.`);
  }
  return decisions;
}

// Handoff files must be committable: a repository-wide ignore such as Coverlet's `coverage*.json` would
// otherwise hide the approval gate. Read-only git query;
// tracked files are never reported, and a root outside a git work tree skips the check.
const HANDOFF_FILES = ['setup-decisions.json', 'requirements-inventory.json', 'coverage-manifest.json', 'coverage-ledger.md', 'gap-register.md',
  'scope/test-000000000000.json'];
function ignoredHandoffs(files) {
  const relative = files.map(f => rel(path.join(docsRoot, f)));
  if (relative.some(f => f.startsWith('..'))) return [];
  const run = spawnSync('git', ['-C', root, 'check-ignore', '--', ...relative], { encoding: 'utf8' });
  if (run.error || run.status > 1) { notes.push('Not a git work tree (or git unavailable); handoff ignore check skipped.'); return []; }
  return run.stdout.split(/\r?\n/).filter(Boolean);
}
function exceptionFor(files) {
  return files.map(f => `!${f}`).join(', ');
}
function refuseIgnoredHandoffs() {
  const ignored = ignoredHandoffs(HANDOFF_FILES);
  if (ignored.length) refuse(`Handoff file(s) ignored by git and would never be committed: ${ignored.join(', ')}. Run e2e-ui-test-env-setup to add ignore exception(s): ${exceptionFor(ignored)}.`);
}

function loadManifest() {
  if (!fs.existsSync(manifestPath)) {
    refuse(`coverage-manifest.json not found at ${rel(manifestPath)}. Run e2e-ui-test-plan-generator (scope "adopt-existing" when plans or a ledger already exist).`);
    return null;
  }
  let manifest;
  try { manifest = readJson(manifestPath); }
  catch { refuse('coverage-manifest.json is not valid JSON. Run e2e-ui-test-plan-generator.'); return null; }
  const errors = validate(schema('coverage-manifest'), manifest);
  if (errors.length) {
    refuse(`coverage-manifest.json is invalid (${errors.length} error(s)). Run e2e-ui-test-plan-generator.`);
    errors.forEach(e => notes.push(`  manifest ${e}`));
    return null;
  }
  return manifest;
}

// The plan is approved, unchanged since approval, and its sources and setup are unchanged.
function checkApprovedPlan(manifest) {
  if (manifest.schemaVersion !== '1.1') {
    refuse(`Manifest schema ${manifest.schemaVersion} has no review gate. Re-plan with e2e-ui-test-plan-generator (manifest v1.1).`);
    return;
  }
  if (manifest.review.status !== 'Approved') refuse(`Plan is \`${manifest.review.status}\`; complete Gate A review.`);
  const inventoryFile = path.resolve(root, manifest.requirementsInventoryRef.path);
  if (!fs.existsSync(inventoryFile)) { refuse(`Requirements inventory ${manifest.requirementsInventoryRef.path} not found; regenerate plan.`); return; }
  const missingPlans = manifest.artifacts.plans.filter(p => !fs.existsSync(path.resolve(root, p.path)));
  if (missingPlans.length) { refuse(`Plan file(s) missing: ${missingPlans.map(p => p.path).join(', ')}; regenerate plan.`); return; }
  for (const p of manifest.artifacts.plans) {
    const problems = coverageViewProblems(readText(path.resolve(root, p.path)));
    if (problems.length) refuse(`Plan ${p.path} has a malformed coverage-view region (${problems.join('; ')}); only e2e-ui-test-plan-generator may change plan content, followed by re-review.`);
  }
  if (manifest.review.status === 'Approved' && planFingerprint(root, manifest) !== manifest.review.planFingerprint) {
    refuse('Plan changed after approval; re-review.');
  }
  const inventory = readJson(inventoryFile);
  const stale = inventory.requirements.filter(r => {
    const source = path.resolve(root, r.sourceReference.path);
    return !fs.existsSync(source) || fingerprint(readText(source)) !== r.sourceFingerprint;
  });
  if (stale.length) refuse(`Source spec changed after approval; regenerate plan. Affected: ${[...new Set(stale.map(r => r.sourceReference.path))].join(', ')}`);
  const setupFile = path.resolve(root, manifest.setupDecisionsRef.path);
  if (!fs.existsSync(setupFile) || fingerprint(readText(setupFile)) !== manifest.setupDecisionsRef.fingerprint) {
    refuse('Setup changed after planning; re-plan.');
  }
}

switch (skill) {
  case 'e2e-ui-test-env-setup': {
    notes.push('Confirm before writing: target, authentication mode, personas (real or simulated), browser projects, agent platform (or none), test-data strategy, application ID and display name, and whether the portal workflow is wanted.');
    if (fs.existsSync(setupPath)) {
      const errors = validate(schema('setup-decisions'), readJson(setupPath));
      notes.push(errors.length
        ? `Existing ${rel(setupPath)} has ${errors.length} schema error(s); correct them in this setup operation.`
        : `Existing ${rel(setupPath)} is valid; this operation is a reconfiguration.`);
      errors.forEach(e => notes.push(`  setup-decisions ${e}`));
    }
    const ignored = ignoredHandoffs(HANDOFF_FILES);
    if (ignored.length) notes.push(`Handoff file(s) currently ignored by git: ${ignored.join(', ')}. This operation must add ignore exception(s): ${exceptionFor(ignored)}.`);
    break;
  }
  case 'e2e-ui-test-plan-generator': {
    checkSetupDecisions(skill);
    refuseIgnoredHandoffs();
    notes.push('Scope must name exact story IDs and the requirements authority. Broad phrases such as "latest changes" do not establish scope.');
    break;
  }
  case 'e2e-ui-test-generator': {
    checkSetupDecisions(skill);
    refuseIgnoredHandoffs();
    const manifest = loadManifest();
    if (!manifest) break;
    checkApprovedPlan(manifest);
    break;
  }
  case 'e2e-ui-test-verify-run': {
    checkSetupDecisions(skill);
    refuseIgnoredHandoffs();
    const manifest = loadManifest();
    if (!manifest) break;
    checkApprovedPlan(manifest);
    const scopeDir = path.join(docsRoot, 'scope');
    if (!fs.existsSync(scopeDir) || !fs.readdirSync(scopeDir).some(f => /^test-.*\.json$/.test(f))) {
      refuse('No e2e-ui-test-generator scope record under scope/; author the tests first, then verify them.');
    }
    const decisions = readJson(setupPath);
    const lanes = (decisions.lanes || []).filter(l => !/\bprod(?:uction)?\b/i.test(`${l.laneId} ${l.environment}`));
    if (!lanes.length) refuse('setup-decisions.json has no local or dev lane; verify runs never target production. Run e2e-ui-test-env-setup to add one.');
    else notes.push(`Lanes available for a verify run: ${lanes.map(l => `${l.laneId} (${l.target}, ${l.environment})`).join(', ')}.`);
    // Raw Playwright output can hold page text: it must be ignored, while the run reports beside it stay committable.
    const probe = ['runs/00000000-0000/playwright/report-1.json', 'runs/00000000-0000/run-1.json'];
    const ignored = ignoredHandoffs(probe);
    const raw = rel(path.join(docsRoot, probe[0])), report = rel(path.join(docsRoot, probe[1]));
    if (!ignored.includes(raw) && !notes.some(n => n.startsWith('Not a git work tree'))) refuse(`Raw Playwright output under ${rel(path.join(docsRoot, 'runs'))}/*/playwright/ is not git-ignored. Run e2e-ui-test-env-setup to add that ignore rule.`);
    if (ignored.includes(report)) refuse(`Run reports such as ${report} are ignored by git and would never be committed. Run e2e-ui-test-env-setup to add ignore exception(s): !${report.replace(/00000000-0000\/run-1\.json$/, '*/run-*.json')}.`);
    notes.push('The developer runs Playwright; this skill only reads the report they supply.');
    break;
  }
  case 'e2e-ui-test-coverage-evaluator': {
    const stage = args.stage;
    if (!['plan', 'tests'].includes(stage)) usage('--stage plan|tests is required for e2e-ui-test-coverage-evaluator');
    if (!fs.existsSync(setupPath)) refuse(`Missing setup-decisions.json for stage ${stage}.`);
    if (!fs.existsSync(manifestPath)) refuse(`Missing coverage-manifest.json for stage ${stage}.`);
    else {
      const manifest = readJson(manifestPath);
      const inventory = manifest.requirementsInventoryRef?.path;
      if (!inventory || !fs.existsSync(path.resolve(root, inventory))) refuse(`Missing requirements inventory for stage ${stage}.`);
    }
    if (stage === 'tests' && (!args.catalog || !fs.existsSync(path.resolve(root, args.catalog)))) refuse('Missing test catalog (--catalog) for stage tests.');
    notes.push('The evaluator is read-only: write only to <docs-e2e-root>/evaluations/.');
    const ignoredReports = ignoredHandoffs(['evaluations/evaluation-tests-00000000-0000.json', 'evaluations/evaluation-tests-00000000-0000.md']);
    if (ignoredReports.length) notes.push(`Evaluation reports would be ignored by git (${ignoredReports.join(', ')}); report this as a finding routed to e2e-ui-test-env-setup.`);
    break;
  }
}

if (refusals.length) {
  refusals.forEach(r => console.log(`REFUSED (${skill}): ${r}`));
  notes.forEach(n => console.log(n));
  process.exitCode = 2;
} else {
  console.log(`PASS (${skill}): entry gates satisfied.`);
  notes.forEach(n => console.log(n));
}
