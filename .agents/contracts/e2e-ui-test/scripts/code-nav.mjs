#!/usr/bin/env node
// Graph-first code navigation for the E2E skills: a budgeted graphify query instead of reading whole files. Reads a
// prebuilt graph only. It never builds or updates the graph, and it never runs tests, browsers or applications.
//
//   node code-nav.mjs status --root <repo> [--scope <dir>]... [--docs-root <dir>]
//   node code-nav.mjs query "<question>" --root <repo> [--budget <tokens>] [--docs-root <dir>]
//   node code-nav.mjs decide --docs-root <dir> --choice run|skip
//
// A stale or missing graph is the person's call: status says `ask: true` until they choose to update it (run) or to go
// on without it (skip). `decide --choice skip` records the skip in <docs-root>/code-graph.json so no later step asks
// again; `--choice run` clears it. Nothing here builds or updates a graph.
//
// Exit codes: 0 usable, 1 usage, 3 no graph, no graphify, or the person chose to skip (use search instead; this is never
// a failure of the step).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SKIP = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.venv', '__pycache__', 'graphify-out', 'test-results', 'playwright-report']);
const SOURCE = /\.(tsx?|jsx?|mjs|cjs|py|css|html)$/;
export const DEFAULT_BUDGET = 800;
export const DECISION_FILE = 'code-graph.json';

/** The person's recorded choice, if any. Only an explicit skip counts. */
export function readDecision(docsRoot) {
  if (!docsRoot) return null;
  try {
    const found = JSON.parse(fs.readFileSync(path.join(docsRoot, DECISION_FILE), 'utf8'));
    return found.choice === 'skip' ? found : null;
  } catch { return null; }
}

export function decide(docsRoot, choice, graphState) {
  const file = path.join(docsRoot, DECISION_FILE);
  if (choice === 'run') { fs.rmSync(file, { force: true }); return { choice, recorded: false }; }
  fs.mkdirSync(docsRoot, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ schemaVersion: '1.0', choice: 'skip', graphState, decidedAt: new Date().toISOString() }, null, 2)}\n`);
  return { choice, recorded: true, file };
}
const MAX_LISTED = 20;

/** The nearest graph at the repository root or in one of its two parents. */
export function findGraph(root) {
  let dir = path.resolve(root);
  for (let up = 0; up < 3; up++) {
    const file = path.join(dir, 'graphify-out', 'graph.json');
    if (fs.existsSync(file)) return file;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (SOURCE.test(entry.name)) yield full;
  }
}

/** Source files changed after the graph was built: the graph cannot answer for these, so read them directly. */
export function status(root, scopes = ['frontend/src'], docsRoot) {
  return withDecision(graphStatus(root, scopes), readDecision(docsRoot));
}

/** A fresh graph needs no decision. Otherwise ask until the person has chosen to skip. */
function withDecision(result, decision) {
  const skipped = result.state !== 'fresh' && !!decision;
  return { ...result, skipped, ask: result.state !== 'fresh' && !skipped,
    ...(result.state !== 'fresh' ? { question: `The code graph is ${result.state}${result.changedCount ? ` (${result.changedCount} source file(s) changed since it was built)` : ''}. Update it with the graphify skill, or skip it and use plain search?` } : {}) };
}

function graphStatus(root, scopes) {
  const graph = findGraph(root);
  if (!graph) return { state: 'missing', graph: null, changed: [], changedCount: 0 };
  const builtAt = fs.statSync(graph).mtimeMs;
  const changed = [];
  for (const scope of scopes) {
    const dir = path.resolve(root, scope);
    if (!fs.existsSync(dir)) continue;
    for (const file of walk(dir)) if (fs.statSync(file).mtimeMs > builtAt) changed.push(path.relative(root, file).replace(/\\/g, '/'));
  }
  changed.sort();
  return { state: changed.length ? 'stale' : 'fresh', graph: path.relative(root, graph).replace(/\\/g, '/'), builtAt: new Date(builtAt).toISOString(), changedCount: changed.length, changed: changed.slice(0, MAX_LISTED) };
}

/** Graph paths are relative to where the graph was built; print them relative to the repository. */
export function relativize(output, root, graph) {
  const prefix = path.relative(path.dirname(path.dirname(graph)), path.resolve(root)).replace(/\\/g, '/');
  return prefix ? output.split(`src=${prefix}/`).join('src=') : output;
}

function query(question, root, budget, docsRoot) {
  const current = status(root, undefined, docsRoot);
  if (current.skipped) { console.error('The code graph was skipped for this run. Use search instead.'); process.exit(3); }
  const graph = findGraph(root);
  if (!graph) { console.error('No graphify-out/graph.json found. Use search instead.'); process.exit(3); }
  try {
    const out = execFileSync('graphify', ['query', question, '--budget', String(budget), '--graph', graph], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } });
    process.stdout.write(relativize(out, root, graph));
  } catch (err) {
    console.error(`graphify query failed (${err.code || err.status}). Use search instead.`);
    process.exit(3);
  }
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = { scope: [] };
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--scope') args.scope.push(rest[++i]);
    else if (rest[i].startsWith('--')) args[rest[i].slice(2)] = rest[++i];
    else positional.push(rest[i]);
  }
  const root = path.resolve(args.root || '.');
  const docsRoot = args['docs-root'] ? path.resolve(root, args['docs-root']) : undefined;
  if (command === 'status') {
    const result = status(root, args.scope.length ? args.scope : undefined, docsRoot);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.state === 'missing' || result.skipped ? 3 : 0);
  }
  if (command === 'decide' && docsRoot && ['run', 'skip'].includes(args.choice)) {
    console.log(JSON.stringify(decide(docsRoot, args.choice, status(root, undefined).state), null, 2));
    process.exit(0);
  }
  if (command === 'query' && positional[0]) return query(positional[0], root, Number(args.budget) || DEFAULT_BUDGET, docsRoot);
  console.error('Usage: code-nav.mjs status --root <repo> [--scope <dir>]... [--docs-root <dir>] | code-nav.mjs query "<question>" --root <repo> [--budget <tokens>] [--docs-root <dir>] | code-nav.mjs decide --docs-root <dir> --choice run|skip');
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
