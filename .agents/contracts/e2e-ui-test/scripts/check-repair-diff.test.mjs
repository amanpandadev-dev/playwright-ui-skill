// Tests for check-repair-diff.mjs. Run: node --test .agents/contracts/e2e-ui-test/scripts/check-repair-diff.test.mjs
// Needs a TypeScript parser: E2E_TYPESCRIPT=<path to typescript.js>, or typescript installed at the repository root.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parser } from './source-evidence.mjs';
import { compareSources, checkRepair } from './check-repair-diff.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
const tsPath = process.env.E2E_TYPESCRIPT || path.join(repoRoot, 'node_modules/typescript/lib/typescript.js');
const ts = fs.existsSync(tsPath) ? parser(repoRoot, tsPath) : null;
const skip = ts ? false : 'no TypeScript parser: set E2E_TYPESCRIPT';

const SPEC = `import { test, expect } from '../fixtures/test';

// @e2e-meta {"testId":"TC-J01","journeyId":"J01","portalEligible":true}
test('approver approves a pending order', async ({ page }) => {
  await page.goto('/orders');
  await page.getByRole('button', { name: 'Approve' }).click();
  // @e2e-evidence approve-status
  await expect(page.getByRole('status')).toHaveText('Approved');
  await expect(page.getByRole('row', { name: /PO-1042/ })).toHaveCount(1);
});
`;
const edit = (from, to) => { assert.ok(SPEC.includes(from), `fixture lacks ${from}`); return SPEC.replace(from, to); };
const compare = after => compareSources({ ts, before: SPEC, after });
const rejects = (after, pattern) => {
  const { violations } = compare(after);
  assert.ok(violations.some(v => pattern.test(v)), `expected a violation matching ${pattern}, got ${JSON.stringify(violations)}`);
};

test('unchanged source passes', { skip }, () => assert.deepEqual(compare(SPEC).violations, []));

test('action locator, navigation and element waits are allowed', { skip }, () => {
  const after = edit(`  await page.goto('/orders');
  await page.getByRole('button', { name: 'Approve' }).click();`,
  `  await page.goto('/orders?status=pending');
  await page.getByRole('table', { name: 'Orders' }).waitFor();
  await page.getByRole('button', { name: 'Approve order' }).click();`);
  assert.deepEqual(compare(after).violations, []);
});

test('a locator subject may be replaced by another locator', { skip }, () => {
  const result = compare(edit(`expect(page.getByRole('status'))`, `expect(page.getByTestId('order-status'))`));
  assert.deepEqual(result.violations, []);
  assert.match(result.notes.join('\n'), /locator changed/);
});

test('a locator subject may not become a value read', { skip }, () =>
  rejects(edit(`expect(page.getByRole('status'))`, `expect(await page.getByRole('status').textContent())`), /subject changed/));

test('expected value change is rejected', { skip }, () => rejects(edit(`toHaveText('Approved')`, `toHaveText('Pending')`), /expected changed/));
test('matcher change is rejected', { skip }, () => rejects(edit(`toHaveText('Approved')`, `toContainText('Approved')`), /chain changed/));
test('negation is rejected', { skip }, () => rejects(edit(`).toHaveCount(1)`, `).not.toHaveCount(1)`), /chain changed/));
test('soft assertion is rejected', { skip }, () => rejects(edit(`await expect(page.getByRole('status'))`, `await expect.soft(page.getByRole('status'))`), /variant changed/));
test('dropping await from an assertion is rejected', { skip }, () => rejects(edit(`await expect(page.getByRole('status'))`, `expect(page.getByRole('status'))`), /awaited changed/));
test('adding an assertion is rejected', { skip }, () =>
  rejects(edit(`  await page.getByRole('button'`, `  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();\n  await page.getByRole('button'`), /assertion count changed/));
test('removing an assertion is rejected', { skip }, () =>
  rejects(edit(`  await expect(page.getByRole('row', { name: /PO-1042/ })).toHaveCount(1);\n`, ''), /assertion count changed/));
