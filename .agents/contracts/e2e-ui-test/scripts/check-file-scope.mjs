#!/usr/bin/env node
// Gate G-D11: a skill may change only the paths it owns. Static: reads git state and file hashes, never runs tests.
//
//   node check-file-scope.mjs snapshot --root <repo> --out <file outside the repository>
//   node check-file-scope.mjs check --skill <skill> --root <repo> --docs-root <dir>
//        (--since <snapshot> | --paths <file listing one path per line>) [--record] [--now YYYYMMDDHHmm]
//
// A snapshot taken before the operation separates the operation's changes from the developer's pre-existing
// uncommitted work, which is never reported and never touched. --record writes the result to
// <docs-root>/scope/<setup|plan|test|verify|eval>-<YYYYMMDDHHmm>.json, which e2e-ui-test-coverage-evaluator re-checks;
// no record is written while violations remain. Scope records are never deleted.
// Exit codes: 0 in scope, 2 out-of-scope changes found, 1 usage or internal error.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const CONTRACTS_VERSION = fs.readFileSync(path.join(here, '..', 'CONTRACTS_VERSION'), 'utf8').trim();
export const SKILLS = ['e2e-ui-test-env-setup', 'e2e-ui-test-plan-generator', 'e2e-ui-test-generator', 'e2e-ui-test-verify-run', 'e2e-ui-test-coverage-evaluator'];
// Short record names keep fixture paths within Windows path limits.
export const RECORD_DIR = 'scope';
const SHORT = { 'e2e-ui-test-env-setup': 'setup', 'e2e-ui-test-plan-generator': 'plan', 'e2e-ui-test-generator': 'test', 'e2e-ui-test-verify-run': 'verify', 'e2e-ui-test-coverage-evaluator': 'eval' };
const LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb'];
const PACKAGE_KEYS_SETUP_MAY_CHANGE = ['scripts', 'dependencies', 'devDependencies'];

const posix = p => p.split(path.sep).join('/').replace(/^\.\//, '');
const inside = (p, dir) => { const d = posix(dir).replace(/\/$/, ''); return d === '' || d === '.' || p === d || p.startsWith(`${d}/`); };
const join = (...parts) => posix(path.posix.join(...parts.map(posix)));

// The ownership rules. `touched` entries are {path, change: added|modified|deleted, preExisting?}.
export function scopeViolations({ skill, touched, setup, docsRoot }) {
  const docs = posix(docsRoot);
  const own = join(docs, RECORD_DIR);
  const evaluations = join(docs, 'evaluations');
  const testDir = setup ? posix(setup.testDir) : null;
  const fixtureDirs = (setup?.lanes || []).map(l => l.fixtureEntryPoint && posix(path.posix.dirname(posix(l.fixtureEntryPoint)))).filter(Boolean);
  const pkgDir = setup ? posix(setup.owningPackage || '.') : '.';
  // Synthetic-data builder directories, wherever setup records them.
  const dataDirs = [];
  const collect = value => {
    if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) k === 'dataModule' && typeof v === 'string' ? dataDirs.push(posix(v)) : collect(v);
  };
  collect(setup);
  const allowed = p => {
    switch (skill) {
      case 'e2e-ui-test-plan-generator':
        return inside(p, docs) && !inside(p, evaluations) && p !== join(docs, 'setup-decisions.json');
      case 'e2e-ui-test-generator':
        if (inside(p, docs)) return !inside(p, evaluations) && ![join(docs, 'setup-decisions.json'), join(docs, 'requirements-inventory.json')].includes(p);
        return !!testDir && inside(p, testDir) && !fixtureDirs.some(d => inside(p, d)) && !p.endsWith('.schema.json');
      // Repairs touch test sources only (never fixtures, data builders, the catalog or schemas); the rest is execution
      // evidence under runs/ and the coverage views that sync-coverage.mjs rewrites.
      case 'e2e-ui-test-verify-run':
        if (inside(p, docs)) return !inside(p, evaluations) && ![join(docs, 'setup-decisions.json'), join(docs, 'requirements-inventory.json')].includes(p);
        return !!testDir && inside(p, testDir) && /\.[cm]?[jt]sx?$/.test(p) && ![...fixtureDirs, ...dataDirs].some(d => inside(p, d));
      case 'e2e-ui-test-env-setup': {
        const base = path.posix.basename(p);
        return inside(p, own) || p === join(docs, 'setup-decisions.json') || p === join(docs, 'README.md')
          || (!!testDir && inside(p, testDir)) || (setup && p === posix(setup.configPath))
          || base === '.gitignore' || base === '.env.e2e.example'
          || p === join(pkgDir, 'package.json') || LOCKFILES.some(l => p === join(pkgDir, l) || p === l)
          || p === '.github/workflows/execute-tests.yml'
          || (setup?.agentPlatform && setup.agentPlatform !== 'none'
            && (inside(p, '.github/agents') || inside(p, '.github/chatmodes') || inside(p, '.claude/agents') || ['.vscode/mcp.json', '.mcp.json'].includes(p)));
      }
      case 'e2e-ui-test-coverage-evaluator':
        return inside(p, evaluations);
      default:
        return false;
    }
  };
  const violations = [];
  for (const t of touched) {
    if (t.change === 'deleted' && t.preExisting !== false) violations.push(`file scope: ${skill} deleted pre-existing file ${t.path}`);
    else if (!(inside(t.path, own) && skill !== 'e2e-ui-test-coverage-evaluator') && !allowed(t.path)) {
      violations.push(`file scope: ${skill} changed ${t.path}, which is outside its declared artifact roots`);
    }
    if (t.packageKeys?.length) violations.push(`file scope: ${skill} changed ${t.path} outside ${PACKAGE_KEYS_SETUP_MAY_CHANGE.join('/')} (${t.packageKeys.join(', ')})`);
  }
  return violations;
}

