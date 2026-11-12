#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { validateCoverage } from './validate-coverage.mjs';

function args(argv) {
  const result = {};
  for (let i = 2; i < argv.length; i += 2) result[argv[i].replace(/^--/, '')] = argv[i + 1];
  return result;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function remediation(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    nonEmpty(value.action) && nonEmpty(value.owner) &&
    Object.keys(value).every((key) => key === 'action' || key === 'owner');
}

function tableRows(markdown, heading) {
  const start = markdown.indexOf(heading);
  if (start < 0) return [];
  const section = markdown.slice(start + heading.length).split(/\n##\s/)[0];
  return section.split(/\r?\n/)
    .filter((line) => /^\|.*\|$/.test(line.trim()))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.length && !cells.every((cell) => /^-+$/.test(cell)));
}

const options = args(process.argv);
for (const required of ['catalog', 'schema', 'inventory']) {
  if (!options[required]) {
    console.error('Usage: validate-catalog.mjs --catalog <json> --schema <json> --inventory <json> [--docs-root <dir>]');
    process.exit(2);
  }
}

const catalog = readJson(options.catalog);
const schema = readJson(options.schema);
const inventory = readJson(options.inventory);
const errors = [];
const add = (condition, message) => { if (!condition) errors.push(message); };

add(schema.$schema === 'https://json-schema.org/draft/2020-12/schema', 'Schema must use draft 2020-12');
add(!/__[A-Z0-9_]+__/.test(JSON.stringify(schema)), 'Schema contains unreplaced template sentinels');
add(catalog.schemaVersion === '3.0', 'schemaVersion must be 3.0');
add(nonEmpty(catalog.applicationId), 'applicationId must be non-empty');
add(nonEmpty(catalog.applicationDisplayName), 'applicationDisplayName must be non-empty');
add(/^\d{8}\.3\.0$/.test(catalog.catalogVersion || ''), 'catalogVersion must match YYYYMMDD.3.0');
add(Array.isArray(catalog.tests) && catalog.tests.length > 0, 'tests must be a non-empty array');

const catalogIds = new Set();
const automationRefs = new Set();
for (const [index, test] of (catalog.tests || []).entries()) {
  const label = `tests[${index}]`;
  for (const field of ['testId', 'journeyId', 'planReference', 'storyReference', 'featureReference',
    'businessTitle', 'businessDescription', 'expectedOutcome', 'businessPersona', 'runtimeAuthProfile']) {
    add(nonEmpty(test[field]), `${label}.${field} must be non-empty`);
  }
  add(!catalogIds.has(test.testId), `${label}.testId is duplicated: ${test.testId}`);
  catalogIds.add(test.testId);
  add(test.automationReference?.testId === test.testId, `${label} automation testId must match testId`);
  const automationKey = `${test.automationReference?.specPath || ''}#${test.testId}`;
  add(!automationRefs.has(automationKey), `${label} automationReference is duplicated`);
  automationRefs.add(automationKey);
  add(Array.isArray(test.requirementReferences) && test.requirementReferences.length > 0,
    `${label}.requirementReferences must be non-empty`);
  add(Array.isArray(test.browserApplicability) && test.browserApplicability.length > 0,
    `${label}.browserApplicability must be non-empty`);
  add(Array.isArray(test.environmentApplicability) && test.environmentApplicability.length > 0,
    `${label}.environmentApplicability must be non-empty`);
  add(typeof test.roleSensitive === 'boolean', `${label}.roleSensitive must be boolean`);
  add(test.roleSensitive ? nonEmpty(test.requiredAccessProfile) : test.requiredAccessProfile === undefined,
    `${label}.requiredAccessProfile must exist only for role-sensitive tests`);

  const exclusionRequired = test.portalEligible === false;
  add(exclusionRequired ? nonEmpty(test.portalExclusionReason) && remediation(test.portalExclusionRemediation)
    : (test.portalExclusionReason === undefined || test.portalExclusionReason === null) && test.portalExclusionRemediation === undefined,
  `${label} portal exclusion reason/remediation pairing is invalid`);

  const readinessRequired = test.executionReadiness !== 'Ready';
  add(readinessRequired ? nonEmpty(test.readinessReason) && remediation(test.readinessRemediation)
    : test.readinessReason === undefined && test.readinessRemediation === undefined,
  `${label} readiness reason/remediation pairing is invalid`);

  const statusRequired = test.status === 'Disabled' || test.status === 'Deprecated';
  add(statusRequired ? nonEmpty(test.statusReason) && remediation(test.statusRemediation)
    : test.statusReason === undefined && test.statusRemediation === undefined,
  `${label} status reason/remediation pairing is invalid`);

  if (nonEmpty(test.planReference)) add(fs.existsSync(path.resolve(test.planReference)), `${label} planReference does not resolve`);
}

const inventoryIds = new Set((inventory.tests || []).map((test) => test.testId));
add((inventory.ambiguities || []).length === 0, 'Inventory contains ambiguous test declarations');
add((inventory.duplicateTestIds || []).length === 0, 'Inventory contains duplicate test IDs');
for (const id of inventoryIds) add(catalogIds.has(id), `Inventory test has no catalog entry: ${id}`);
for (const id of catalogIds) add(inventoryIds.has(id), `Catalog entry has no inventoried test: ${id}`);
for (const test of catalog.tests || []) {
  const item = (inventory.tests || []).find(t => t.testId === test.testId);
  if (!item) continue;
  for (const field of ['journeyId', 'portalEligible']) add(test[field] === item[field], `${test.testId}: source/catalog ${field} mismatch`);
  add(path.resolve(test.automationReference?.specPath || '') === path.resolve(item.specPath || ''), `${test.testId}: source/catalog specPath mismatch`);
}

// Opt-in companion validation keeps the v3 portal schema/legacy CLI compatible. Hardened coverage
// claims require this check (or a separate validate-coverage call), never catalog-only success.
add(Boolean(options.requirements) === Boolean(options.manifest), 'Supply both --requirements and --manifest');
if (options.requirements && options.manifest) {
  try {
    const coverage = validateCoverage({root:options.root || process.cwd(), requirements:readJson(options.requirements), manifest:readJson(options.manifest), catalog, typescript:options.typescript});
    errors.push(...coverage.errors);
  } catch (error) { errors.push(error.message); }
}

if (options['docs-root']) {
  const docsRoot = path.resolve(options['docs-root']);
  const ledgerPath = path.join(docsRoot, 'coverage-ledger.md');
  const gapPath = path.join(docsRoot, 'gap-register.md');
  add(fs.existsSync(ledgerPath), 'coverage-ledger.md is missing');
  add(fs.existsSync(gapPath), 'gap-register.md is missing');
  if (fs.existsSync(ledgerPath) && fs.existsSync(gapPath)) {
    const ledger = fs.readFileSync(ledgerPath, 'utf8');
    const gap = fs.readFileSync(gapPath, 'utf8');
    add(/Uncovered without a recorded reason:\s*0\b/.test(ledger), 'Ledger uncovered-without-reason count is not zero');
    const coverage = tableRows(ledger, '## Criterion/persona coverage').slice(1);
    const gaps = tableRows(gap, '## Gaps').slice(1);
    const coverageKeys = new Set();
    const expectedGapKeys = new Set();
    for (const row of coverage) {
      const key = row.slice(0, 3).join('|');
      add(!coverageKeys.has(key), `Duplicate criterion/persona ledger row: ${key}`);
      coverageKeys.add(key);
      if (row[5] === 'Planned') {
        // Pending authoring, not a blocker: the row must name the planned journeys instead.
        add(nonEmpty(row[3]) && nonEmpty(row[4]), `Planned ledger row lacks journeys/plan: ${key}`);
        expectedGapKeys.add(key);
      } else if (row[5] !== 'Covered') {
        add(nonEmpty(row[6]) && nonEmpty(row[7]) && nonEmpty(row[8]), `Ledger gap lacks blocker/remediation/owner: ${key}`);
        expectedGapKeys.add(key);
      }
    }
    const actualGapKeys = new Set(gaps.map((row) => row.slice(0, 3).join('|')));
    for (const key of expectedGapKeys) add(actualGapKeys.has(key), `Gap register is missing: ${key}`);
    for (const key of actualGapKeys) add(expectedGapKeys.has(key), `Gap register has no matching ledger row: ${key}`);
  }
}

if (errors.length) {
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Catalog valid: ${catalog.tests.length} entries synchronized with ${inventory.tests.length} tests. ${options.manifest ? 'Companion accounting checked; semantic review still required.' : 'Coverage completeness and semantic support were not checked.'}`);
