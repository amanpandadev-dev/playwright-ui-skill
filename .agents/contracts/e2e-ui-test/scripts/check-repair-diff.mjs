#!/usr/bin/env node
// Repair limits for e2e-ui-test-verify-run. A repair of a failing generated test may change locators, waits and
// navigation. It must never change what a test asserts, which test it is, how it is skipped, what it mocks, or its
// control flow. Static: parses the before and after sources with the repository's TypeScript, never runs them.
//
//   node check-repair-diff.mjs snapshot --root <repo> --docs-root <dir> --out <file outside the repository>
//   node check-repair-diff.mjs check --root <repo> --docs-root <dir> --since <snapshot> [--typescript <typescript.js>]
//        [--report <file>]
//
// The snapshot records every source file under testDir before the repair. `check` compares the current files with it.
// Allowed: a changed locator (also as the subject of an assertion, when both sides are locator expressions), element
// and page waits, navigation, and switching to another existing shared fixture module.
// Forbidden: added or deleted files; any change under a fixture or synthetic-data directory; changed assertion count,
// order, variant, matcher, expected values, message, `await` or evidence anchor; changed @e2e-meta; changed test,
// describe, step, skip, fixme, only, slow, use or setTimeout calls; changed control flow; new route mocks, script
// evaluation, forced actions, fixed waits, `networkidle` or `.catch(`; new package imports.
// Exit codes: 0 every change is an allowed repair, 2 forbidden changes found, 1 usage or internal error.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parser, inspect } from './source-evidence.mjs';
import { findTypescript } from './validate-coverage.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const CONTRACTS_VERSION = fs.readFileSync(path.join(here, '..', 'CONTRACTS_VERSION'), 'utf8').trim();
const SOURCE = /\.[cm]?[jt]sx?$/;
const SPEC = /\.(?:spec|test)\.[cm]?[jt]sx?$/;
const posix = p => p.split(path.sep).join('/').replace(/^\.\//, '');
const inside = (p, dir) => { const d = posix(dir).replace(/\/$/, ''); return p === d || p.startsWith(`${d}/`); };
const squash = text => text.replace(/\s+/g, ' ').trim();
const sha = text => crypto.createHash('sha256').update(text).digest('hex');

// Calls a repair must not add: they replace real behaviour (mocks, scripted DOM), bypass actionability checks,
// swallow failures or wait on time instead of state.
const BYPASS_CALLS = ['route', 'routeFromHAR', 'unroute', 'unrouteAll', 'evaluate', 'evaluateHandle', '$eval', '$$eval',
  'addInitScript', 'addScriptTag', 'setContent', 'dispatchEvent', 'exposeFunction', 'exposeBinding', 'waitForTimeout', 'catch'];
// A locator chain: rooted in a getBy*/locator call, with no call that reads a value out of it.
const LOCATOR_STEP = /\.(?:getBy(?:Role|Text|Label|Placeholder|AltText|Title|TestId)|locator|frameLocator|contentFrame|first|last|nth|filter|and|or)\s*\(/;
const VALUE_READ = /\.(?:textContent|innerText|innerHTML|inputValue|getAttribute|count|isVisible|isHidden|isEnabled|isDisabled|isChecked|isEditable|evaluate\w*|allTextContents|allInnerTexts|boundingBox|all)\s*\(/;
const isLocator = text => LOCATOR_STEP.test(text) && !VALUE_READ.test(text);
const CONTROL_FLOW = ['IfStatement', 'ConditionalExpression', 'TryStatement', 'CatchClause', 'ReturnStatement', 'ThrowStatement',
  'ForStatement', 'ForOfStatement', 'ForInStatement', 'WhileStatement', 'DoStatement', 'SwitchStatement', 'BreakStatement', 'ContinueStatement'];
const SHORT_CIRCUIT = ['AmpersandAmpersandToken', 'BarBarToken', 'QuestionQuestionToken'];

// ---------------------------------------------------------------- analysis
export function analyze(ts, source, file = 'spec.ts') {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (tree.parseDiagnostics.length) return { error: `${file}: source parse failed` };
  const text = node => squash(node.getText(tree));
  const kind = node => ts.SyntaxKind[node.kind];
  const testCalls = [], assertions = [], imports = [], flow = {}, bypass = {};
  const bump = (bag, key) => { bag[key] = (bag[key] || 0) + 1; };

  // Where a node sits: every enclosing control-flow construct and callback, so an assertion cannot move into a
  // conditional, a try block, a different test or a different step.
  const context = node => {
    const parts = [];
    for (let n = node.parent; n && n !== tree; n = n.parent) {
      if (CONTROL_FLOW.includes(kind(n))) parts.push(kind(n));
      else if (ts.isBinaryExpression(n) && SHORT_CIRCUIT.includes(ts.SyntaxKind[n.operatorToken.kind])) parts.push(ts.SyntaxKind[n.operatorToken.kind]);
      else if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) {
        const call = ts.isCallExpression(n.parent) ? n.parent : null;
        const title = call?.arguments.find(a => ts.isStringLiteralLike(a));
        parts.push(call ? `callback:${text(call.expression)}${title ? `(${title.text})` : ''}` : 'function');
      } else if (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) parts.push(`function:${n.name ? text(n.name) : ''}`);
    }
    return parts.reverse().join(' > ');
  };
  const anchorOf = node => {
    let statement = node;
    while (statement.parent && !ts.isExpressionStatement(statement)) statement = statement.parent;
    if (!ts.isExpressionStatement(statement)) return null;
    for (const range of ts.getLeadingCommentRanges(source, statement.getFullStart()) || []) {
      const match = source.slice(range.pos, range.end).match(/^\/\/\s*@e2e-evidence\s+([\w.-]+)\s*$/);
      if (match) return match[1];
    }
    return null;
  };
  // expect(subject, message)[.not|.resolves|.rejects].matcher(...args), also expect.soft and expect.poll.
  const assertionOf = node => {
    if (!ts.isPropertyAccessExpression(node.expression)) return null;
    const chain = [node.expression.name.text];
    let inner = node.expression.expression;
    while (ts.isPropertyAccessExpression(inner)) { chain.unshift(inner.name.text); inner = inner.expression; }
    if (!ts.isCallExpression(inner) || !/^expect(?:\.(?:soft|poll))?$/.test(text(inner.expression))) return null;
    const subject = inner.arguments[0] ? text(inner.arguments[0]) : '';
    return {
      line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
      variant: text(inner.expression), chain: chain.join('.'), subject, locatorSubject: isLocator(subject),
      message: inner.arguments[1] ? text(inner.arguments[1]) : null,
      expected: node.arguments.map(text), awaited: ts.isAwaitExpression(node.parent), anchor: anchorOf(node), context: context(node),
    };
  };

  const visit = node => {
    if (CONTROL_FLOW.includes(kind(node))) bump(flow, kind(node));
    if (ts.isBinaryExpression(node) && SHORT_CIRCUIT.includes(ts.SyntaxKind[node.operatorToken.kind])) bump(flow, ts.SyntaxKind[node.operatorToken.kind]);
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if (ts.isPropertyAssignment(node) && text(node.name) === 'force' && node.initializer.kind === ts.SyntaxKind.TrueKeyword) bump(bypass, 'force: true');
    if (ts.isStringLiteralLike(node) && node.text === 'networkidle') bump(bypass, "'networkidle'");
    if (ts.isCallExpression(node)) {
      const callee = text(node.expression);
      // Test identity and execution control: test(...), test.skip(...), test.describe(...), test.step(...), test.use(...).
      if (/^(?:test|describe|it)(?:\.\w+)*$/.test(callee)) {
        testCalls.push(`${callee}(${node.arguments.filter(a => !ts.isArrowFunction(a) && !ts.isFunctionExpression(a)).map(text).join(', ')})`);
      }
      const name = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : callee;
      if (BYPASS_CALLS.includes(name)) bump(bypass, `${name}(`);
      const assertion = assertionOf(node);
      if (assertion) assertions.push(assertion);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  const meta = [...source.matchAll(/^[ \t]*\/\/\s*@e2e-meta\s+(.+)$/gm)].map(m => {
    try { return JSON.stringify(JSON.parse(m[1])); } catch { return squash(m[1]); }
  });
  const anchors = [...source.matchAll(/^[ \t]*\/\/\s*@e2e-evidence\s+([\w.-]+)\s*$/gm)].map(m => m[1]);
  return { testCalls, assertions, imports, flow, bypass, meta, anchors };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function listDiff(label, before, after, violations) {
  if (same(before, after)) return;
  const removed = before.filter(x => !after.includes(x)), added = after.filter(x => !before.includes(x));
  const detail = [removed.length && `removed ${removed.join('; ')}`, added.length && `added ${added.join('; ')}`].filter(Boolean).join(', ') || 'reordered';
  violations.push(`${label} changed: ${detail}`);
}

// Compares one file's before and after sources. Returns forbidden changes and informational notes.
export function compareSources({ ts, before, after, file = 'spec.ts', resolveImport = () => false }) {
  const violations = [], notes = [];
  const a = analyze(ts, before, file), b = analyze(ts, after, file);
  if (a.error || b.error) return { violations: [b.error || a.error], notes };

  listDiff('@e2e-meta test metadata', a.meta, b.meta, violations);
  listDiff('@e2e-evidence anchors', a.anchors, b.anchors, violations);
  listDiff('test, describe, step, skip, fixme, only, slow, use or setTimeout calls', a.testCalls, b.testCalls, violations);

  if (a.assertions.length !== b.assertions.length) {
    violations.push(`assertion count changed from ${a.assertions.length} to ${b.assertions.length}; wait with locator.waitFor() or page.waitForURL() instead of adding or removing expect()`);
  } else {
    a.assertions.forEach((was, i) => {
      const is = b.assertions[i];
      const at = `assertion at line ${is.line}${is.anchor ? ` (@e2e-evidence ${is.anchor})` : ''}`;
      for (const field of ['variant', 'chain', 'expected', 'message', 'awaited', 'anchor', 'context']) {
        if (!same(was[field], is[field])) violations.push(`${at}: ${field} changed from ${JSON.stringify(was[field])} to ${JSON.stringify(is[field])}`);
      }
      if (was.subject !== is.subject) {
        if (was.locatorSubject && is.locatorSubject) notes.push(`${at}: locator changed from ${was.subject} to ${is.subject}`);
        else violations.push(`${at}: subject changed from ${was.subject} to ${is.subject}; only a locator expression may be replaced by another locator expression`);
      }
    });
  }

  for (const key of new Set([...Object.keys(a.flow), ...Object.keys(b.flow)])) {
    if ((a.flow[key] || 0) !== (b.flow[key] || 0)) violations.push(`control flow changed: ${key} ${a.flow[key] || 0} -> ${b.flow[key] || 0}; conditional handling belongs in a shared fixture owned by e2e-ui-test-env-setup`);
  }
  for (const key of Object.keys(b.bypass)) {
    if (b.bypass[key] > (a.bypass[key] || 0)) violations.push(`adds ${key} (${a.bypass[key] || 0} -> ${b.bypass[key]}): mocks, scripted DOM, forced actions, swallowed errors and fixed waits are not repairs`);
  }
  for (const specifier of b.imports.filter(s => !a.imports.includes(s))) {
    if (!specifier.startsWith('.')) violations.push(`adds package import ${specifier}; dependencies belong to e2e-ui-test-env-setup`);
    else if (!resolveImport(specifier)) violations.push(`adds import ${specifier}, which does not resolve to an existing non-spec module`);
    else notes.push(`switches to existing module ${specifier}`);
  }
  return { violations, notes };
}

// ---------------------------------------------------------------- files
function walk(dir, root) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full, root));
    else if (SOURCE.test(entry.name)) files.push(posix(path.relative(root, full)));
  }
  return files;
}

function loadSetup(root, docsRoot) {
  const file = path.join(root, docsRoot, 'setup-decisions.json');
  if (!fs.existsSync(file)) throw new Error(`setup-decisions.json not found under ${docsRoot}`);
  const setup = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!setup.testDir) throw new Error('setup-decisions.json declares no testDir');
  const testDir = posix(setup.testDir);
  // Directories a repair must never touch: shared fixtures (env-setup) and synthetic-data builders (generator).
  const protectedDirs = new Set();
  for (const lane of setup.lanes || []) if (lane.fixtureEntryPoint) protectedDirs.add(path.posix.dirname(posix(lane.fixtureEntryPoint)));
  const collect = value => {
    if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) k === 'dataModule' && typeof v === 'string' ? protectedDirs.add(posix(v)) : collect(v);
  };
  collect(setup);
  return { setup, testDir, protectedDirs: [...protectedDirs].filter(d => d && d !== '.') };
}

