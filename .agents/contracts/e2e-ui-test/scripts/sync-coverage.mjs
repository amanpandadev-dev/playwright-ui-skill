#!/usr/bin/env node
// Deterministic coverage bookkeeping for e2e-ui-test-plan-generator, e2e-ui-test-generator and e2e-ui-test-verify-run. The coverage manifest
// is the single source of truth: this script applies obligation edits to it, records assertion evidence with computed
// fingerprints, rolls statuses up to criteria and requirement groups, and rebuilds every derived view: the
// coverage-data projections in the ledger, gap register and plans, the ledger's coverage-groups projection, and the
// known status cells of tables inside coverage-view regions. Then it validates coverage. Never hand-edit these; run this.
// Static only: reads and writes JSON and Markdown, never runs tests.
//
//   node sync-coverage.mjs --skill <e2e-ui-test-plan-generator|e2e-ui-test-generator|e2e-ui-test-verify-run> --root <repo> --docs-root <dir>
//        [--patch <patch.json>] [--catalog <catalog>] [--typescript <typescript.js>] [--refresh-refs] [--dry-run]
//
// Patch (outside the repository, or git-ignored):
//   {"obligations": [{"obligationId": "...", "set": {"field": value, "other": null}, "evidence": [{"testId", "path", "anchor"}]}]}
// `set` replaces fields and null removes one. `evidence` replaces assertionReferences (an empty array clears them); new
// evidence needs a `review` in the same `set`, and its fingerprints are computed here. e2e-ui-test-generator may set only the fields it owns, never Planned, and
// its run must leave the plan fingerprint unchanged. e2e-ui-test-verify-run (through record-execution.mjs) may set only
// executionStatus and resultReference, and its run must also leave the plan fingerprint unchanged.
// --refresh-refs (plan generator only) re-fingerprints setupDecisionsRef and requirementsInventoryRef. Running with no patch rebuilds the derived data only, and a run over
// unchanged documents writes nothing.
// Exit codes: 0 synced and coverage valid, 1 usage error or coverage invalid after syncing, 2 patch refused (nothing written).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateCoverage, fingerprint, normalizeText, rollup, projections, planFingerprint, coverageViewProblems,
  coverageStage, needsCatalog, catalogStub, findTypescript, VIEW_START, VIEW_END } from './validate-coverage.mjs';
import { groupProjections } from './traceability.mjs';

const PLAN = 'e2e-ui-test-plan-generator';
const TEST = 'e2e-ui-test-generator';
const VERIFY = 'e2e-ui-test-verify-run';
// Obligation fields the test generator writes; everything else is plan-owned (and most of it fingerprinted at Gate A).
// Execution evidence, recorded separately from authored coverage.
export const VERIFY_FIELDS = ['executionStatus', 'resultReference'];
export const GENERATOR_FIELDS = ['coverageStatus', 'testIds', 'mockingScope', 'review', 'blocker', 'remediation', 'owner', 'blockedActivity', 'claimedTests'];
const EVIDENCE = /\/\/\s*@e2e-evidence\s+([\w.-]+)/g;

// ---------------------------------------------------------------- manifest layout
// Keep the file's own layout so a sync diff shows only changed values. The tab layout puts each top-level key on
// one line and each array element (obligation, criterion, group) on its own line.
function tabRows(value) {
  const keys = Object.keys(value);
  const out = ['{'];
  keys.forEach((key, i) => {
    const v = value[key];
    const comma = i < keys.length - 1 ? ',' : '';
    if (Array.isArray(v) && v.length && v.every(x => x && typeof x === 'object' && !Array.isArray(x))) {
      out.push(`\t${JSON.stringify(key)}: [`);
      v.forEach((x, j) => out.push(`\t\t${JSON.stringify(x)}${j < v.length - 1 ? ',' : ''}`));
      out.push(`\t]${comma}`);
    } else out.push(`\t${JSON.stringify(key)}: ${JSON.stringify(v)}${comma}`);
  });
  out.push('}');
  return `${out.join('\n')}\n`;
}
const LAYOUTS = [tabRows, v => `${JSON.stringify(v, null, 2)}\n`, v => `${JSON.stringify(v, null, '\t')}\n`, v => `${JSON.stringify(v, null, 4)}\n`];
export function manifestLayout(original) {
  const text = normalizeText(original);
  const value = JSON.parse(text);
  for (const layout of LAYOUTS) {
    if (layout(value) === text) return layout;
    if (layout(value).replace(/\n$/, '') === text) return v => layout(v).replace(/\n$/, '');
  }
  return null;
}