test('moving an evidence anchor is rejected', { skip }, () => rejects(edit('@e2e-evidence approve-status', '@e2e-evidence approve-state'), /anchors changed/));

test('changed title is rejected', { skip }, () => rejects(edit(`'approver approves a pending order'`, `'approver approves an order'`), /test, describe/));
test('changed metadata is rejected', { skip }, () => rejects(edit(`"portalEligible":true`, `"portalEligible":false`), /@e2e-meta/));
test('test.skip is rejected', { skip }, () => rejects(edit(`test('approver`, `test.skip('approver`), /test, describe/));
test('an inline skip is rejected', { skip }, () =>
  rejects(edit(`  await page.goto('/orders');`, `  test.skip(process.env.CI === 'true', 'flaky');\n  await page.goto('/orders');`), /test, describe/));
test('test.use is rejected', { skip }, () => rejects(`${SPEC}\ntest.use({ storageState: 'viewer.json' });\n`, /test, describe/));

test('wrapping an assertion in a condition is rejected', { skip }, () =>
  rejects(edit(`  await expect(page.getByRole('status')).toHaveText('Approved');`,
    `  if (await page.getByRole('status').isVisible()) {\n    await expect(page.getByRole('status')).toHaveText('Approved');\n  }`), /control flow changed|context changed/));
test('an early return is rejected', { skip }, () =>
  rejects(edit(`  await page.getByRole('button'`, `  if (!(await page.getByRole('button', { name: 'Approve' }).isVisible())) return;\n  await page.getByRole('button'`), /control flow changed/));
test('try/catch is rejected', { skip }, () =>
  rejects(edit(`  await page.getByRole('button', { name: 'Approve' }).click();`, `  try { await page.getByRole('button', { name: 'Approve' }).click(); } catch {}`), /control flow changed/));

for (const [label, from, to] of [
  ['a route mock', `  await page.goto('/orders');`, `  await page.route('**/api/orders', r => r.fulfill({ json: [] }));\n  await page.goto('/orders');`],
  ['a forced click', `.click();`, `.click({ force: true });`],
  ['a fixed wait', `  await page.goto('/orders');`, `  await page.goto('/orders');\n  await page.waitForTimeout(2000);`],
  ['networkidle', `page.goto('/orders')`, `page.goto('/orders', { waitUntil: 'networkidle' })`],
  ['a swallowed error', `.click();`, `.click().catch(() => {});`],
  ['script evaluation', `  await page.goto('/orders');`, `  await page.goto('/orders');\n  await page.evaluate(() => document.querySelector('dialog')?.remove());`],
]) test(`adding ${label} is rejected`, { skip }, () => rejects(edit(from, to), /^adds /));

test('a new package import is rejected', { skip }, () => rejects(`import { faker } from '@faker-js/faker';\n${SPEC}`, /package import/));

// ---------------------------------------------------------------- file-level checks against a temporary repository
function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-'));
  const files = {
    'e2e/specs/orders.spec.ts': SPEC.replace('../fixtures/test', '../fixtures/test'),
    'e2e/fixtures/test.ts': 'export { test, expect } from "@playwright/test";\n',
    'e2e/fixtures/approver.ts': 'export { test, expect } from "@playwright/test";\n',
    'e2e/pages/orders-page.ts': `export const approve = page => page.getByRole('button', { name: 'Approve' });\n`,
    'e2e/data/orders.ts': 'export const order = () => ({ id: "PO-1042" });\n',
    'docs/e2e/setup-decisions.json': JSON.stringify({ testDir: 'e2e', lanes: [{ fixtureEntryPoint: 'e2e/fixtures/test.ts', testData: { dataModule: 'e2e/data' } }] }),
  };
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  return root;
}
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const write = (root, rel, content) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), content); };
const cli = (...args) => spawnSync(process.execPath, [path.join(here, 'check-repair-diff.mjs'), ...args, ...(ts ? ['--typescript', tsPath] : [])], { encoding: 'utf8' });

