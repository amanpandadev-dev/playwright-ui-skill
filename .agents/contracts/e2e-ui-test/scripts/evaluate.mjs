#!/usr/bin/env node
// Engine for e2e-ui-test-coverage-evaluator: deterministic gates, the blinded judge, scoring and the report.
// Static only: parses sources and JSON, never imports Playwright, runs tests, or calls a model.
// Writes only under <docs-root>/evaluations/.
//
//   node evaluate.mjs prepare-judge --root <repo> --docs-root <dir> [--stage plan|tests] [--catalog <catalog>] --typescript <ts.js> [--now YYYYMMDD-HHmm]
//        (plan stage writes only the criterion re-derivation bundles; tests stage also needs --catalog)
//   node evaluate.mjs report --stage plan|tests --root <repo> --docs-root <dir> [--catalog <catalog>]
//        [--catalog-schema <schema>] --typescript <ts.js> [--judge <judge-dir>] [--model <id>] [--dispatch batched|per-sample]
//   node evaluate.mjs judge-report --stage plan|tests --root <repo> --docs-root <dir> --typescript <ts.js> --judge <judge-dir> [--model <id>] [--dispatch batched|per-sample]
//        (writes only the judge record, for an evaluation that already exists; the verdict never changes)
//        (with --judge, report also writes evaluations/judge-report-<stage>-<time>.json and .md, the committed judge record)
//        [--now YYYYMMDD-HHmm] [--commit <sha>] [--dry-run]
//   node evaluate.mjs judge-status --root <repo> --judge <judge-dir>
//
// Exit codes: 0 PASS, 3 REVIEW, 4 FAIL, 2 refused by the entry gate, 1 usage or internal error.
// prepare-judge exits 0 when bundles were written; it also writes <judge-dir>/prompts.json: `batches` holds one sub-agent
// prompt per sample number (the default dispatch) and `samples` holds one sub-agent prompt per
// bundle sample, so every sample can be dispatched in one parallel wave. judge-status lists the samples still missing
// or invalid, with their prompts, and exits 0 when all are present or 3 when some are missing.
import fs from 'node:fs';
import { buildJudgeReport, judgeReportMarkdown, DISPATCH_MODES } from './judge-report.mjs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateCoverage, fingerprint, normalizeText, normalizeClause, needsCatalog, catalogStub } from './validate-coverage.mjs';
import { parser, inspect } from './source-evidence.mjs';
import { validate } from './json-schema-lite.mjs';
import { findSection, enumerateUnits } from './source-sections.mjs';
import { scopeViolations, SKILLS, RECORD_DIR } from './check-file-scope.mjs';
import { verifySetup } from './check-setup.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const contracts = path.resolve(here, '..');
const evaluatorRefs = path.resolve(contracts, '../../skills/e2e-ui-test-coverage-evaluator/references');
const CONTRACTS_VERSION = fs.readFileSync(path.join(contracts, 'CONTRACTS_VERSION'), 'utf8').trim();
const OUTCOMES = ['Supported', 'PartiallySupported', 'Unsupported', 'WrongLayer'];
const SAMPLES_REQUIRED = 3;

// ---------------------------------------------------------------- arguments
const [command, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i++) {
  const key = rest[i].replace(/^--/, '');
  const next = rest[i + 1];
  if (next === undefined || next.startsWith('--')) args[key] = true;
  else { args[key] = next; i++; }
}
const fail = message => { console.error(`evaluate: ${message}`); process.exit(1); };
if (args.dispatch !== undefined && !DISPATCH_MODES.includes(args.dispatch)) fail(`--dispatch must be one of ${DISPATCH_MODES.join(', ')}`);
if (!['report', 'prepare-judge', 'judge-status', 'judge-report'].includes(command)) fail('command must be report, prepare-judge, judge-status or judge-report');

// ---------------------------------------------------------------- judge dispatch
// The sub-agent prompts are the ones in judge-protocol.md, so the protocol stays their single source.
function protocolPrompts() {
  const protocol = normalizeText(fs.readFileSync(path.join(evaluatorRefs, 'judge-protocol.md'), 'utf8'));
  const blocks = [...protocol.matchAll(/```text\n(You are a blinded reviewer\.[\s\S]*?)\n```/g)].map(m => m[1]);
  const rederive = blocks.find(b => b.includes('criterionUnits'));
  const obligation = blocks.find(b => !b.includes('criterionUnits'));
  if (!rederive || !obligation) fail('judge-protocol.md no longer contains both sub-agent prompts');
  const batch = protocol.match(/```text\n(You are a blinded batch reviewer\.[\s\S]*?)\n```/)?.[1];
  if (!batch || !batch.includes('<items>')) fail('judge-protocol.md no longer contains the batch sub-agent prompt');
  return { obligation, rederive, batch };
}

function judgeDispatch(root, judgeDir) {
  const prompts = protocolPrompts();
  const posixRel = file => path.relative(root, file).split(path.sep).join('/');
  const bundles = [];
  for (const entry of fs.readdirSync(judgeDir, { withFileTypes: true }).filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === 'rederive') {
      for (const s of fs.readdirSync(path.join(judgeDir, 'rederive'), { withFileTypes: true }).filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
        bundles.push({ bundle: `rederive/${s.name}`, kind: 'rederive', dir: path.join(judgeDir, 'rederive', s.name) });
      }
    } else bundles.push({ bundle: entry.name, kind: 'obligation', dir: path.join(judgeDir, entry.name) });
  }
  const valid = (kind, file) => {
    try {
      const s = JSON.parse(normalizeText(fs.readFileSync(file, 'utf8')));
      return kind === 'rederive' ? Array.isArray(s.criterionUnits) && s.criterionUnits.every(Number.isInteger) : OUTCOMES.includes(s.outcome);
    } catch { return false; }
  };
  const samples = [];
  for (const b of bundles.filter(b => fs.existsSync(path.join(b.dir, 'bundle.json')))) {
    for (let n = 1; n <= SAMPLES_REQUIRED; n++) {
      const output = path.join(b.dir, `sample-${n}.json`);
      // The prompt carries absolute paths: a sub-agent may start in any folder, and a relative path that resolves
      // elsewhere would make it write the sample to a place the engine never reads. Fields stay relative to --root.
      const absPosix = file => path.resolve(file).split(path.sep).join('/');
      samples.push({ bundle: b.bundle, sample: n, kind: b.kind, bundleFile: absPosix(path.join(b.dir, 'bundle.json')), outputFile: absPosix(output), output: posixRel(output), present: valid(b.kind, output),
        prompt: prompts[b.kind].replace('<bundle.json path>', () => absPosix(path.join(b.dir, 'bundle.json'))).replace('<sample-N.json path>', () => absPosix(output)) });
    }
  }
  return samples;
}