// ---------------------------------------------------------------- Markdown views
const eolOf = content => (content.includes('\r\n') ? '\r\n' : '\n');
const withEol = (value, eol) => (eol === '\n' ? value : value.replace(/\n/g, eol));

// Replaces the JSON inside the one <!-- <name> ... --> block, or appends the block when the document has none.
export function setProjection(content, name, rows) {
  const pattern = new RegExp(`<!-- ${name}\\s+([\\s\\S]*?)\\s*-->`, 'g');
  const matches = [...content.matchAll(pattern)];
  const eol = eolOf(content);
  if (matches.length > 1) throw new Error(`more than one ${name} block`);
  if (!matches.length) return `${content.replace(/\s*$/, '')}${eol}${eol}<!-- ${name}${eol}${JSON.stringify(rows)}${eol}-->${eol}`;
  const [whole, inner] = matches[0];
  try { if (JSON.stringify(JSON.parse(inner)) === JSON.stringify(rows)) return content; } catch { /* malformed block: rewrite it */ }
  const json = inner.includes('\n') ? withEol(JSON.stringify(rows, null, 2), eol) : JSON.stringify(rows);
  const start = matches[0].index + whole.indexOf(inner);
  return `${content.slice(0, start)}${json}${content.slice(start + inner.length)}`;
}

// Table columns inside coverage-view regions that mirror manifest fields. Other columns are left as they are.
const KEY_COLUMNS = ['obligation id', 'obligation', 'criterion id', 'criterion'];
const VALUE_COLUMNS = {
  'status': o => o.coverageStatus, 'coverage status': o => o.coverageStatus, 'classification': o => o.coverageStatus,
  'blocker': o => o.blocker || '', 'blocker / reason': o => o.blocker || '',
  'remediation': o => o.remediation || '', 'remediation action': o => o.remediation || '', 'owner': o => o.owner || '',
  'test ids': o => [...(o.testIds || [])].sort().join(', '), 'tests': o => [...(o.testIds || [])].sort().join(', '),
};
const splitCells = row => row.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/);
const cellValue = value => String(value).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');

export function updateViewCells(content, byId) {
  if (coverageViewProblems(content).length) return { content, cells: 0 };
  const eol = eolOf(content);
  const lines = content.split(eol);
  let inView = false;
  let columns = null;
  let cells = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes(VIEW_START)) { inView = true; columns = null; }
    if (line.includes(VIEW_END)) { inView = false; columns = null; continue; }
    if (!inView) continue;
    if (!line.trim().startsWith('|')) { columns = null; continue; }
    if (!columns) {
      if (/^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(lines[i + 1] || '')) columns = splitCells(line).map(c => c.trim().toLowerCase());
      continue;
    }
    if (/^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(line)) continue;
    const raw = splitCells(line);
    const keyIndex = columns.findIndex((c, k) => KEY_COLUMNS.includes(c) && byId.has(raw[k]?.trim().replace(/`/g, '')));
    if (keyIndex < 0) continue;
    const obligation = byId.get(raw[keyIndex].trim().replace(/`/g, ''));
    let changed = false;
    columns.forEach((c, k) => {
      if (!VALUE_COLUMNS[c] || raw[k] === undefined) return;
      const expected = cellValue(VALUE_COLUMNS[c](obligation));
      if (raw[k].trim() === expected) return;
      raw[k] = ` ${expected} `;
      changed = true;
      cells++;
    });
    if (changed) {
      const indent = line.match(/^\s*/)[0];
      lines[i] = `${indent}|${raw.join('|')}|`;
    }
  }
  return { content: lines.join(eol), cells };
}