// ---------------------------------------------------------------- git helpers
function git(root, args, { allowFail = false, buffer = false } = {}) {
  const run = spawnSync('git', ['-C', root, ...args], { encoding: buffer ? 'buffer' : 'utf8', maxBuffer: 1 << 28 });
  if (run.error || (run.status !== 0 && !allowFail)) throw new Error(`git ${args.join(' ')} failed: ${run.error?.message || String(run.stderr).trim()}`);
  return run;
}
const nulList = output => String(output).split('\0').filter(Boolean);
const hashOf = file => fs.existsSync(file) && fs.statSync(file).isFile() ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : 'absent';

function statusPaths(root) {
  const entries = nulList(git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']).stdout);
  const paths = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    paths.push(entry.slice(3));
    if (/^[RC]/.test(entry)) paths.push(entries[++i]);
  }
  return paths;
}

function snapshot(root) {
  const head = git(root, ['rev-parse', 'HEAD']).stdout.trim();
  const entries = {};
  for (const p of statusPaths(root)) entries[p] = hashOf(path.join(root, p));
  return { snapshotVersion: '1.0', head, entries };
}

function touchedSince(root, snap) {
  const candidates = new Set([...nulList(git(root, ['diff', '--name-only', '-z', snap.head]).stdout),
    ...nulList(git(root, ['ls-files', '--others', '--exclude-standard', '-z']).stdout), ...Object.keys(snap.entries)]);
  const touched = [];
  for (const p of [...candidates].sort()) {
    const now = hashOf(path.join(root, p));
    const before = p in snap.entries ? snap.entries[p] : null;
    if (before !== null && before === now) continue;
    const inHead = git(root, ['cat-file', '-e', `${snap.head}:${p}`], { allowFail: true }).status === 0;
    if (before === null && !inHead && now === 'absent') continue;
    const existedBefore = before !== null ? before !== 'absent' : inHead;
    const change = now === 'absent' ? 'deleted' : existedBefore ? 'modified' : 'added';
    const entry = { path: p, change, preExisting: existedBefore };
    if (change === 'modified' && path.posix.basename(p) === 'package.json') {
      const shown = git(root, ['show', `${snap.head}:${p}`], { allowFail: true });
      if (shown.status === 0) {
        try {
          const strip = value => Object.fromEntries(Object.entries(value).filter(([k]) => !PACKAGE_KEYS_SETUP_MAY_CHANGE.includes(k)));
          const was = strip(JSON.parse(shown.stdout));
          const is = strip(JSON.parse(fs.readFileSync(path.join(root, p), 'utf8')));
          const keys = [...new Set([...Object.keys(was), ...Object.keys(is)])].filter(k => JSON.stringify(was[k]) !== JSON.stringify(is[k]));
          if (keys.length) entry.packageKeys = keys;
        } catch { entry.packageKeys = ['(unparseable package.json)']; }
      }
    }
    touched.push(entry);
  }
  return touched;
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
  const usage = message => { console.error(`check-file-scope: ${message}`); process.exit(1); };
  try {
    if (!args.root) usage('--root is required');
    const root = path.resolve(args.root);
    if (command === 'snapshot') {
      if (!args.out) usage('--out is required');
      const out = path.resolve(args.out);
      if (!path.relative(root, out).startsWith('..')) usage('--out must be outside the repository, so the snapshot is not itself a change');
      fs.writeFileSync(out, `${JSON.stringify(snapshot(root), null, 2)}\n`);
      console.log(`Snapshot written: ${out}`);
    } else if (command === 'check') {
      if (!SKILLS.includes(args.skill)) usage(`--skill must be one of ${SKILLS.join(', ')}`);
      if (!args['docs-root']) usage('--docs-root is required');
      const docsAbs = path.resolve(root, args['docs-root']);
      const docsRoot = posix(path.relative(root, docsAbs));
      const setupFile = path.join(docsAbs, 'setup-decisions.json');
      const setup = fs.existsSync(setupFile) ? JSON.parse(fs.readFileSync(setupFile, 'utf8')) : null;
      if (!setup && args.skill !== 'e2e-ui-test-coverage-evaluator' && args.skill !== 'e2e-ui-test-plan-generator') usage('setup-decisions.json is required to resolve the artifact roots');
      let touched;
      let method;
      if (args.since) { touched = touchedSince(root, JSON.parse(fs.readFileSync(path.resolve(args.since), 'utf8'))); method = 'since-snapshot'; }
      else if (args.paths) {
        touched = fs.readFileSync(path.resolve(args.paths), 'utf8').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
          .map(p => ({ path: posix(p), change: fs.existsSync(path.join(root, p)) ? 'modified' : 'deleted' }));
        method = 'paths';
      } else usage('--since <snapshot> or --paths <file> is required');
      const violations = scopeViolations({ skill: args.skill, touched, setup, docsRoot });
      const result = { schemaVersion: '1.0', contractsVersion: CONTRACTS_VERSION, skill: args.skill, method, touched, violations };
      // A record is written only for an in-scope operation: the owning skill first undoes its out-of-scope changes and
      // runs the check again, so a record never captures a violation it could still fix.
      if (args.record && !violations.length) {
        const now = String(args.now || new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)).replace(/-/g, '');
        const dir = path.join(docsAbs, RECORD_DIR);
        fs.mkdirSync(dir, { recursive: true });
        let file = path.join(dir, `${SHORT[args.skill]}-${now}.json`);
        for (let n = 2; fs.existsSync(file); n++) file = path.join(dir, `${SHORT[args.skill]}-${now}-${n}.json`);
        fs.writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
        result.record = posix(path.relative(root, file));
      }
      for (const t of touched) console.log(`${scopeViolations({ skill: args.skill, touched: [t], setup, docsRoot }).length ? 'OUT ' : 'ok  '} ${t.change.padEnd(8)} ${t.path}`);
      violations.forEach(v => console.log(`VIOLATION ${v}`));
      console.log(violations.length ? `FAIL: ${violations.length} out-of-scope change(s)` : `PASS: ${touched.length} change(s), all within ${args.skill}'s artifact roots`);
      if (result.record) console.log(`Record: ${result.record}`);
      else if (args.record) console.log('Record: not written; undo the out-of-scope changes this operation made, then run check --record again');
      process.exitCode = violations.length ? 2 : 0;
    } else usage('command must be snapshot or check');
  } catch (error) { console.error(`check-file-scope: ${error.message}`); process.exitCode = 1; }
}
