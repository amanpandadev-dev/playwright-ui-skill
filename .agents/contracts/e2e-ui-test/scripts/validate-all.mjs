#!/usr/bin/env node
// One static validation entry point for a repository's E2E setup.
// Generated `e2e:validate` scripts call this, so coverage completeness can never be silently skipped.
// Static only: parsers and validators, never Playwright, the application, authentication or workflows.
//
//   node .agents/contracts/e2e-ui-test/scripts/validate-all.mjs --docs-root <dir> [--root <repo>] [--typescript <typescript.js>]
//
// Steps: setup conformance, test inventory, catalog, config module format, coverage (stage inferred from the
// manifest review status). A missing coverage manifest is a failure, not a skip: without it, completeness is
// not checked. Exit code 0 when every step passes, 1 otherwise.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifySetup } from './check-setup.mjs';
import { coverageStage, needsCatalog, catalogStub, findTypescript } from './validate-coverage.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i].replace(/^--/, '');
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[key] = true; else { args[key] = next; i++; }
}
if (!args['docs-root']) { console.error('validate-all: --docs-root is required'); process.exit(1); }

// Generated scripts run from the owning package; find the repository root that contains the contracts.
const findRoot = start => {
  for (let dir = path.resolve(start); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.agents', 'contracts', 'e2e-ui-test', 'CONTRACTS_VERSION'))) return dir;
    if (path.dirname(dir) === dir) return path.resolve(start);
  }
};
const root = args.root ? path.resolve(args.root) : findRoot(process.cwd());
const docsAbs = path.resolve(root, args['docs-root']);
const docsRoot = path.relative(root, docsAbs).split(path.sep).join('/');
const results = [];
const step = (name, status, detail) => results.push({ name, status, detail });
const run = (script, scriptArgs) => spawnSync(process.execPath, [path.join(here, script), ...scriptArgs], { cwd: root, encoding: 'utf8' });
const firstLines = r => `${r.stdout}${r.stderr}`.trim().split('\n').filter(l => /FAIL|error|- |must|missing|invalid|differs|not /i.test(l)).slice(0, 6).join('\n    ');

const setupFile = path.join(docsAbs, 'setup-decisions.json');
const setup = fs.existsSync(setupFile) ? JSON.parse(fs.readFileSync(setupFile, 'utf8')) : null;
if (!setup) {
  step('setup decisions', 'FAIL', `${docsRoot}/setup-decisions.json not found; run e2e-ui-test-env-setup`);
} else {
  const conformance = verifySetup({ root, docsRoot, setup });
  step('setup conformance', conformance.errors.length ? 'FAIL' : 'PASS', conformance.errors.join('\n    ') || `${conformance.inventory.length} artifacts classified`);

  const pkgDir = setup.owningPackage || '.';
  const typescript = args.typescript ? path.resolve(args.typescript) : findTypescript(root, setup);
  if (!typescript) step('TypeScript parser', 'FAIL', `no typescript.js under ${pkgDir}/node_modules or the repository root; install dependencies (setup authorization) or pass --typescript`);

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-validate-all-'));
  try {
    const inventoryOut = path.join(temp, 'inventory.json');
    if (typescript) {
      const inv = run('inventory-tests.mjs', ['--test-root', setup.testDir, '--output', inventoryOut, '--typescript', typescript]);
      step('test inventory', inv.status === 0 ? 'PASS' : 'FAIL', inv.status === 0 ? setup.testDir : firstLines(inv));
    }
    const catalogPath = setup.catalogPath || path.posix.join(setup.testDir, 'test-catalog.json');
    const schemaPath = path.posix.join(path.posix.dirname(catalogPath), 'test-catalog.schema.json');
    if (!fs.existsSync(path.join(root, catalogPath))) step('catalog', 'FAIL', `${catalogPath} not found`);
    else if (fs.existsSync(inventoryOut)) {
      const cat = run('validate-catalog.mjs', ['--catalog', catalogPath, '--schema', schemaPath, '--inventory', inventoryOut, '--docs-root', docsRoot]);
      step('catalog', cat.status === 0 ? 'PASS' : 'FAIL', cat.status === 0 ? catalogPath : firstLines(cat));
    }
    const mod = run('validate-config-module-format.mjs', ['--config', setup.configPath]);
    step('config module format', mod.status === 0 ? 'PASS' : 'FAIL', mod.status === 0 ? setup.configPath : firstLines(mod));

    const manifestFile = path.join(docsAbs, 'coverage-manifest.json');
    if (!fs.existsSync(manifestFile)) {
      step('coverage completeness', 'FAIL', `${docsRoot}/coverage-manifest.json not found, so coverage completeness is not checked; run e2e-ui-test-plan-generator (scope adopt-existing when plans already exist)`);
    } else if (typescript) {
      const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
      const stage = coverageStage(manifest);
      // A Draft re-plan keeps the test IDs already authored, so they are checked against the real catalog.
      let catalogArg = catalogPath;
      if (!needsCatalog(manifest)) {
        catalogArg = path.join(temp, 'catalog-stub.json');
        fs.writeFileSync(catalogArg, JSON.stringify(catalogStub(manifest)));
      }
      const cov = run('validate-coverage.mjs', ['--root', root, '--requirements', manifest.requirementsInventoryRef?.path || path.posix.join(docsRoot, 'requirements-inventory.json'),
        '--manifest', path.posix.join(docsRoot, 'coverage-manifest.json'), '--catalog', catalogArg, '--typescript', typescript, '--stage', stage]);
      let detail = `${stage} stage`;
      try { const r = JSON.parse(cov.stdout); detail = r.valid ? `${stage} stage: ${r.counts.obligations} obligations, ${r.counts.plannedObligations} planned, ${r.counts.browserReviewed} reviewed` : r.errors.slice(0, 6).join('\n    '); }
      catch { detail = firstLines(cov); }
      step('coverage completeness', cov.status === 0 ? 'PASS' : 'FAIL', detail);
    }
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}

for (const r of results) console.log(`${r.status.padEnd(4)} ${r.name}${r.detail ? `\n    ${r.detail}` : ''}`);
const failed = results.filter(r => r.status !== 'PASS');
console.log(failed.length ? `\nFAIL: ${failed.length} of ${results.length} validation step(s) failed. Nothing was executed.` : `\nPASS: all ${results.length} validation steps passed. Nothing was executed.`);
process.exitCode = failed.length ? 1 : 0;