// ---------------------------------------------------------------- patch
function applyPatch({ manifest, patch, skill, root, catalog, refuse }) {
  const byId = new Map(manifest.obligations.map(o => [o.obligationId, o]));
  const touched = [];
  if (patch.obligations !== undefined && !Array.isArray(patch.obligations)) { refuse('patch: "obligations" must be an array'); return touched; }
  for (const entry of patch.obligations || []) {
    const id = entry?.obligationId;
    const o = byId.get(id);
    if (!o) { refuse(`patch: unknown obligation ${id}`); continue; }
    const set = entry.set || {};
    for (const key of Object.keys(entry)) if (!['obligationId', 'set', 'evidence'].includes(key)) refuse(`patch ${id}: unknown key "${key}" (use obligationId, set, evidence)`);
    for (const key of Object.keys(set)) {
      if (key === 'obligationId') refuse(`patch ${id}: obligationId cannot change`);
      else if (key === 'assertionReferences') refuse(`patch ${id}: record assertionReferences with "evidence" so their fingerprints are computed`);
      else if (skill === TEST && !GENERATOR_FIELDS.includes(key)) refuse(`patch ${id}: ${key} belongs to ${PLAN}; ask it for a re-plan`);
      else if (skill === VERIFY && !VERIFY_FIELDS.includes(key)) refuse(`patch ${id}: ${VERIFY} records execution only (${VERIFY_FIELDS.join(', ')}), not ${key}`);
    }
    if (skill === TEST && set.coverageStatus === 'Planned') refuse(`patch ${id}: ${TEST} never sets Planned; author the obligation or record a precise blocker`);
    if (skill === VERIFY && entry.evidence !== undefined) refuse(`patch ${id}: ${VERIFY} never records assertion evidence`);
    if (entry.evidence?.length && !set.review) refuse(`patch ${id}: evidence needs the semantic review of the current test in the same patch ("set.review")`);
    const next = { ...o };
    for (const [key, value] of Object.entries(set)) { if (value === null) delete next[key]; else next[key] = value; }
    if (entry.evidence !== undefined) {
      if (!Array.isArray(entry.evidence)) { refuse(`patch ${id}: evidence must be an array`); continue; }
      next.assertionReferences = entry.evidence.map(ref => {
        const test = [...catalog.tests, ...(manifest.supportingTests || [])].find(t => t.testId === ref.testId);
        if (!test) { refuse(`patch ${id}: test ${ref.testId} is in neither the catalog nor supportingTests; add its catalog entry first`); return ref; }
        const evidenceFile = path.resolve(root, ref.path || '');
        const specFile = path.resolve(root, test.automationReference.specPath);
        if (!ref.path || !fs.existsSync(evidenceFile)) { refuse(`patch ${id}: evidence file ${ref.path} not found`); return ref; }
        if (!fs.existsSync(specFile)) { refuse(`patch ${id}: spec ${test.automationReference.specPath} for ${ref.testId} not found`); return ref; }
        const evidenceText = fs.readFileSync(evidenceFile, 'utf8');
        if (![...evidenceText.matchAll(EVIDENCE)].some(m => m[1] === ref.anchor)) refuse(`patch ${id}: ${ref.path} has no "// @e2e-evidence ${ref.anchor}" anchor`);
        return { testId: ref.testId, path: ref.path, anchor: ref.anchor,
          sourceFingerprint: fingerprint(evidenceText), testSourceFingerprint: fingerprint(fs.readFileSync(specFile, 'utf8')) };
      });
    }
    // Evidence quality bar: Covered only with test IDs, evidence and a Supported semantic review.
    if (next.coverageStatus === 'Covered') {
      if (next.review?.status !== 'Supported') refuse(`patch ${id}: Covered requires review.status "Supported" (is ${next.review?.status ?? 'absent'})`);
      if (!next.testIds?.length || !next.assertionReferences?.length) refuse(`patch ${id}: Covered requires testIds and evidence`);
      if (o.coverageStatus !== 'Covered' && !set.review) refuse(`patch ${id}: moving to Covered needs the semantic review in the same patch ("set.review")`);
    }
    Object.keys(o).forEach(k => delete o[k]);
    Object.assign(o, next);
    touched.push(id);
  }
  return touched;
}

