#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parser, inspect } from './source-evidence.mjs';

function args(argv) {
  const result = {};
  for (let i = 2; i < argv.length; i += 2) result[argv[i].replace(/^--/, '')] = argv[i + 1];
  return result;
}

function walk(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (/\.(?:spec|test)\.[cm]?[jt]sx?$/.test(entry.name)) files.push(full);
  }
  return files;
}

function parseFile(file, root, ts) {
  const parsed = inspect(ts, file);
  const metadata = parsed.records.map(({node, body, ...item}) => ({
      ...item,
      specPath: path.relative(process.cwd(), file).replaceAll('\\', '/'),
      relativeSpecPath: path.relative(root, file).replaceAll('\\', '/'),
    }));
  return { metadata, calls: metadata.length };
}

const options = args(process.argv);
if (!options['test-root'] || !options.output) {
  console.error('Usage: inventory-tests.mjs --test-root <dir> --output <file>');
  process.exit(2);
}

const root = path.resolve(options['test-root']);
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  console.error(`Test root does not exist: ${root}`);
  process.exit(2);
}

const tests = [];
const ambiguities = [];
const ts = parser(root, options.typescript);
for (const file of walk(root)) {
  let parsed;
  try { parsed = parseFile(file, root, ts); }
  catch (error) { ambiguities.push({specPath:file, reason:error.message}); continue; }
  tests.push(...parsed.metadata);
  if (parsed.calls !== parsed.metadata.length) {
    ambiguities.push({
      specPath: path.relative(process.cwd(), file).replaceAll('\\', '/'),
      testCalls: parsed.calls,
      metadataRecords: parsed.metadata.length,
    });
  }
}

const duplicates = tests
  .map((test) => test.testId)
  .filter((id, index, all) => all.indexOf(id) !== index);

const inventory = {
  testRoot: path.relative(process.cwd(), root).replaceAll('\\', '/'),
  tests,
  ambiguities,
  duplicateTestIds: [...new Set(duplicates)],
};

fs.mkdirSync(path.dirname(path.resolve(options.output)), { recursive: true });
fs.writeFileSync(path.resolve(options.output), `${JSON.stringify(inventory, null, 2)}\n`);

if (ambiguities.length || duplicates.length) {
  console.error(`Inventory failed closed: ${ambiguities.length} ambiguous file(s), ${duplicates.length} duplicate ID(s)`);
  process.exit(1);
}
console.log(`Inventoried ${tests.length} Playwright test(s) without importing Playwright.`);