// One sub-agent per sample number covers every bundle still missing that sample, instead of one agent per
// bundle sample. The agents are still fresh and share no context with each other, so the three samples of a bundle
// stay independent; only the bundles within one agent share a context, and each is judged alone (see judge-protocol.md).
function judgeBatches(samples) {
  const batchPrompt = protocolPrompts().batch;
  const numbers = [...new Set(samples.map(s => s.sample))].sort((a, b) => a - b);
  return numbers.map(n => {
    const items = samples.filter(s => s.sample === n && !s.present);
    return { sample: n, items: items.length, prompt: batchPrompt.replace('<items>', () => items.map(s => `${s.kind} | ${s.bundleFile} | ${s.outputFile}`).join('\n')) };
  }).filter(b => b.items > 0);
}

if (command === 'judge-status') {
  for (const required of ['root', 'judge']) if (!args[required]) fail(`--${required} is required`);
  const statusRoot = path.resolve(args.root);
  const judgeDir = path.resolve(statusRoot, args.judge);
  if (!fs.existsSync(judgeDir)) fail(`judge directory not found: ${args.judge}`);
  const samples = judgeDispatch(statusRoot, judgeDir);
  const perSample = process.argv.includes('--per-sample');
  const missing = samples.filter(s => !s.present).map(({ present, kind, bundleFile, outputFile, prompt, ...s }) => (perSample ? { ...s, prompt } : s));
  console.log(JSON.stringify({ judgeDir: path.relative(statusRoot, judgeDir).split(path.sep).join('/'), samplesRequired: SAMPLES_REQUIRED,
    samples: samples.length, complete: missing.length === 0, missingBatches: judgeBatches(samples), missing }, null, 2));
  process.exit(missing.length ? 3 : 0);
}

for (const required of ['root', 'docs-root', 'typescript']) if (!args[required]) fail(`--${required} is required`);
const stage = command === 'prepare-judge' ? (args.stage || 'tests') : args.stage;
if (command === 'judge-report' && !args.judge) fail('--judge is required');
if (!['plan', 'tests'].includes(stage)) fail('--stage plan|tests is required');

const root = path.resolve(args.root);
const docsRoot = path.resolve(root, args['docs-root']);
const typescript = path.resolve(args.typescript);
const rel = file => path.relative(root, file).split(path.sep).join('/');
const readText = file => normalizeText(fs.readFileSync(file, 'utf8'));
const readJson = file => JSON.parse(readText(file));
const now = args.now || new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
const evaluationsDir = path.join(docsRoot, 'evaluations');
const catalogPath = args.catalog ? path.resolve(root, args.catalog) : null;

// ---------------------------------------------------------------- entry gate
const gateRun = spawnSync(process.execPath, [path.join(here, 'check-gates.mjs'), '--skill', 'e2e-ui-test-coverage-evaluator',
  '--docs-root', docsRoot, '--root', root, '--stage', stage, ...(catalogPath ? ['--catalog', catalogPath] : [])], { encoding: 'utf8' });
if (gateRun.status !== 0) {
  process.stdout.write(gateRun.stdout);
  process.stderr.write(gateRun.stderr);
  process.exit(gateRun.status === 2 ? 2 : 1);
}

const setupPath = path.join(docsRoot, 'setup-decisions.json');
const manifestPath = path.join(docsRoot, 'coverage-manifest.json');
const setup = readJson(setupPath);
const manifest = readJson(manifestPath);
const inventoryPath = path.resolve(root, manifest.requirementsInventoryRef.path);
const inventory = readJson(inventoryPath);
const lane = setup.lanes[0];
const testRoot = path.resolve(root, setup.testDir);

// ---------------------------------------------------------------- source helpers
const ts = parser(root, typescript);
const stripMarkers = textValue => textValue.split('\n').filter(l => !/\/\/\s*@e2e-(evidence|meta)\b/.test(l)).join('\n');
// Bundle 1.1 writes every multi-line text as an array of lines: file viewers truncate long escaped strings, which
// pushed judges to open other files and broke blinding.
const BUNDLE_VERSION = '1.1';
const lines = textValue => normalizeText(textValue).split('\n');

function definitions(file) {
  const source = readText(file);
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const defs = new Map();
  const imports = [];
  const visit = node => {
    if (ts.isImportDeclaration(node)) imports.push(node.moduleSpecifier.text);
    if (ts.isFunctionDeclaration(node) && node.name) defs.set(node.name.text, node);
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)
      && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) defs.set(node.name.text, node);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return { tree, defs, imports };
}

function calledNames(node, tree) {
  const names = new Set();
  const visit = n => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) names.add(n.expression.getText(tree));
    ts.forEachChild(n, visit);
  };
  visit(node);
  return names;
}

function routeCalls(node, tree) {
  const calls = [];
  const visit = n => {
    if (ts.isCallExpression(n) && /\.route$/.test(n.expression.getText(tree))) calls.push(stripMarkers(n.getText(tree)));
    ts.forEachChild(n, visit);
  };
  visit(node);
  return calls;
}

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  for (const ext of ['', '.ts', '.tsx', '.js', '.mjs']) {
    const candidate = path.resolve(path.dirname(fromFile), specifier + ext);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

// ---------------------------------------------------------------- criterion re-derivation
// A judge re-derives which units of a sampled criteria section are acceptance criteria from the source alone,
// without the inventory's dispositions, so an omission shared by extraction and authoring can surface.
const REDERIVE_SAMPLE = 3;
function rederiveSections() {
  const sections = [...(inventory.criteriaSections?.sections || [])].sort((a, b) => `${a.path}#${a.heading}`.localeCompare(`${b.path}#${b.heading}`));
  if (sections.length <= REDERIVE_SAMPLE) return sections.map((s, i) => ({ key: `S${String(i + 1).padStart(2, '0')}`, section: s }));
  const picks = [...new Set(Array.from({ length: REDERIVE_SAMPLE }, (_, i) => Math.round(i * (sections.length - 1) / (REDERIVE_SAMPLE - 1))))];
  return picks.map(i => ({ key: `S${String(i + 1).padStart(2, '0')}`, section: sections[i] }));
}

function writeRederiveBundles(judgeDir) {
  const written = [];
  for (const { key, section } of rederiveSections()) {
    const found = findSection(readText(path.resolve(root, section.path)), section.heading);
    if (found.error) continue;
    const bundle = {
      bundleVersion: BUNDLE_VERSION, kind: 'criterion-rederivation', section: { path: section.path, heading: section.heading },
      units: enumerateUnits(found.lines).map(u => ({ index: u.index, kind: u.kind, text: u.text })),
      question: 'Which of these units state an acceptance criterion: a testable condition the delivered behaviour must meet? Notes, examples, intent and scope statements are not criteria.',
      answerFormat: { criterionUnits: 'Array of unit indices.', justification: 'One sentence.' },
    };
    const dir = path.join(judgeDir, 'rederive', key);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'bundle.json'), `${JSON.stringify(bundle, null, 2)}\n`);
    written.push(key);
  }
  return written;
}