// ---------------------------------------------------------------- rollups
export function rollUp(manifest, inventory) {
  const statusOf = new Map();
  for (const r of inventory.requirements) {
    const children = manifest.obligations.filter(o => o.requirementId === r.requirementId);
    if (children.length) statusOf.set(r.requirementId, rollup(children));
  }
  manifest.requirements = manifest.requirements || [];
  for (const row of manifest.requirements) if (statusOf.has(row.requirementId)) row.coverageStatus = statusOf.get(row.requirementId);
  for (const r of inventory.requirements) {
    if (!manifest.requirements.some(row => row.requirementId === r.requirementId) && statusOf.has(r.requirementId)) {
      manifest.requirements.push({ requirementId: r.requirementId, coverageStatus: statusOf.get(r.requirementId) });
    }
  }
  const groups = inventory.requirementGroups || [];
  if (!groups.length) return;
  manifest.requirementGroups = manifest.requirementGroups || [];
  const criterionStatus = new Map(manifest.requirements.map(r => [r.requirementId, r]));
  for (const g of groups) {
    const members = g.requirementIds.map(id => criterionStatus.get(id)).filter(Boolean);
    if (!g.requirementIds.length || members.length !== g.requirementIds.length) continue; // no-criterion groups keep their recorded status
    const row = manifest.requirementGroups.find(x => x.groupId === g.groupId);
    if (row) row.coverageStatus = rollup(members);
    else manifest.requirementGroups.push({ groupId: g.groupId, coverageStatus: rollup(members) });
  }
}

