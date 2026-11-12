#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parser, inspect } from './source-evidence.mjs';
import { checkSourceEnumeration, checkRequirementGroups, checkJourneyProportionality, checkDataRequirements, groupProjections } from './traceability.mjs';

// Line endings never change meaning: a CRLF checkout (core.autocrlf=true) must validate like an LF one.
export const normalizeText = value => value.replace(/\r\n?/g, '\n');
// Extracted clauses and headings compare without the trailing line ending a CRLF extraction can leave behind.
export const normalizeClause = value => normalizeText(value).trim();
export const fingerprint = text => crypto.createHash('sha256').update(normalizeText(text)).digest('hex');
const text = value => typeof value === 'string' && value.trim().length > 0;
const precise = value => text(value) && !/^(?:TBD|Unassigned|missing prerequisites|blocked|not implemented|needs tests|pending|N\/A|unknown)$/i.test(value.trim());
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = values => [...values].sort();
// `Planned`: a journey is planned but no test is authored yet. It is valid only before test
// authoring completes; at the tests stage every obligation must be authored or carry a precise blocker.
const coverageStatuses = ['Planned', 'Covered', 'PartiallyCovered', 'Blocked', 'NotBrowserObservable', 'OutOfScope'];
export function rollup(children) {
  const statuses = children.map(c => c.coverageStatus);
  if (statuses.every(s => s === 'Covered')) return 'Covered';
  if (statuses.some(s => s === 'Covered' || s === 'PartiallyCovered')) return 'PartiallyCovered';
  if (new Set(statuses).size === 1) return statuses[0];
  // A real blocker outranks pending authoring; pending authoring outranks settled exclusions.
  if (statuses.includes('Planned') && !statuses.includes('Blocked')) return 'Planned';
  return 'Blocked';
}
export function projections(manifest) {
  return manifest.obligations.map(o => ({obligationId:o.obligationId, requirementId:o.requirementId,
    persona:o.persona, coverageStatus:o.coverageStatus, executionStatus:o.executionStatus,
    testIds:sorted(o.testIds), blocker:o.blocker || '', remediation:o.remediation || '', owner:o.owner || ''})).sort((a,b)=>a.obligationId.localeCompare(b.obligationId));
}