function aggregateRederivation(judgeDir) {
  const base = path.join(judgeDir, 'rederive');
  if (!fs.existsSync(base)) return [];
  const bySection = new Map(rederiveSections().map(r => [r.key, r.section]));
  return fs.readdirSync(base, { withFileTypes: true }).filter(e => e.isDirectory() && bySection.has(e.name)).map(entry => {
    const section = bySection.get(entry.name);
    const dir = path.join(base, entry.name);
    const samples = fs.readdirSync(dir).filter(f => /^sample-\d+\.json$/.test(f)).map(f => {
      try { return JSON.parse(readText(path.join(dir, f))); } catch { return null; }
    }).filter(s => s && Array.isArray(s.criterionUnits) && s.criterionUnits.every(Number.isInteger));
    const votes = new Map();
    for (const s of samples) for (const i of new Set(s.criterionUnits)) votes.set(i, (votes.get(i) || 0) + 1);
    const judged = new Set([...votes].filter(([, n]) => n > samples.length / 2).map(([i]) => i));
    // Out-of-scope units are criteria the scope excludes, so they count as criteria here.
    const recorded = new Set(section.units.filter(u => u.disposition !== 'non-criterion').map(u => u.index));
    return { key: entry.name, section, samples: samples.length, incomplete: samples.length < SAMPLES_REQUIRED,
      missed: [...judged].filter(i => !recorded.has(i)).sort((a, b) => a - b),
      extra: [...recorded].filter(i => !judged.has(i)).sort((a, b) => a - b) };
  });
}

// ---------------------------------------------------------------- prepare-judge
// One entry per bundle sample: dispatch every entry at once, each to a fresh sub-agent given only its prompt.
function writePrompts(judgeDir) {
  const file = path.join(judgeDir, 'prompts.json');
  const all = judgeDispatch(root, judgeDir);
  const samples = all.map(({ present, kind, bundleFile, outputFile, ...s }) => s);
  fs.writeFileSync(file, `${JSON.stringify({ samplesRequired: SAMPLES_REQUIRED, dispatch: 'batches', batches: judgeBatches(all), samples }, null, 2)}\n`);
  return rel(file);
}

function prepareJudge() {
  const judgeDirEarly = path.join(evaluationsDir, `judge-${now}`);
  if (stage === 'plan') {
    if (fs.existsSync(judgeDirEarly)) fail(`judge directory already exists: ${rel(judgeDirEarly)}`);
    const sections = writeRederiveBundles(judgeDirEarly);
    if (!sections.length) fail('the inventory declares no criteria sections to re-derive (inventory schema 1.1 required)');
    const prompts = writePrompts(judgeDirEarly);
    console.log(JSON.stringify({ judgeDir: rel(judgeDirEarly), rederive: sections, samplesRequired: SAMPLES_REQUIRED, prompts }, null, 2));
    return;
  }
  if (!catalogPath) fail('--catalog is required for the tests stage');
  const catalog = readJson(catalogPath);
  const rubric = readText(path.join(evaluatorRefs, 'unsupported-mappings.md'));
  const fixtureFile = lane.fixtureEntryPoint ? path.resolve(root, lane.fixtureEntryPoint) : null;
  const fixtureRoutes = fixtureFile && fs.existsSync(fixtureFile)
    ? (() => { const d = definitions(fixtureFile); return routeCalls(d.tree, d.tree).map(lines); })() : [];
  const judgeDir = path.join(evaluationsDir, `judge-${now}`);
  if (fs.existsSync(judgeDir)) fail(`judge directory already exists: ${rel(judgeDir)}`);
  const judged = manifest.obligations.filter(o => o.testIds.length > 0);
  if (!judged.length) fail('no obligation has linked tests; nothing to judge');

  for (const obligation of judged) {
    const requirement = inventory.requirements.find(r => r.requirementId === obligation.requirementId);
    const sourceFile = path.resolve(root, requirement.sourceReference.path);
    if (!readText(sourceFile).includes(normalizeClause(requirement.sourceText))) fail(`${obligation.obligationId}: source clause no longer resolves`);
    const tests = obligation.testIds.map(testId => {
      const entry = catalog.tests.find(t => t.testId === testId);
      if (!entry) fail(`${obligation.obligationId}: test ${testId} is not in the catalog`);
      const specFile = path.resolve(root, entry.automationReference.specPath);
      const parsed = inspect(ts, specFile);
      const record = parsed.records.find(r => r.testId === testId);
      if (!record) fail(`${obligation.obligationId}: ${testId} is not declared in ${entry.automationReference.specPath}`);
      const specDefs = definitions(specFile);
      const helpers = [];
      for (const name of calledNames(record.body, parsed.tree)) {
        let node = specDefs.defs.get(name);
        let tree = specDefs.tree;
        if (!node) {
          for (const specifier of specDefs.imports) {
            const target = resolveImport(specFile, specifier);
            if (!target) continue;
            const imported = definitions(target);
            if (imported.defs.has(name)) { node = imported.defs.get(name); tree = imported.tree; break; }
          }
        }
        if (node) helpers.push({ name, body: lines(stripMarkers(node.getText(tree))), routes: routeCalls(node, tree).map(lines) });
      }
      return {
        testId,
        specPath: entry.automationReference.specPath,
        body: lines(stripMarkers(record.body.getText(parsed.tree))),
        helpers,
        interceptedRoutes: routeCalls(record.body, parsed.tree).map(lines),
      };
    });
    const persona = lane.personas.find(p => p.persona === obligation.persona);
    const bundle = {
      bundleVersion: BUNDLE_VERSION,
      obligationId: obligation.obligationId,
      sourceClause: { path: requirement.sourceReference.path, heading: requirement.sourceReference.heading, text: requirement.sourceText },
      obligation: { persona: obligation.persona, preconditions: obligation.preconditions, expectedBehavior: obligation.expectedBehavior, evidenceLayer: obligation.evidenceLayer },
      personaIdentity: persona ? persona.identity : 'unknown',
      fixtureRoutes,
      tests,
      rubric: lines(rubric),
      outcomes: OUTCOMES,
      answerFormat: { outcome: OUTCOMES.join(' | '), justification: 'One sentence.', citedLine: 'A line copied from a test or helper body above.' },
    };
    const dir = path.join(judgeDir, obligation.obligationId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'bundle.json'), `${JSON.stringify(bundle, null, 2)}\n`);
  }
  const rederive = writeRederiveBundles(judgeDir);
  const prompts = writePrompts(judgeDir);
  console.log(JSON.stringify({ judgeDir: rel(judgeDir), bundles: judged.map(o => o.obligationId), rederive, samplesRequired: SAMPLES_REQUIRED, prompts }, null, 2));
}