function snapshotOf(root) {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'repair-snap-')), 'snapshot.json');
  const run = cli('snapshot', '--root', root, '--docs-root', 'docs/e2e', '--out', out);
  assert.equal(run.status, 0, run.stderr);
  return out;
}

test('CLI passes a locator repair in a spec and a page object', { skip }, () => {
  const root = repo();
  const snap = snapshotOf(root);
  write(root, 'e2e/specs/orders.spec.ts', read(root, 'e2e/specs/orders.spec.ts').replace(`{ name: 'Approve' }`, `{ name: 'Approve order' }`));
  write(root, 'e2e/pages/orders-page.ts', read(root, 'e2e/pages/orders-page.ts').replace(`'Approve'`, `'Approve order'`));
  const run = cli('check', '--root', root, '--docs-root', 'docs/e2e', '--since', snap);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /PASS: 2 file\(s\)/);
});

test('CLI rejects an assertion change with exit 2 and writes the report', { skip }, () => {
  const root = repo();
  const snap = snapshotOf(root);
  write(root, 'e2e/specs/orders.spec.ts', read(root, 'e2e/specs/orders.spec.ts').replace(`'Approved'`, `'Pending'`));
  const report = path.join(root, 'docs/e2e/runs/r1/repair-diff.json');
  const run = cli('check', '--root', root, '--docs-root', 'docs/e2e', '--since', snap, '--report', report);
  assert.equal(run.status, 2, run.stdout + run.stderr);
  assert.match(JSON.parse(read(root, 'docs/e2e/runs/r1/repair-diff.json')).violations[0], /expected changed/);
});

test('fixture and synthetic-data directories are protected; added files are rejected', { skip }, () => {
  const root = repo();
  const snapshot = JSON.parse(fs.readFileSync(snapshotOf(root), 'utf8'));
  write(root, 'e2e/fixtures/test.ts', '// changed\n' + read(root, 'e2e/fixtures/test.ts'));
  write(root, 'e2e/data/orders.ts', read(root, 'e2e/data/orders.ts').replace('PO-1042', 'PO-9999'));
  write(root, 'e2e/specs/new.spec.ts', SPEC);
  const results = checkRepair({ ts, root, snapshot, testDir: 'e2e', protectedDirs: ['e2e/fixtures', 'e2e/data'] });
  const by = Object.fromEntries(results.map(r => [r.path, r.violations.join('\n')]));
  assert.match(by['e2e/fixtures/test.ts'], /protected directory e2e\/fixtures/);
  assert.match(by['e2e/data/orders.ts'], /protected directory e2e\/data/);
  assert.match(by['e2e/specs/new.spec.ts'], /added/);
});

test('switching to an existing fixture module is allowed; an unknown module is rejected', { skip }, () => {
  const root = repo();
  const snapshot = JSON.parse(fs.readFileSync(snapshotOf(root), 'utf8'));
  write(root, 'e2e/specs/orders.spec.ts', read(root, 'e2e/specs/orders.spec.ts').replace(`'../fixtures/test'`, `'../fixtures/approver'`));
  let [result] = checkRepair({ ts, root, snapshot, testDir: 'e2e', protectedDirs: [] });
  assert.deepEqual(result.violations, []);
  assert.match(result.notes.join('\n'), /existing module/);
  write(root, 'e2e/specs/orders.spec.ts', read(root, 'e2e/specs/orders.spec.ts').replace(`'../fixtures/approver'`, `'../fixtures/missing'`));
  [result] = checkRepair({ ts, root, snapshot, testDir: 'e2e', protectedDirs: [] });
  assert.match(result.violations.join('\n'), /does not resolve/);
});

test('snapshot refuses an output inside the repository', { skip }, () => {
  const root = repo();
  const run = cli('snapshot', '--root', root, '--docs-root', 'docs/e2e', '--out', path.join(root, 'snap.json'));
  assert.equal(run.status, 1);
  assert.match(run.stderr, /outside the repository/);
});