// Fingerprint of plan-owned content only. Fields the test generator is allowed to
// write -- statuses, test IDs, assertion evidence, mocking scope, reviews and the <!-- coverage-data --> projection
// blocks -- are excluded, so authoring tests cannot invalidate an approved plan, while any scope change does.
// Visible test-generator content in a plan (authoring status, assertion references, semantic review) lives in
// <!-- coverage-view:start --> ... <!-- coverage-view:end --> regions, which the fingerprint blanks like the
// hidden projection. Regions may not nest, must balance, and may not contain a level-1 or
// level-2 heading, so journey definitions cannot hide in them. A malformed plan is fingerprinted whole: any edit
// then voids approval, and validateCoverage reports the defect.
export const VIEW_START = '<!-- coverage-view:start -->';
export const VIEW_END = '<!-- coverage-view:end -->';
export function coverageViewProblems(content) {
  const markers = [...content.matchAll(/<!-- coverage-view:(start|end) -->/g)].map(m => ({ kind: m[1], index: m.index }));
  const problems = [];
  let open = null;
  for (const marker of markers) {
    if (marker.kind === 'start') { if (open) problems.push('nested coverage-view start'); open = marker; continue; }
    if (!open) { problems.push('coverage-view end without start'); continue; }
    if (/^#{1,2}\s/m.test(content.slice(open.index, marker.index))) problems.push('heading inside coverage-view region');
    open = null;
  }
  if (open) problems.push('coverage-view start without end');
  return problems;
}
const blankPlan = content => {
  const withoutData = content.replace(/<!-- coverage-data\s+[\s\S]*?\s*-->/g, '<!-- coverage-data -->');
  if (coverageViewProblems(withoutData).length) return withoutData;
  return withoutData.replace(/<!-- coverage-view:start -->[\s\S]*?<!-- coverage-view:end -->/g, `${VIEW_START}${VIEW_END}`);
};

const PLAN_OWNED_OBLIGATION_FIELDS = ['obligationId', 'requirementId', 'persona', 'preconditions', 'expectedBehavior', 'evidenceLayer', 'exclusionAuthority', 'plannedJourneys', 'dataRequirements'];
export function planFingerprint(root, manifest) {
  const read = relative => normalizeText(fs.readFileSync(path.resolve(root, relative), 'utf8'));
  const byId = (a, b) => a.obligationId.localeCompare(b.obligationId);
  const plans = [...manifest.artifacts.plans].sort((a, b) => a.path.localeCompare(b.path));
  return fingerprint(JSON.stringify({
    scope: manifest.scope ?? null,
    inventory: read(manifest.requirementsInventoryRef.path),
    requirements: sorted(manifest.requirements.map(r => r.requirementId)),
    obligations: [...manifest.obligations].sort(byId)
      .map(o => Object.fromEntries(PLAN_OWNED_OBLIGATION_FIELDS.filter(k => k in o).map(k => [k, o[k]]))),
    plans: plans.map(p => ({ path: p.path, obligationIds: sorted(p.obligationIds),
      content: blankPlan(read(p.path)) })),
  }));
}

// Stage and catalog for a coverage check of the current manifest. An approved plan with linked tests is checked at the
// tests stage. Otherwise it is the plan stage, which allows Planned obligations; but once any obligation links a test
// (for example a Draft re-plan after authoring), the real catalog is still required so those test IDs resolve.
export function coverageStage(manifest) {
  return manifest.review?.status === 'Approved' && manifest.obligations.some(o => o.testIds?.length) ? 'tests' : 'plan';
}
export const needsCatalog = manifest => manifest.obligations.some(o => o.testIds?.length);
export const catalogStub = manifest => ({ schemaVersion: '3.0', applicationId: manifest.applicationId, tests: [] });
// The repository's TypeScript package, used only as a parser.
export function findTypescript(root, setup) {
  const pkgDir = setup?.owningPackage || '.';
  return [path.join(root, pkgDir, 'node_modules/typescript/lib/typescript.js'), path.join(root, 'node_modules/typescript/lib/typescript.js')].find(p => fs.existsSync(p));
}

export function validateCoverage({root, requirements, manifest, catalog, typescript, stage}) {
  const errors = [], warnings = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  const resolve = relative => {
    if (!text(relative)) throw new Error('Missing file reference');
    const file = path.resolve(root, relative);
    const rel = path.relative(path.resolve(root), fs.realpathSync(file));
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`Reference escapes root: ${relative}`);
    return file;
  };
  const read = relative => normalizeText(fs.readFileSync(resolve(relative), 'utf8'));
  const ts = parser(root, typescript);
  const cache = new Map();
  const source = relative => {
    const file = resolve(relative);
    if (!cache.has(file)) cache.set(file, inspect(ts, file));
    return cache.get(file);
  };
  check(['1.0', '1.1'].includes(requirements.schemaVersion) && ['1.0', '1.1'].includes(manifest.schemaVersion), 'Unsupported coverage/inventory schema version');
  check(text(manifest.applicationId) && manifest.applicationId === catalog.applicationId, 'Application identity mismatch');
  for (const [label, rows, key] of [['authority', requirements.requirements, 'requirementId'], ['criteria', manifest.requirements, 'requirementId'], ['obligations', manifest.obligations, 'obligationId'], ['catalog', catalog.tests, 'testId']]) {
    // The catalog may be empty at the plan stage, before any test exists (setup-initial and adopt-existing).
    if (!Array.isArray(rows) || (!rows.length && label !== 'catalog')) throw new Error(`${label}: ${label === 'catalog' ? 'array' : 'non-empty array'} required`);
    check(rows.every(r => text(r[key])) && new Set(rows.map(r=>r[key])).size === rows.length, `${label}: duplicate or missing definitions`);
  }
  const expectedRequirements = requirements.requirements.map(r=>r.requirementId);
  const supporting = manifest.supportingTests || [];
  check(Array.isArray(supporting), 'supportingTests must be an array');
  const allTestIds = [...catalog.tests, ...supporting].map(t=>t.testId);
  check(allTestIds.every(text) && new Set(allTestIds).size === allTestIds.length, 'Duplicate or missing catalog/supporting test IDs');
  check(equal(sorted(expectedRequirements), sorted(manifest.requirements.map(r=>r.requirementId))), 'Missing or extra acceptance criteria');
  const expectedObligations = requirements.requirements.flatMap(r=>r.obligationIds || []);
  check(new Set(expectedObligations).size === expectedObligations.length, 'Duplicate authority obligation definitions');
  check(equal(sorted(expectedObligations), sorted(manifest.obligations.map(o=>o.obligationId))), 'Missing or extra obligations');
  for (const r of requirements.requirements) {
    check(text(r.storyId) && text(r.sourceText) && text(r.sourceReference?.heading) && Array.isArray(r.obligationIds) && r.obligationIds.length > 0, `${r.requirementId}: incomplete authority extraction`);
    const actual = read(r.sourceReference.path);
    check(actual.includes(normalizeClause(r.sourceReference.heading)) && actual.includes(normalizeClause(r.sourceText)),`${r.requirementId}: source text/heading does not resolve`);
    check(r.sourceFingerprint === fingerprint(actual), `${r.requirementId}: source changed; reassessment required`);
    const children = manifest.obligations.filter(o=>o.requirementId === r.requirementId);
    check(equal(sorted(r.obligationIds), sorted(children.map(o=>o.obligationId))), `${r.requirementId}: child obligations mismatch`);
    const parent = manifest.requirements.find(c=>c.requirementId === r.requirementId);
    check(parent?.coverageStatus === rollup(children), `${r.requirementId}: false coverage rollup`);
  }
  let unsupported = 0;
  for (const o of manifest.obligations) {
    const label = o.obligationId;
    const before = errors.length;
    check(expectedRequirements.includes(o.requirementId), `${label}: unknown requirement`);
    for (const field of ['persona','preconditions','expectedBehavior']) check(text(o[field]), `${label}: missing ${field}`);
    check(['BrowserMocked','BrowserIntegrated','API','Repository','Internal'].includes(o.evidenceLayer), `${label}: invalid evidence layer`);
    check(Array.isArray(o.mockingScope) && o.mockingScope.every(text), `${label}: explicit mocked calls required (empty array for none)`);
    check(!(o.evidenceLayer === 'BrowserIntegrated' && o.mockingScope?.length), `${label}: integrated claim replaces API behavior with mocks`);
    check(coverageStatuses.includes(o.coverageStatus), `${label}: invalid coverage status`);
    check(o.coverageStatus !== 'PartiallyCovered', `${label}: split partially covered obligations into independent children`);
    check(['NotRun','Passed','Failed','Skipped'].includes(o.executionStatus), `${label}: invalid execution status`);
    if (o.executionStatus !== 'NotRun') {
      check(text(o.resultReference), `${label}: execution claim lacks supplied evidence`);
      if (text(o.resultReference)) read(o.resultReference);
    } else check(!o.resultReference, `${label}: NotRun must not imply a result`);
    check(Array.isArray(o.testIds) && new Set(o.testIds).size === o.testIds.length, `${label}: test IDs must be a unique array`);
    check(Array.isArray(o.assertionReferences), `${label}: assertion references required`);
    if (o.coverageStatus === 'Planned') {
      check(stage !== 'tests', `${label}: Planned obligation left unauthored at the tests stage; author it or record a precise blocker`);
      check(!o.testIds?.length && !o.assertionReferences?.length && !o.review, `${label}: Planned obligation cannot carry test IDs, assertion evidence or a review`);
      check(o.executionStatus === 'NotRun', `${label}: Planned obligation cannot have an execution result`);
      check(Array.isArray(o.plannedJourneys) && o.plannedJourneys.length > 0, `${label}: Planned obligation names no planned journey`);
    } else if (o.coverageStatus !== 'Covered') {
      for (const field of ['blocker','remediation','owner','blockedActivity']) check(precise(o[field]), `${label}: precise ${field} required`);
      check(o.blocker !== o.remediation, `${label}: remediation merely repeats blocker`);
      if (o.coverageStatus === 'OutOfScope') check(text(o.exclusionAuthority), `${label}: exclusion authority required`);
      if (o.coverageStatus === 'NotBrowserObservable') check(!o.evidenceLayer.startsWith('Browser'), `${label}: observable obligation cannot be suppressed`);
    }
    if (o.coverageStatus === 'Covered') {
      check(o.testIds?.length > 0 && o.assertionReferences?.length > 0, `${label}: Covered without test/assertion evidence`);
      check(o.review?.status === 'Supported', `${label}: unsupported or unreviewed coverage claim`);
    }
    if (o.review || o.coverageStatus === 'Covered') {
      check(['Supported','Unsupported','Pending'].includes(o.review?.status), `${label}: invalid review status`);
      for (const field of ['trigger','input','action','assertions','limitations','reviewer']) check(precise(o.review?.[field]), `${label}: missing semantic review ${field}`);
    }
    for (const testId of o.testIds || []) {
      const browserEntry = catalog.tests.find(t=>t.testId === testId);
      const entry = browserEntry || supporting.find(t=>t.testId === testId);
      check(!!entry, `${label}: nonexistent test ${testId}`);
      if (!entry) continue;
      check(!!browserEntry || !o.evidenceLayer.startsWith('Browser'), `${label}: browser test must be in portal catalog`);
      check(entry.requirementReferences?.includes(o.requirementId), `${label}: catalog omits requirement for ${testId}`);
      const parsed = source(entry.automationReference.specPath);
      const record = parsed.records.find(r=>r.testId === testId);
      check(!!record, `${label}: source has no test ${testId}`);
      if (!record) continue;
      check((o.assertionReferences || []).some(a=>a.testId === testId), `${label}: test has no assertion reference ${testId}`);
      for (const ref of (o.assertionReferences || []).filter(a=>a.testId === testId)) {
        check(ref.testSourceFingerprint === fingerprint(parsed.source), `${label}: test source changed; review stale`);
        const evidenceSource = source(ref.path);
        const evidence = evidenceSource.evidence.get(ref.anchor);
        check(!!evidence, `${label}: nonexistent assertion ${ref.path}#${ref.anchor}`);
        if (!evidence) continue;
        check(ref.sourceFingerprint === fingerprint(evidenceSource.source), `${label}: assertion source changed; review stale`);
        if (resolve(ref.path) !== resolve(entry.automationReference.specPath) || !evidence.testIds.includes(testId)) {
          let called = false;
          const visit = n => { if (ts.isCallExpression(n) && n.expression.getText(parsed.tree) === evidence.helper) called = true; ts.forEachChild(n, visit); };
          visit(record.body);
          const imported = resolve(ref.path) === resolve(entry.automationReference.specPath) || parsed.imports.some(i => i.startsWith('.') && ['', '.ts','.tsx','.js'].some(ext => path.resolve(path.dirname(resolve(entry.automationReference.specPath)), i + ext) === resolve(ref.path)));
          check(evidence.helper && called && imported, `${label}: assertion is not in test or a directly called imported/local helper`);
        }
      }
    }
    for (const ref of o.assertionReferences || []) check(o.testIds.includes(ref.testId), `${label}: orphan assertion test ID`);
    if (errors.length > before && o.coverageStatus === 'Covered') unsupported++;
  }
  // Catalog scope is limited to authoritative requirements; unrelated entries are preserved.
  for (const entry of [...catalog.tests, ...supporting]) for (const id of entry.requirementReferences || []) {
    if (expectedRequirements.includes(id)) check(manifest.obligations.some(o=>o.requirementId === id && o.testIds.includes(entry.testId)), `${entry.testId}: unsupported catalog requirement mapping ${id}`);
  }
  const projected = projections(manifest);
  const compareDocument = (relative, expected, label) => {
    const matches = [...read(relative).matchAll(/<!-- coverage-data\s+([\s\S]*?)\s*-->/g)];
    check(matches.length === 1, `${label}: one coverage-data projection required`);
    if (matches.length === 1) check(equal(JSON.parse(matches[0][1]), expected), `${label}: projection differs from manifest`);
  };
  if (!manifest.artifacts) check(false, 'Missing plan/ledger/gap artifacts');
  else {
    compareDocument(manifest.artifacts.ledger, projected, 'ledger');
    if ((requirements.requirementGroups || []).length) {
      const matches = [...read(manifest.artifacts.ledger).matchAll(/<!-- coverage-groups\s+([\s\S]*?)\s*-->/g)];
      check(matches.length === 1, 'ledger: one coverage-groups projection required');
      if (matches.length === 1) check(equal(JSON.parse(matches[0][1]), groupProjections(requirements, manifest)), 'ledger: coverage-groups projection differs from manifest');
    }
    compareDocument(manifest.artifacts.gaps, projected.filter(o=>o.coverageStatus !== 'Covered'), 'gap register');
    const plans = manifest.artifacts.plans || [];
    check(equal(sorted(plans.flatMap(p=>p.obligationIds)), sorted(expectedObligations)), 'Plans omit or duplicate obligations');
    for (const p of plans) {
      compareDocument(p.path, projected.filter(o=>p.obligationIds.includes(o.obligationId)), `plan ${p.path}`);
      for (const problem of coverageViewProblems(read(p.path))) check(false, `plan ${p.path}: malformed coverage-view region (${problem})`);
    }
    for (const entry of catalog.tests.filter(t=>t.requirementReferences?.some(r=>expectedRequirements.includes(r)))) {
      check(plans.some(p=>p.path === entry.planReference && manifest.obligations.some(o=>o.testIds.includes(entry.testId) && p.obligationIds.includes(o.obligationId))), `${entry.testId}: catalog plan reference disagrees`);
    }
  }
  checkSourceEnumeration({ requirements, manifest, read, check, precise });
  const trace = checkRequirementGroups({ requirements, manifest, read, check, precise, rollup });
  checkJourneyProportionality({ requirements, manifest, read, check });
  checkDataRequirements({ manifest, read, check });
  const browser = manifest.obligations.filter(o=>o.evidenceLayer.startsWith('Browser'));
  const counts = {sourceIdentifiers:trace.discovered, tracedIdentifiers:trace.traced, identifierTraceability:trace.applicable,stories:new Set(requirements.requirements.map(r=>r.storyId)).size, acceptanceCriteria:expectedRequirements.length,
    obligations:expectedObligations.length, browserObservable:browser.length,
    browserReviewed:browser.filter(o=>o.coverageStatus === 'Covered' && o.review?.status === 'Supported').length,
    blockedBrowser:browser.filter(o=>!['Covered','OutOfScope','Planned'].includes(o.coverageStatus)).length,
    plannedBrowser:browser.filter(o=>o.coverageStatus === 'Planned').length,
    plannedObligations:manifest.obligations.filter(o=>o.coverageStatus === 'Planned').length,
    nonBrowserAuthored:manifest.obligations.filter(o=>!o.evidenceLayer.startsWith('Browser') && o.coverageStatus === 'Covered').length,
    nonBrowserAwaitingEvidence:manifest.obligations.filter(o=>!o.evidenceLayer.startsWith('Browser') && !['Covered','OutOfScope'].includes(o.coverageStatus)).length,
    unsupportedClaims:unsupported, unaccountedObligations:expectedObligations.filter(id=>!manifest.obligations.some(o=>o.obligationId === id)).length};
  return {valid:errors.length === 0, errors, warnings, counts, executionStatuses:[...new Set(manifest.obligations.map(o=>o.executionStatus))]};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = Object.fromEntries(process.argv.slice(2).reduce((rows, v, i, all) => i % 2 ? rows : [...rows, [v.replace(/^--/,''), all[i+1]]], []));
    for (const key of ['root','requirements','manifest','catalog']) if (!args[key]) throw new Error(`Missing --${key}`);
    if (args.stage && !['plan','tests'].includes(args.stage)) throw new Error('--stage must be plan or tests');
    const json = file => JSON.parse(fs.readFileSync(path.resolve(args.root,file),'utf8'));
    const result = validateCoverage({...args, requirements:json(args.requirements), manifest:json(args.manifest), catalog:json(args.catalog)});
    console.log(JSON.stringify(result,null,2)); process.exitCode = result.valid ? 0 : 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