// ---------------------------------------------------------------- deterministic gates
const GATES = [
  { id: 'G-D01', name: 'Inventory accounts for every enumerable source unit', stages: ['plan', 'tests'], blocking: true, route: 'e2e-ui-test-plan-generator', type: 'source_enumeration' },
  { id: 'G-D02', name: 'Source-owned requirement identifiers are traced', stages: ['plan', 'tests'], blocking: true, route: 'e2e-ui-test-plan-generator', type: 'requirement_traceability' },
  { id: 'G-D03', name: 'Inventory, manifest, rollups and fingerprints reconcile', stages: ['plan', 'tests'], blocking: true, route: 'e2e-ui-test-plan-generator', type: 'reconciliation' },
  { id: 'G-D04', name: 'Every gap has a precise blocker, remediation and owner', stages: ['plan', 'tests'], blocking: true, route: 'e2e-ui-test-plan-generator', type: 'imprecise_gap' },
  { id: 'G-D05', name: 'Plan, ledger and gap projections match the manifest', stages: ['plan', 'tests'], blocking: true, route: 'e2e-ui-test-plan-generator', type: 'projection_drift' },
  { id: 'G-D06', name: 'Journey counts are proportional to obligations', stages: ['plan', 'tests'], blocking: true, route: 'e2e-ui-test-plan-generator', type: 'journey_proportionality' },
  { id: 'G-D07', name: 'Catalog v3 is valid and synchronized with the test inventory', stages: ['tests'], blocking: true, route: 'e2e-ui-test-generator', type: 'catalog_sync' },
  { id: 'G-D08', name: 'Every claimed test resolves to a reviewed assertion', stages: ['plan', 'tests'], blocking: true, route: 'e2e-ui-test-generator', type: 'unsupported_evidence' },
  { id: 'G-D09', name: 'No empty, focused or unconditional tests', stages: ['tests'], blocking: true, route: 'e2e-ui-test-generator', type: 'empty_or_unconditional_test' },
  { id: 'G-D10', name: 'Playwright config module format is valid', stages: ['tests'], blocking: true, route: 'e2e-ui-test-env-setup', type: 'config_module_format' },
  { id: 'G-D11', name: 'Touched files stay within declared artifact roots', stages: ['tests'], blocking: true, route: 'e2e-ui-test-generator', type: 'file_scope' },
  // The recorded setup matches the repository.
  { id: 'G-D12', name: 'Setup conforms to its recorded decisions', stages: ['tests'], blocking: true, route: 'e2e-ui-test-env-setup', type: 'setup_conformance' },
  // Execution evidence supplied through e2e-ui-test-verify-run. Non-blocking: a failing run is a finding for its owner
  // (often a person deciding on a possible application defect), not a coverage failure.
  { id: 'G-D13', name: 'Recorded execution evidence is current and every failure is routed', stages: ['tests'], blocking: false, route: 'e2e-ui-test-verify-run', type: 'execution_evidence' },
];
const CLASSIFY = [
  ['G-D01', /^source enumeration:/],
  ['G-D02', /^requirement traceability:/],
  ['G-D06', /^journey proportionality:|names no planned journey/],
  ['G-D11', /^file scope:/],
  ['G-D04', /^test data:/],
  ['G-D09', /empty test body|unconditional literal assertion|test\.only/],
  ['G-D04', /precise (blocker|remediation|owner|blockedActivity) required|remediation merely repeats blocker|exclusion authority required|observable obligation cannot be suppressed|Planned obligation left unauthored/],
  ['G-D08', /Planned obligation cannot carry/],
  ['G-D05', /coverage-data projection|coverage-groups projection|projection differs from manifest|malformed coverage-view region|Plans omit or duplicate obligations|Missing plan\/ledger\/gap artifacts/],
  ['G-D07', /Duplicate or missing catalog\/supporting test IDs/],
  ['G-D08', /Covered without test\/assertion evidence|unsupported or unreviewed coverage claim|invalid review status|missing semantic review|nonexistent test|browser test must be in portal catalog|catalog omits requirement|source has no test|no assertion reference|test source changed|nonexistent assertion|assertion source changed|not in test or a directly called|orphan assertion test ID|unsupported catalog requirement mapping|catalog plan reference disagrees|test IDs must be a unique array|assertion references required|@e2e-meta|invalid test metadata|parameterized|aliased test|unresolved test callback|source parse failed|escapes root|Missing file reference|ENOENT/],
];
const gatesForStage = GATES.filter(g => g.stages.includes(stage));
const SCHEMA_MISSING = 'No specialized catalog schema found; e2e-ui-test-env-setup must specialize the contracts template for this repository';
const classify = message => {
  for (const [id, pattern] of CLASSIFY) if (pattern.test(message) && gatesForStage.some(g => g.id === id)) return id;
  return 'G-D03';
};

// G-D13: every recorded execution result cites a valid, current verify-run report, and every failed test in it is a
// finding for its owner. Messages name the failure class, which decides the route in buildReport.
const RUN_SCHEMA = path.join(contracts, 'schemas', 'verify-run-report.schema.json');
function executionEvidence() {
  const messages = [];
  const runs = new Map();
  const runOf = file => {
    if (!runs.has(file)) {
      const abs = path.resolve(root, file);
      let run = null, problem = null;
      try {
        run = readJson(abs);
        const errors = validate(readJson(RUN_SCHEMA), run);
        if (errors.length) problem = `is not a valid verify-run report (${errors.slice(0, 2).join('; ')})`;
        else {
          const stale = run.specs.filter(s => { const spec = path.resolve(root, s.path); return !fs.existsSync(spec) || `sha256:${fingerprint(fs.readFileSync(spec, 'utf8'))}` !== s.fingerprint; });
          if (stale.length) problem = `is stale: ${stale.map(s => s.path).join(', ')} changed after the run; run again and record the new attempt`;
        }
      } catch { problem = 'cannot be read'; }
      runs.set(file, { run, problem });
    }
    return runs.get(file);
  };
  for (const o of manifest.obligations.filter(x => x.executionStatus && x.executionStatus !== 'NotRun')) {
    const { run, problem } = runOf(o.resultReference);
    if (problem) { messages.push(`execution: ${o.obligationId} result ${o.resultReference} ${problem}`); continue; }
    for (const t of run.tests.filter(x => o.testIds.includes(x.testId) && x.outcome === 'Failed')) {
      const f = t.failure;
      messages.push(`execution: ${o.obligationId} ${t.testId} [${t.project}] failed: ${f.class}/${f.reason}${f.location ? ` at ${f.location}` : ''} (${o.resultReference})`);
    }
  }
  return [...new Set(messages)];
}
// The report's execution status, from recorded evidence only: NotRun until every authored obligation has a result.
function executionSummary() {
  const authored = manifest.obligations.filter(o => o.coverageStatus === 'Covered');
  const statuses = authored.map(o => o.executionStatus || 'NotRun');
  if (!authored.length || statuses.includes('NotRun')) return 'NotRun';
  if (statuses.includes('Failed')) return 'Failed';
  return statuses.every(s => s === 'Skipped') ? 'Skipped' : 'Passed';
}
const EXECUTION_ROUTE = message => /failed: (?:Behavioural|Unclassified)\//.test(message) ? 'human'
  : /failed: Environment\//.test(message) ? 'e2e-ui-test-env-setup'
  : /failed: Mechanical\//.test(message) ? 'e2e-ui-test-generator' : 'e2e-ui-test-verify-run';