function takeSnapshot(root, testDir) {
  const files = {};
  for (const rel of walk(path.join(root, testDir), root)) files[rel] = fs.readFileSync(path.join(root, rel), 'utf8');
  return { snapshotVersion: '1.0', contractsVersion: CONTRACTS_VERSION, testDir, files };
}

export function checkRepair({ ts, root, snapshot, testDir, protectedDirs = [] }) {
  const current = new Set(walk(path.join(root, testDir), root));
  const results = [];
  const resolveFrom = rel => specifier => {
    const base = path.join(root, path.posix.dirname(rel), specifier);
    const candidates = [base, ...['.ts', '.tsx', '.js', '.mjs', '.cjs'].map(e => base + e), ...['index.ts', 'index.js'].map(i => path.join(base, i))];
    return candidates.some(c => fs.existsSync(c) && fs.statSync(c).isFile() && !SPEC.test(c) && posix(path.relative(root, c)) in snapshot.files);
  };
  for (const rel of [...new Set([...Object.keys(snapshot.files), ...current])].sort()) {
    const before = snapshot.files[rel];
    const after = current.has(rel) ? fs.readFileSync(path.join(root, rel), 'utf8') : undefined;
    if (before === after) continue;
    const entry = { path: rel, change: before === undefined ? 'added' : after === undefined ? 'deleted' : 'modified', violations: [], notes: [] };
    results.push(entry);
    if (entry.change !== 'modified') { entry.violations.push(`${entry.change} ${rel}; a repair only edits existing files`); continue; }
    const owner = protectedDirs.find(d => inside(rel, d));
    if (owner) { entry.violations.push(`changes ${rel} under protected directory ${owner} (shared fixtures or synthetic data)`); continue; }
    Object.assign(entry, compareSources({ ts, before, after, file: rel, resolveImport: resolveFrom(rel) }), { beforeSha: sha(before), afterSha: sha(after) });
    // The repaired spec must still satisfy the pipeline's static inspection (metadata, non-empty bodies, real assertions).
    if (SPEC.test(rel)) {
      try { inspect(ts, path.join(root, rel)); } catch (error) { entry.violations.push(`no longer passes static inspection: ${error.message}`); }
    }
  }
  return results;
}