// ---------------------------------------------------------------- CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const key = process.argv[i].replace(/^--/, '');
    const next = process.argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true; else { args[key] = next; i++; }
  }
  const usage = message => { console.error(`sync-coverage: ${message}`); process.exit(1); };
  try {
    if (![PLAN, TEST, VERIFY].includes(args.skill)) usage(`--skill must be ${PLAN}, ${TEST} or ${VERIFY}`);
    if (!args.root || !args['docs-root']) usage('--root and --docs-root are required');
    if (args['refresh-refs'] && args.skill !== PLAN) usage(`--refresh-refs is for ${PLAN} only; a changed setup or inventory needs a re-plan`);
    const root = path.resolve(args.root);
    const docsAbs = path.resolve(root, args['docs-root']);
    const rel = file => path.relative(root, file).split(path.sep).join('/');
    const read = relative => fs.readFileSync(path.resolve(root, relative), 'utf8');
    const manifestFile = path.join(docsAbs, 'coverage-manifest.json');
    if (!fs.existsSync(manifestFile)) usage(`${rel(manifestFile)} not found; ${PLAN} writes the manifest first`);
    const originalManifest = fs.readFileSync(manifestFile, 'utf8');
    const layout = manifestLayout(originalManifest);
    if (!layout) usage(`${rel(manifestFile)} has an unrecognised layout; reformat it with 2-space JSON once, then sync`);
    const manifest = JSON.parse(normalizeText(originalManifest));
    const setupFile = path.resolve(root, manifest.setupDecisionsRef?.path || rel(path.join(docsAbs, 'setup-decisions.json')));
    const setup = fs.existsSync(setupFile) ? JSON.parse(normalizeText(fs.readFileSync(setupFile, 'utf8'))) : null;
    const inventory = JSON.parse(normalizeText(read(manifest.requirementsInventoryRef.path)));
    const typescript = args.typescript ? path.resolve(args.typescript) : findTypescript(root, setup);
    if (!typescript && !args['dry-run']) usage('no TypeScript parser found under the owning package or the repository root; pass --typescript');
    const catalogFile = path.resolve(root, typeof args.catalog === 'string' ? args.catalog : setup?.catalogPath || path.posix.join(setup?.testDir || 'tests/e2e', 'test-catalog.json'));
    const catalog = fs.existsSync(catalogFile) ? JSON.parse(normalizeText(fs.readFileSync(catalogFile, 'utf8'))) : catalogStub(manifest);

    const refusals = [];
    const refuse = message => refusals.push(message);
    let patched = [];
    if (args.patch) {
      const patchFile = path.resolve(args.patch);
      const inside = !path.relative(root, patchFile).startsWith('..') && !path.isAbsolute(path.relative(root, patchFile));
      if (inside && spawnSync('git', ['-C', root, 'check-ignore', '-q', '--', rel(patchFile)]).status !== 0) {
        refuse(`patch ${rel(patchFile)} is inside the repository and not git-ignored; keep review input outside the repository`);
      }
      patched = applyPatch({ manifest, patch: JSON.parse(normalizeText(fs.readFileSync(patchFile, 'utf8'))), skill: args.skill, root, catalog, refuse });
    }
    if (args['refresh-refs']) {
      manifest.setupDecisionsRef = { ...manifest.setupDecisionsRef, path: rel(setupFile), fingerprint: fingerprint(fs.readFileSync(setupFile, 'utf8')) };
      manifest.requirementsInventoryRef = { ...manifest.requirementsInventoryRef, fingerprint: fingerprint(read(manifest.requirementsInventoryRef.path)) };
    }
    rollUp(manifest, inventory);

    // Derived documents, computed in memory before anything is written.
    const writes = new Map();
    const notes = new Map();
    const stage = (file, content, note) => {
      const original = writes.has(file) ? writes.get(file).original : fs.readFileSync(file, 'utf8');
      writes.set(file, { original, content });
      if (note) notes.set(file, [...(notes.get(file) || []), note]);
    };
    const nextManifest = layout(manifest);
    stage(manifestFile, eolOf(originalManifest) === '\n' ? nextManifest : withEol(nextManifest, '\r\n'));
    const rows = projections(manifest);
    const byId = new Map(manifest.obligations.map(o => [o.obligationId, o]));
    const documents = [
      { file: manifest.artifacts.ledger, rows, groups: (inventory.requirementGroups || []).length ? groupProjections(inventory, manifest) : null },
      { file: manifest.artifacts.gaps, rows: rows.filter(r => r.coverageStatus !== 'Covered') },
      ...manifest.artifacts.plans.map(p => ({ file: p.path, rows: rows.filter(r => p.obligationIds.includes(r.obligationId)) })),
    ];
    for (const doc of documents) {
      const file = path.resolve(root, doc.file);
      if (!fs.existsSync(file)) { refuse(`${doc.file} is listed in the manifest artifacts but does not exist`); continue; }
      let content = fs.readFileSync(file, 'utf8');
      try {
        content = setProjection(content, 'coverage-data', doc.rows);
        if (doc.groups) content = setProjection(content, 'coverage-groups', doc.groups);
      } catch (error) { refuse(`${doc.file}: ${error.message}`); continue; }
      const view = updateViewCells(content, byId);
      stage(file, view.content, view.cells ? `${view.cells} coverage-view cell(s)` : null);
    }
    if (refusals.length) {
      refusals.forEach(r => console.log(`REFUSED ${r}`));
      console.log('Nothing was written.');
      process.exit(2);
    }

    const changed = [...writes].filter(([, w]) => w.content !== w.original);
    const label = args['dry-run'] ? 'would change' : 'changed';
    console.log(`sync-coverage (${args.skill}): ${patched.length} obligation(s) patched${patched.length ? ` (${patched.join(', ')})` : ''}`);
    for (const [file] of changed) console.log(`  ${label} ${rel(file)}${notes.has(file) ? ` (${notes.get(file).join(', ')})` : ''}`);
    if (!changed.length) console.log('  no changes: every derived view already matches the manifest');
    if (args['dry-run']) process.exit(0);

    const before = planFingerprint(root, JSON.parse(normalizeText(originalManifest)));
    for (const [file, w] of changed) fs.writeFileSync(file, w.content);
    const after = planFingerprint(root, manifest);
    if (before !== after) {
      if (args.skill !== PLAN) {
        for (const [file, w] of changed) fs.writeFileSync(file, w.original);
        console.log(`REFUSED the sync would change the approved plan fingerprint; ${args.skill} changes only coverage data. Nothing was written.`);
        process.exit(2);
      }
      console.log(`Plan fingerprint changed${manifest.review?.status === 'Approved' ? '; the plan needs Gate A re-approval' : ''}.`);
    } else console.log('Plan fingerprint unchanged.');

    const coverageStageName = coverageStage(manifest);
    const result = validateCoverage({ root, requirements: inventory, manifest, typescript, stage: coverageStageName,
      catalog: needsCatalog(manifest) ? catalog : catalogStub(manifest) });
    if (result.valid) console.log(`Coverage (${coverageStageName} stage): PASS`);
    else {
      console.log(`Coverage (${coverageStageName} stage): FAIL, ${result.errors.length} error(s)`);
      result.errors.slice(0, 20).forEach(e => console.log(`  - ${e}`));
      if (result.errors.length > 20) console.log(`  ... ${result.errors.length - 20} more`);
    }
    process.exitCode = result.valid ? 0 : 1;
  } catch (error) { console.error(`sync-coverage: ${error.message}`); process.exitCode = 1; }
}