function runDeterministic() {
  const evidence = Object.fromEntries(gatesForStage.map(g => [g.id, []]));
  let coverage;
  try {
    // A plan-stage evaluation of a Draft re-plan still resolves the test IDs already linked against the real catalog.
    const planCatalog = needsCatalog(manifest) ? (catalogPath || path.resolve(root, setup.catalogPath || path.posix.join(setup.testDir, 'test-catalog.json'))) : null;
    const catalog = stage === 'tests' ? readJson(catalogPath) : planCatalog ? readJson(planCatalog) : catalogStub(manifest);
    coverage = validateCoverage({ root, requirements: inventory, manifest, catalog, typescript, stage });
  } catch (error) {
    coverage = { valid: false, errors: [error.message], warnings: [], counts: null };
  }
  for (const message of coverage.errors) evidence[classify(message)].push(message);

  // G-D11: each generating skill records its touched paths with check-file-scope.mjs; re-check every record
  // against the current ownership rules. A tests-stage evaluation needs the test generator's record.
  if (stage === 'tests') {
    const scopeDir = path.join(docsRoot, RECORD_DIR);
    const records = fs.existsSync(scopeDir) ? fs.readdirSync(scopeDir).filter(f => f.endsWith('.json')).sort().map(f => {
      try { return { file: f, record: readJson(path.join(scopeDir, f)) }; } catch { return { file: f, record: null }; }
    }) : [];
    for (const { file, record } of records) {
      if (!record || !SKILLS.includes(record.skill) || !Array.isArray(record.touched)) { evidence['G-D11'].push(`file scope: unreadable record ${file}`); continue; }
      const violations = scopeViolations({ skill: record.skill, touched: record.touched, setup, docsRoot: rel(docsRoot) });
      for (const v of new Set([...violations, ...(record.violations || [])])) evidence['G-D11'].push(`${v} (record ${file})`);
    }
    evidence['G-D12'].push(...verifySetup({ root, docsRoot: rel(docsRoot), setup }).errors);
    if (!records.some(r => r.record?.skill === 'e2e-ui-test-generator')) {
      evidence['G-D11'].push(`file scope: no e2e-ui-test-generator record under ${rel(scopeDir)}; run check-file-scope.mjs check --record at the end of authoring`);
    }
    evidence['G-D13'].push(...executionEvidence());
  }

  if (stage === 'tests') {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-evaluate-'));
    try {
      const inventoryOut = path.join(temp, 'inventory.json');
      const inv = spawnSync(process.execPath, [path.join(here, 'inventory-tests.mjs'), '--test-root', testRoot, '--output', inventoryOut, '--typescript', typescript], { cwd: root, encoding: 'utf8' });
      if (inv.status !== 0) evidence['G-D07'].push(`Test inventory failed: ${(inv.stderr || inv.stdout).trim().split('\n')[0]}`);
      if (fs.existsSync(inventoryOut)) {
        const schemaPath = args['catalog-schema'] ? path.resolve(root, args['catalog-schema'])
          : [path.join(path.dirname(catalogPath), 'test-catalog.schema.json'), path.join(contracts, 'schemas', 'test-catalog.schema.json')].find(p => fs.existsSync(p));
        const usingTemplate = path.resolve(schemaPath) === path.join(contracts, 'schemas', 'test-catalog.schema.json');
        if (usingTemplate) evidence['G-D07'].push(`${SCHEMA_MISSING}: expected test-catalog.schema.json next to ${rel(catalogPath)}.`);
        const cat = spawnSync(process.execPath, [path.join(here, 'validate-catalog.mjs'), '--catalog', catalogPath, '--schema', schemaPath, '--inventory', inventoryOut, '--docs-root', docsRoot], { cwd: root, encoding: 'utf8' });
        if (cat.status !== 0) {
          for (const line of `${cat.stderr}`.split('\n').filter(l => l.startsWith('- '))) {
            // The template's placeholders are already reported as the missing specialized schema.
            if (usingTemplate && /unreplaced template sentinels/.test(line)) continue;
            evidence['G-D07'].push(line.slice(2));
          }
        }
      }
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }

    const specs = [];
    const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(abs); } else if (/\.spec\.[cm]?[jt]sx?$/.test(e.name)) specs.push(abs);
    });
    if (fs.existsSync(testRoot)) walk(testRoot);
    for (const spec of specs) if (/\btest\.only\s*\(/.test(readText(spec))) evidence['G-D09'].push(`Focused test.only in ${rel(spec)}`);

    const configPath = path.resolve(root, setup.configPath);
    const mod = spawnSync(process.execPath, [path.join(here, 'validate-config-module-format.mjs'), '--config', configPath], { cwd: root, encoding: 'utf8' });
    if (mod.status !== 0) evidence['G-D10'].push(...`${mod.stderr}`.trim().split('\n').filter(Boolean));
  }

  const gates = gatesForStage.map(g => ({
    gateId: g.id, name: g.name,
    result: g.implemented === false ? 'not-implemented' : evidence[g.id].length ? 'fail' : 'pass',
    blocking: g.implemented === false ? false : g.blocking,
    evidence: g.implemented === false ? ['Reserved for a future contracts version.'] : evidence[g.id],
  }));
  return { gates, coverage };
}

// ---------------------------------------------------------------- judge aggregation
function aggregateJudge(judgeDir) {
  const results = [];
  for (const entry of fs.readdirSync(judgeDir, { withFileTypes: true }).filter(e => e.isDirectory() && e.name !== 'rederive')) {
    const dir = path.join(judgeDir, entry.name);
    const samples = fs.readdirSync(dir).filter(f => /^sample-\d+\.json$/.test(f)).map(f => {
      try { return JSON.parse(readText(path.join(dir, f))); } catch { return null; }
    }).filter(s => s && OUTCOMES.includes(s.outcome));
    const counts = Object.fromEntries(OUTCOMES.map(o => [o, samples.filter(s => s.outcome === o).length]));
    const majority = OUTCOMES.find(o => counts[o] > samples.length / 2) || null;
    results.push({
      obligationId: entry.name,
      samples: samples.length,
      outcomes: samples.map(s => s.outcome),
      // Categorical outcomes have no median; use the strict majority, and be conservative without one.
      outcome: majority || 'Unsupported',
      disagreement: new Set(samples.map(s => s.outcome)).size > 1,
      incomplete: samples.length < SAMPLES_REQUIRED,
      justification: samples.find(s => s.outcome === (majority || 'Unsupported'))?.justification || null,
      details: samples.map(s => ({ outcome: s.outcome, justification: s.justification, citedLine: s.citedLine })),
    });
  }
  return results;
}