// ---------------------------------------------------------------- CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  const args = {};
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i].replace(/^--/, '');
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true; else { args[key] = next; i++; }
  }
  const usage = message => { console.error(`check-repair-diff: ${message}`); process.exit(1); };
  try {
    if (!args.root) usage('--root is required');
    if (!args['docs-root']) usage('--docs-root is required');
    const root = path.resolve(args.root);
    const { setup, testDir, protectedDirs } = loadSetup(root, args['docs-root']);
    if (command === 'snapshot') {
      if (!args.out) usage('--out is required');
      const out = path.resolve(args.out);
      if (!path.relative(root, out).startsWith('..')) usage('--out must be outside the repository, so the snapshot is not itself a change');
      const snap = takeSnapshot(root, testDir);
      fs.writeFileSync(out, `${JSON.stringify(snap, null, 2)}\n`);
      console.log(`Snapshot written: ${out} (${Object.keys(snap.files).length} source file(s) under ${testDir})`);
    } else if (command === 'check') {
      if (!args.since) usage('--since <snapshot> is required');
      const snapshot = JSON.parse(fs.readFileSync(path.resolve(args.since), 'utf8'));
      if (snapshot.testDir !== testDir) usage(`snapshot covers ${snapshot.testDir}, but testDir is now ${testDir}`);
      const typescript = args.typescript ? path.resolve(args.typescript) : findTypescript(root, setup);
      if (!typescript) usage('no TypeScript parser found under the owning package or the repository root; pass --typescript');
      const ts = parser(root, typescript);
      const files = checkRepair({ ts, root, snapshot, testDir, protectedDirs });
      const violations = files.flatMap(f => f.violations.map(v => `${f.path}: ${v}`));
      const report = { schemaVersion: '1.0', contractsVersion: CONTRACTS_VERSION, testDir, protectedDirs, files, violations };
      if (args.report) {
        fs.mkdirSync(path.dirname(path.resolve(args.report)), { recursive: true });
        fs.writeFileSync(path.resolve(args.report), `${JSON.stringify(report, null, 2)}\n`);
      }
      for (const f of files) {
        console.log(`${f.violations.length ? 'REJECT' : 'ok    '} ${f.change.padEnd(8)} ${f.path}`);
        f.notes.forEach(n => console.log(`       note: ${n}`));
        f.violations.forEach(v => console.log(`       VIOLATION ${v}`));
      }
      console.log(violations.length
        ? `FAIL: ${violations.length} forbidden change(s); revert them and record a blocker instead of repairing`
        : `PASS: ${files.length} file(s) changed, all within the repair limits`);
      process.exitCode = violations.length ? 2 : 0;
    } else usage('command must be snapshot or check');
  } catch (error) { console.error(`check-repair-diff: ${error.message}`); process.exitCode = 1; }
}