// ---------------------------------------------------------------- scoring
const WEIGHTS = { obligation_accounting: 15, requirement_traceability: 15, journey_proportionality: 10,
  assertion_support: 25, evidence_layer_honesty: 15, scenario_class_coverage: 10, selector_and_wait_quality: 10 };
const UNIT = new Set(['obligation_accounting', 'requirement_traceability', 'journey_proportionality']);

function selectorQuality() {
  let penalty = 0;
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(abs); return; }
    if (!/\.[cm]?[jt]sx?$/.test(e.name)) return;
    const code = readText(abs);
    penalty += 0.5 * (code.match(/waitForTimeout\s*\(/g) || []).length;
    penalty += 0.5 * (code.match(/networkidle/g) || []).length;
    penalty += 0.5 * (code.match(/locator\(\s*['"`](xpath=|\/\/)/g) || []).length;
    penalty += 0.25 * (code.match(/locator\(\s*['"`][.#]/g) || []).length;
  });
  if (fs.existsSync(testRoot)) walk(testRoot);
  return Math.max(1, 5 - penalty);
}

function score(coverage, judge) {
  const raw = {};
  const omitted = {};
  const counts = coverage.counts;
  if (counts && counts.obligations > 0) raw.obligation_accounting = (counts.obligations - counts.unaccountedObligations) / counts.obligations;
  else omitted.obligation_accounting = 'Coverage validation did not produce counts.';
  if (counts?.identifierTraceability && counts.sourceIdentifiers > 0) raw.requirement_traceability = counts.tracedIdentifiers / counts.sourceIdentifiers;
  else omitted.requirement_traceability = counts?.identifierTraceability === false
    ? 'The authority owns no requirement identifiers; derived criterion IDs follow the inventory derivationRule.'
    : 'No source-owned identifiers were discovered or coverage validation produced no counts.';
  omitted.scenario_class_coverage = 'Scenario applicability is not yet machine-readable in plans.';
  if (stage === 'tests') {
    const stories = [...new Set(inventory.requirements.map(r => r.storyId))];
    const ratios = stories.map(story => {
      const ids = inventory.requirements.filter(r => r.storyId === story).map(r => r.requirementId);
      const obligations = manifest.obligations.filter(o => ids.includes(o.requirementId));
      const unblocked = obligations.filter(o => o.evidenceLayer.startsWith('Browser') && !['Blocked', 'OutOfScope', 'NotBrowserObservable'].includes(o.coverageStatus)).length;
      const tests = new Set(obligations.flatMap(o => o.testIds)).size;
      return unblocked === 0 ? 1 : Math.min(1, tests / unblocked);
    });
    raw.journey_proportionality = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    raw.selector_and_wait_quality = selectorQuality();
    if (judge && judge.length) {
      const credit = { Supported: 1, PartiallySupported: 0.5, Unsupported: 0, WrongLayer: 0 };
      raw.assertion_support = 1 + 4 * (judge.reduce((a, j) => a + credit[j.outcome], 0) / judge.length);
      raw.evidence_layer_honesty = 1 + 4 * (1 - judge.filter(j => j.outcome === 'WrongLayer').length / judge.length);
    } else {
      omitted.assertion_support = 'The blinded judge has not run.';
      omitted.evidence_layer_honesty = 'The blinded judge has not run.';
    }
  } else {
    omitted.journey_proportionality = 'No tests exist at the plan stage.';
    omitted.assertion_support = 'Judged only at the tests stage.';
    omitted.evidence_layer_honesty = 'Judged only at the tests stage.';
    omitted.selector_and_wait_quality = 'No tests exist at the plan stage.';
  }
  const scores = {};
  let weighted = 0;
  let weights = 0;
  for (const [dimension, value] of Object.entries(raw)) {
    scores[dimension] = Math.round(value * 100) / 100;
    const likert = UNIT.has(dimension) ? 1 + 4 * value : value;
    weighted += WEIGHTS[dimension] * likert;
    weights += WEIGHTS[dimension];
  }
  const final = weights ? Math.round((weighted / weights) * 100) / 100 : null;
  const totalWeight = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  return { scores, final, omitted, weightsUsed: Object.fromEntries(Object.keys(raw).map(d => [d, WEIGHTS[d]])),
    weightCoverage: Math.round((weights / totalWeight) * 100) / 100 };
}

// ---------------------------------------------------------------- report
function buildReport() {
  const { gates, coverage } = runDeterministic();
  const findings = [];
  const add = finding => findings.push({ findingId: `EV-${String(findings.length + 1).padStart(4, '0')}`, ...finding });

  for (const gate of gates.filter(g => g.result === 'fail')) {
    const spec = GATES.find(g => g.id === gate.gateId);
    for (const message of gate.evidence) {
      const routeTo = message.startsWith(SCHEMA_MISSING) ? 'e2e-ui-test-env-setup'
        : /Planned obligation left unauthored/.test(message) ? 'e2e-ui-test-generator'
        // Setup-conformance findings about authored specs or the generated data module belong to the test generator.
        : gate.gateId === 'G-D12' && /: (spec|data module) /.test(message) ? 'e2e-ui-test-generator'
        // A recorded run: an environment failure goes to setup, a possible application defect to a person, a test bug
        // left after the repair rounds to the generator, and a missing or stale result back to verify-run.
        : gate.gateId === 'G-D13' ? EXECUTION_ROUTE(message) : spec.route;
      add({ severity: gate.blocking ? 'high' : 'medium', type: spec.type, routeTo,
        description: `${gate.gateId}: ${message}`, suggestion: `Route to ${routeTo} and rerun the evaluator.` });
    }
  }

  // Criterion re-derivation from sampled source sections, at either stage.
  if (args.judge) {
    for (const r of aggregateRederivation(path.resolve(root, args.judge))) {
      const where = `${r.section.path} "${r.section.heading}"`;
      if (r.incomplete) add({ severity: 'medium', type: 'judge_incomplete', routeTo: 'human',
        description: `Re-derivation ${r.key} (${where}): ${r.samples} valid sample(s); ${SAMPLES_REQUIRED} are required.`,
        suggestion: 'Collect the missing blinded re-derivation samples and rerun report.' });
      if (r.missed.length) add({ severity: 'medium', type: 'rederivation_mismatch', routeTo: 'e2e-ui-test-plan-generator',
        description: `Re-derivation ${r.key} (${where}): the judge found criteria in unit(s) ${r.missed.join(', ')}, which the inventory records as non-criteria.`,
        suggestion: 'Review those units against the source; extract any omitted criterion or give a precise non-criterion reason.' });
      if (r.extra.length) add({ severity: 'medium', type: 'rederivation_mismatch', routeTo: 'human',
        description: `Re-derivation ${r.key} (${where}): unit(s) ${r.extra.join(', ')} are recorded as criteria but the judge majority did not find a criterion.`,
        suggestion: 'A human confirms whether those units are testable criteria.' });
    }
  } else if (stage === 'plan') {
    add({ severity: 'low', type: 'rederivation_not_run', routeTo: 'human',
      description: 'Criteria were not re-derived from sampled source sections, so an omission shared by extraction and planning cannot be ruled out.',
      suggestion: 'Run prepare-judge --stage plan, collect three blinded samples per section, then rerun report with --judge.' });
  }

  let judge = null;
  if (stage === 'tests') {
    if (!args.judge) {
      add({ severity: 'medium', type: 'judge_not_run', routeTo: 'human',
        description: 'The blinded probabilistic judge has not run, so assertion support is unverified.',
        suggestion: 'Run prepare-judge, collect three blinded samples per bundle, then rerun report with --judge.' });
    } else {
      judge = aggregateJudge(path.resolve(root, args.judge));
      for (const j of judge) {
        const obligation = manifest.obligations.find(o => o.obligationId === j.obligationId);
        if (j.incomplete) add({ severity: 'medium', type: 'judge_incomplete', routeTo: 'human', obligationId: j.obligationId,
          description: `${j.obligationId}: ${j.samples} valid judge sample(s); ${SAMPLES_REQUIRED} are required.`,
          suggestion: 'Collect the missing blinded samples and rerun report.' });
        if (j.disagreement) add({ severity: 'medium', type: 'judge_disagreement', routeTo: 'human', obligationId: j.obligationId,
          description: `${j.obligationId}: judge samples disagree (${j.outcomes.join(', ')}).`,
          suggestion: 'A human reviews the test body against the source clause; do not average the samples.' });
        if (j.outcome === 'Unsupported') add({ severity: obligation?.coverageStatus === 'Covered' ? 'high' : 'medium', type: 'unsupported_claim',
          routeTo: 'e2e-ui-test-generator', obligationId: j.obligationId, testId: obligation?.testIds.join(', ') || undefined,
          description: `${j.obligationId}: the judge found the linked test does not establish the source clause.${j.justification ? ` ${j.justification}` : ''}`,
          suggestion: 'Author a test that establishes the clause, or remove the mapping and record a blocker.' });
        if (j.outcome === 'WrongLayer') add({ severity: 'medium', type: 'wrong_evidence_layer', routeTo: 'e2e-ui-test-generator', obligationId: j.obligationId,
          description: `${j.obligationId}: the linked test proves a different evidence layer than claimed.`,
          suggestion: 'Correct the evidence layer or link evidence from the appropriate layer.' });
        if (j.outcome === 'PartiallySupported') add({ severity: 'medium', type: 'partial_support', routeTo: 'e2e-ui-test-generator', obligationId: j.obligationId,
          description: `${j.obligationId}: the linked test establishes only part of the source clause.`,
          suggestion: 'Split the obligation or extend the test to cover the missing part.' });
      }
    }
  }
  for (const f of findings) if (f.testId === undefined) delete f.testId;

  const { scores, final, omitted, weightsUsed, weightCoverage } = score(coverage, judge);
  // A score measured on a minority of the weight must not read as a clean pass.
  const MIN_WEIGHT_COVERAGE_FOR_PASS = 0.5;
  const blockingFail = gates.some(g => g.blocking && g.result === 'fail');
  const high = findings.some(f => f.severity === 'high');
  const reviewTypes = new Set(['judge_disagreement', 'judge_incomplete', 'judge_not_run', 'unsupported_claim', 'wrong_evidence_layer', 'partial_support', 'rederivation_mismatch', 'rederivation_not_run']);
  const nonBlockingFail = gates.some(g => !g.blocking && g.result === 'fail');
  let verdict;
  let verdictReason;
  if (blockingFail) { verdict = 'FAIL'; verdictReason = `Blocking gate(s) failed: ${gates.filter(g => g.blocking && g.result === 'fail').map(g => g.gateId).join(', ')}.`; }
  else if (high) { verdict = 'FAIL'; verdictReason = 'High-severity finding(s) present.'; }
  else if (final !== null && final < 3.0) { verdict = 'FAIL'; verdictReason = `Final score ${final} is below 3.0.`; }
  else if (findings.some(f => reviewTypes.has(f.type)) || nonBlockingFail || final === null || final < 4.2 || weightCoverage < MIN_WEIGHT_COVERAGE_FOR_PASS) {
    verdict = 'REVIEW';
    verdictReason = findings.some(f => reviewTypes.has(f.type)) ? `Human review needed: ${[...new Set(findings.filter(f => reviewTypes.has(f.type)).map(f => f.type))].join(', ')}.`
      : nonBlockingFail ? 'A non-blocking gate failed.'
      : final === null || final < 4.2 ? `Final score ${final ?? 'unavailable'} is below 4.2.`
      : `Scores cover only ${Math.round(weightCoverage * 100)}% of the scoring weight; at least ${MIN_WEIGHT_COVERAGE_FOR_PASS * 100}% is required to pass.`;
  } else { verdict = 'PASS'; verdictReason = `All implemented gates passed; final score ${final} over ${Math.round(weightCoverage * 100)}% of the scoring weight.`; }

  const counts = coverage.counts ? {
    stories: coverage.counts.stories, criteria: coverage.counts.acceptanceCriteria, obligations: coverage.counts.obligations,
    browserReviewed: coverage.counts.browserReviewed, blockedBrowser: coverage.counts.blockedBrowser,
    plannedBrowser: coverage.counts.plannedBrowser, plannedObligations: coverage.counts.plannedObligations,
    sourceIdentifiers: coverage.counts.sourceIdentifiers, tracedIdentifiers: coverage.counts.tracedIdentifiers,
    unsupportedClaims: coverage.counts.unsupportedClaims, unaccountedObligations: coverage.counts.unaccountedObligations,
  } : {};
  const fileRef = file => ({ path: rel(file), fingerprint: fingerprint(readText(file)) });
  let commit = args.commit;
  if (!commit) { try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { commit = 'unknown'; } }

  const report = {
    schemaVersion: '1.0',
    contractsVersion: CONTRACTS_VERSION,
    stage,
    evaluatedCommit: commit,
    inputs: { manifest: fileRef(manifestPath), inventory: fileRef(inventoryPath), setupDecisions: fileRef(setupPath), ...(stage === 'tests' ? { catalog: fileRef(catalogPath) } : {}) },
    gates,
    scores,
    scoring: { finalScore: final, weightCoverage, weightsUsed, omitted },
    ...(judge && judge.length ? { judge: { model: args.model || 'unrecorded', dispatch: args.dispatch || 'unrecorded', samples: Math.max(1, Math.min(...judge.map(j => j.samples))), disagreements: judge.filter(j => j.disagreement).length } } : {}),
    findings,
    counts,
    executionStatus: executionSummary(),
    verdict,
    verdictReason,
  };
  const errors = validate(readJson(path.join(contracts, 'schemas', 'evaluation-report.schema.json')), report);
  if (errors.length) fail(`generated report violates its schema: ${errors.slice(0, 3).join('; ')}`);
  return report;
}

function markdown(report) {
  const lines = [];
  const cell = value => String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  lines.push(`# E2E Coverage Evaluation (${report.stage} stage)`, '');
  lines.push(`## Verdict: ${report.verdict}`, '');
  lines.push('| | |', '| --- | --- |');
  lines.push(`| **Verdict** | **${report.verdict}** |`);
  lines.push(`| **Final score** | ${report.scoring.finalScore ?? 'not scored'} / 5.0, measured on ${Math.round(report.scoring.weightCoverage * 100)}% of the scoring weight |`);
  if (report.counts.obligations !== undefined) lines.push(`| **Blocked browser obligations** | ${report.counts.blockedBrowser} |`);
  lines.push(`| **Findings** | ${['high', 'medium', 'low'].map(s => `${report.findings.filter(f => f.severity === s).length} ${s}`).join(' · ')} |`);
  lines.push(`| **Execution** | ${report.executionStatus} |`, '');
  lines.push(`> ${report.verdictReason}`, '');
  lines.push('## Deterministic gates', '', '| Gate | Check | Result | Blocking |', '| --- | --- | --- | --- |');
  for (const g of report.gates) lines.push(`| ${g.gateId} | ${cell(g.name)} | ${g.result} | ${g.blocking ? 'yes' : 'no'} |`);
  lines.push('', '## Scores', '', '| Dimension | Score | Weight |', '| --- | --- | --- |');
  for (const [d, s] of Object.entries(report.scores)) lines.push(`| ${d} | ${s}${UNIT.has(d) ? ' (0–1)' : ' (1–5)'} | ${report.scoring.weightsUsed[d]} |`);
  for (const [d, why] of Object.entries(report.scoring.omitted)) lines.push(`| ${d} | not scored: ${cell(why)} | — |`);
  if (report.judge) lines.push('', '## Blinded judge', '', `Model \`${report.judge.model}\`, dispatch ${report.judge.dispatch || 'unrecorded'}, ${report.judge.samples} sample(s) per obligation, ${report.judge.disagreements} disagreement(s). Per-obligation outcomes and justifications are in the judge report beside this file.`);
  lines.push('', '## Findings', '');
  if (!report.findings.length) lines.push('None.');
  else {
    lines.push('| ID | Severity | Type | Route to | Description | Suggestion |', '| --- | --- | --- | --- | --- | --- |');
    for (const f of report.findings) lines.push(`| ${f.findingId} | ${f.severity} | ${f.type} | ${f.routeTo} | ${cell(f.description)} | ${cell(f.suggestion)} |`);
  }
  lines.push('', '## Counts', '', '| Count | Value |', '| --- | --- |');
  for (const [k, v] of Object.entries(report.counts)) lines.push(`| ${k} | ${v} |`);
  lines.push('', '## Limitations', '');
  lines.push(report.executionStatus === 'NotRun'
    ? '- A verdict describes authored coverage and its support. It never states that tests pass; execution is `NotRun`.'
    : `- A verdict describes authored coverage and its support. Execution \`${report.executionStatus}\` is transcribed from developer-supplied run reports (gate G-D13); this evaluation ran nothing.`);
  for (const g of report.gates.filter(x => x.result === 'not-implemented')) lines.push(`- ${g.gateId} (${g.name}) is reserved and was not evaluated.`);
  lines.push(`- Evaluated commit \`${report.evaluatedCommit}\`, contracts ${report.contractsVersion}.`, '');
  return lines.join('\n');
}

function uniquePath(base, extension) {
  let candidate = `${base}${extension}`;
  for (let n = 2; fs.existsSync(candidate); n++) candidate = `${base}-${n}${extension}`;
  return candidate;
}

function writeJudgeReport(jsonPath, evaluationFile) {
  const judgeDir = path.resolve(root, args.judge);
  const judgeReport = buildJudgeReport({ stage, model: args.model, dispatch: args.dispatch, samplesRequired: SAMPLES_REQUIRED,
    obligations: aggregateJudge(judgeDir), rederivation: aggregateRederivation(judgeDir) });
  fs.writeFileSync(jsonPath, `${JSON.stringify(judgeReport, null, 2)}\n`);
  fs.writeFileSync(jsonPath.replace(/\.json$/, '.md'), judgeReportMarkdown(judgeReport, evaluationFile));
  return { judgeReport: rel(jsonPath), judgeReportMarkdown: rel(jsonPath.replace(/\.json$/, '.md')) };
}

if (command === 'prepare-judge') {
  prepareJudge();
} else if (command === 'judge-report') {
  // Writes only the judge record, for a judge whose evaluation report already exists. Never changes the verdict.
  const stamp = path.basename(path.resolve(root, args.judge)).replace(/^judge-/, '');
  const target = uniquePath(path.join(evaluationsDir, `judge-report-${stage}-${stamp}`), '.json');
  console.log(JSON.stringify(writeJudgeReport(target, null), null, 2));
} else {
  const report = buildReport();
  if (args['dry-run']) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    fs.mkdirSync(evaluationsDir, { recursive: true });
    const jsonPath = uniquePath(path.join(evaluationsDir, `evaluation-${stage}-${now}`), '.json');
    const mdPath = jsonPath.replace(/\.json$/, '.md');
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(mdPath, markdown(report));
    const written = { verdict: report.verdict, verdictReason: report.verdictReason, report: rel(jsonPath), markdown: rel(mdPath) };
    if (args.judge) Object.assign(written, writeJudgeReport(path.join(path.dirname(jsonPath), path.basename(jsonPath).replace(/^evaluation-/, 'judge-report-')), rel(jsonPath)));
    console.log(JSON.stringify(written, null, 2));
  }
  process.exitCode = { PASS: 0, REVIEW: 3, FAIL: 4 }[report.verdict];
}
