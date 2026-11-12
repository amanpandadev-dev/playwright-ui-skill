#!/usr/bin/env node
// Setup discovery and conformance for e2e-ui-test-env-setup: authentication, validation wiring, auth state, portability,
// the portal and the test-data contract.
// Static only: reads files, never runs tests, applications, authentication or workflows.
//
//   node check-setup.mjs discover --root <repo> [--json]
//        Evidence e2e-ui-test-env-setup must inspect before asking its questions; needs no setup-decisions.json.
//   node check-setup.mjs verify --root <repo> --docs-root <dir> [--json]
//        Checks the recorded setup against the repository and prints the artifact inventory by necessity.
//
// Exit codes: discover 0; verify 0 conforming, 2 findings, 1 usage or internal error.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from './json-schema-lite.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PREFIX = 'setup conformance:';
export const VALIDATORS = ['inventory-tests.mjs', 'validate-catalog.mjs', 'validate-config-module-format.mjs', 'validate-coverage.mjs'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.venv', 'venv', '__pycache__', '.agents', 'coverage',
  'test-results', 'playwright-report', '.next', 'out', 'bin', 'obj', '.auth', '.pytest_cache', '.mypy_cache']);
const SOURCE_EXT = /\.(py|ts|tsx|js|mjs|cjs|cs|java|kt|go|rb|php)$/;
const TEST_PATH = /(^|\/)(tests?|__tests__|e2e|spec|fixtures?)(\/|$)|\.(spec|test)\.[cm]?[jt]sx?$|(^|\/)test_[^/]*\.py$/i;
const DEV_AUTH_ROUTE = /['"`]([^'"`\n\\]{0,80}?\b(?:dev|debug|fake|mock|local|e2e|test)[-_]?(?:token|login|auth|session|sign-?in|user|impersonat\w*)\b[^'"`\n\\]{0,40})['"`]/i;
const DEV_AUTH_FUNCTION = /\b(?:def|function|const|let|var|public|private|static|func)\s+(?:async\s+)?([A-Za-z_]\w*(?:dev|fake|mock)_?(?:token|login|auth)\w*)/i;
const GUARD = /\b(debug|auth_mode|NODE_ENV|isDevelopment|IsDevelopment|ASPNETCORE_ENVIRONMENT|APP_ENV|FLASK_ENV|DJANGO_DEBUG|environment\s*[!=]=)/;
const ROLES = /\b(ALLOWED_ROLES|allowedRoles|ROLES)\b\s*[:=]/;
const MOCK = /\.route\(|route\.fulfill\(|\bmockJson\(/;
// Data seams: mutating route definitions across common stacks, and seed or reset scripts.
const ROUTE_DEFS = [
  /@\w+\.(post|put|patch|delete)\(\s*['"]([^'"]+)['"]/i, // FastAPI, Flask
  /\b(?:app|router|server|fastify|api)\.(post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/i, // Express, Koa, Fastify, Hono
  /@(Post|Put|Patch|Delete)\(\s*['"`]([^'"`]*)['"`]\s*\)/, // NestJS
  /\[Http(Post|Put|Patch|Delete)\(\s*"([^"]*)"/, // ASP.NET controllers
  /\bMap(Post|Put|Patch|Delete)\(\s*"([^"]+)"/, // ASP.NET minimal APIs
  /@(Post|Put|Patch|Delete)Mapping\(\s*(?:value\s*=\s*|path\s*=\s*)?"([^"]*)"/, // Spring
  /\.(POST|PUT|PATCH|DELETE)\(\s*"([^"]+)"/, // Gin, Echo
];
const RESET_HINT = /reset|seed|fixture|truncate|purge|test-?support|testing/i;
const SEED_FILE = /(^|\/)(seeds?|seeders?|fixtures?|reset[-_]?db)[^/]*\.(py|ts|js|mjs|cjs|sql|rb|cs|go|java|kt|php)$/i;
const RESERVED_EMAIL = /(^|\.)(example\.(com|org|net)|example|test|invalid|localhost)$/i;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const ROUTE_ARG = /\.(?:route|mockJson|fulfillJson)\(\s*(['"`])([^'"`]+)\1/g;
export const globToRegExp = glob => new RegExp(`^${glob.split('**').map(part => part.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*')}$`);

const posix = p => p.split(path.sep).join('/');
const readIf = file => { try { return fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n'); } catch { return null; } };
const readJsonIf = file => { const t = readIf(file); if (t === null) return null; try { return JSON.parse(t); } catch { return undefined; } };
const precise = value => typeof value === 'string' && value.trim().length > 12 && !/^(TBD|N\/A|unknown|none|pending)$/i.test(value.trim());

function walk(root, visit, dir = root) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    // Generated build output (.next, .next-dev, .nuxt, .svelte-kit) holds bundled copies of source, not evidence.
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name) && !/^\.(next|nuxt|svelte-kit|turbo|cache)/.test(entry.name)) walk(root, visit, abs); }
    else if (entry.isFile()) visit(posix(path.relative(root, abs)), abs);
  }
}

// Follows `npm run x`, `pnpm run x`, `pnpm x` and `yarn x` inside one package's scripts.
export function expandScript(scripts, name, seen = new Set()) {
  if (!scripts || typeof scripts[name] !== 'string' || seen.has(name)) return '';
  seen.add(name);
  const body = scripts[name];
  const nested = [...body.matchAll(/\b(?:npm|pnpm|bun)\s+(?:run\s+)?([\w:.-]+)|\byarn\s+(?:run\s+)?([\w:.-]+)/g)].map(m => m[1] || m[2]);
  return [body, ...nested.map(n => expandScript(scripts, n, seen))].join('\n');
}
export function missingValidators(scripts) {
  const chain = expandScript(scripts, 'e2e:validate');
  if (!chain) return { defined: false, missing: [...VALIDATORS, 'validate-all.mjs'] };
  if (/validate-all\.mjs/.test(chain)) return { defined: true, missing: [] };
  const missing = VALIDATORS.filter(v => !chain.includes(v));
  if (!missing.includes('validate-coverage.mjs') && !/validate-coverage\.mjs[^\n]*--typescript/.test(chain)) missing.push('validate-coverage.mjs --typescript');
  return { defined: true, missing };
}

// ---------------------------------------------------------------- discover
export function discover(root) {
  const devAuth = [];
  const guards = new Map();
  const packages = [];
  const envExamples = [];
  const authStateRefs = [];
  const specs = [];
  const catalogs = [];
  const workflows = [];
  const agents = [];
  const seams = { create: [], delete: [], reset: [], scripts: [] };
  walk(root, (rel, abs) => {
    const base = path.posix.basename(rel);
    if (base === 'package.json') {
      const pkg = readJsonIf(abs);
      for (const [name, body] of Object.entries(pkg?.scripts || {})) {
        if (/seed|reset|fixture|db:|migrate/i.test(name) && !/^e2e/.test(name)) seams.scripts.push({ path: rel, script: name, command: String(body).slice(0, 120) });
      }
      if (pkg && typeof pkg === 'object') {
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        packages.push({ path: rel, playwright: !!deps['@playwright/test'], validation: missingValidators(pkg.scripts),
          e2eScripts: Object.keys(pkg.scripts || {}).filter(k => /^e2e/.test(k)) });
      }
      return;
    }
    if (/^\.env\.e2e\.example$/.test(base)) {
      const text = readIf(abs) || '';
      envExamples.push({ path: rel, variables: [...new Set([...text.matchAll(/^\s*#?\s*(E2E_[A-Z0-9_]+)\s*[=|]/gm)].map(m => m[1]))] });
      return;
    }
    if (base === 'test-catalog.json') {
      const catalog = readJsonIf(abs);
      if (catalog?.tests) {
        const readiness = {};
        for (const t of catalog.tests) readiness[t.executionReadiness || 'unspecified'] = (readiness[t.executionReadiness || 'unspecified'] || 0) + 1;
        catalogs.push({ path: rel, entries: catalog.tests.length, readiness });
      }
      return;
    }
    if (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(rel)) {
      const text = readIf(abs) || '';
      if (/test-catalog|playwright/i.test(text)) workflows.push({ path: rel, manual: /workflow_dispatch/.test(text) });
      return;
    }
    if (/^(\.github\/agents|\.github\/chatmodes|\.claude\/agents|\.opencode|\.codex)\/.*playwright/i.test(rel)) { agents.push(rel); return; }
    if (!SOURCE_EXT.test(rel)) return;
    const text = readIf(abs);
    if (text === null || text.length > 1_000_000) return;
    const lines = text.split('\n');
    // Playwright suites only: unit tests that happen to use .test.ts are not E2E journeys.
    if (/\.(spec|test)\.[cm]?[jt]sx?$/.test(rel) && /@playwright\/test|from ['"][./]+fixtures\/test['"]/.test(text)) specs.push({ path: rel, mocked: MOCK.test(text) });
    if (/\.auth\/|E2E_AUTH_STATE_(PATH|DIR)|storageState/.test(text) && TEST_PATH.test(rel)) {
      lines.forEach((l, i) => { if (/\.auth\/[^'"`\s]*|E2E_AUTH_STATE_(PATH|DIR)/.test(l)) authStateRefs.push({ path: rel, line: i + 1, text: l.trim().slice(0, 160) }); });
    }
    if (TEST_PATH.test(rel)) return;
    if (SEED_FILE.test(rel)) seams.scripts.push({ path: rel, script: base, command: 'seed or fixture source file' });
    lines.forEach((l, i) => {
      for (const pattern of ROUTE_DEFS) {
        const m = l.match(pattern);
        if (!m) continue;
        const method = m[1].toUpperCase();
        const entry = { path: rel, line: i + 1, method, route: m[2] || '(controller route)' };
        // Development-authentication routes are reported as auth candidates, not as data seams.
        if (DEV_AUTH_ROUTE.test(`'${entry.route}'`)) break;
        if (RESET_HINT.test(entry.route)) seams.reset.push(entry);
        else if (method === 'DELETE') seams.delete.push(entry);
        else if (method === 'POST' || method === 'PUT') seams.create.push(entry);
        break;
      }
    });
    let found = false;
    lines.forEach((l, i) => {
      const route = l.match(DEV_AUTH_ROUTE);
      const fn = l.match(DEV_AUTH_FUNCTION);
      if (route || fn) { devAuth.push({ path: rel, line: i + 1, kind: route ? 'route' : 'function', match: (route ? route[1] : fn[1]).slice(0, 120), text: l.trim().slice(0, 160) }); found = true; }
    });
    if (found) {
      const hits = [];
      lines.forEach((l, i) => { if (GUARD.test(l) || ROLES.test(l)) hits.push({ line: i + 1, kind: ROLES.test(l) ? 'roles' : 'guard', text: l.trim().slice(0, 160) }); });
      guards.set(rel, hits.slice(0, 8));
    }
  });
  // Guards and role sets often live beside the endpoint (for example dependencies next to a router).
  for (const dir of new Set(devAuth.map(d => path.posix.dirname(d.path)))) {
    walk(path.join(root, dir), (rel, abs) => {
      const full = dir === '.' ? rel : `${dir}/${rel}`;
      if (guards.has(full) || !SOURCE_EXT.test(full) || rel.includes('/')) return;
      const hits = [];
      (readIf(abs) || '').split('\n').forEach((l, i) => { if (GUARD.test(l) || ROLES.test(l)) hits.push({ line: i + 1, kind: ROLES.test(l) ? 'roles' : 'guard', text: l.trim().slice(0, 160) }); });
      if (hits.length) guards.set(full, hits.slice(0, 8));
    });
  }
  return {
    devAuthCandidates: devAuth,
    devAuthGuards: Object.fromEntries(guards),
    validationWiring: packages.filter(p => p.playwright || p.e2eScripts.length),
    envExamples, authStateReferences: authStateRefs.slice(0, 40),
    routeMocking: { specs: specs.length, mocked: specs.filter(s => s.mocked).length, mockedSpecs: specs.filter(s => s.mocked).map(s => s.path) },
    portal: { workflows, catalogs }, agentDefinitions: agents,
    dataSeams: Object.fromEntries(Object.entries(seams).map(([k, v]) => [k, v.slice(0, 60)])),
  };
}

// ---------------------------------------------------------------- verify
const UNATTENDED_AUTH = new Set(['none', 'app-dev-auth']);
export function verifySetup({ root, docsRoot, setup = null }) {
  const errors = [];
  const notes = [];
  const fail = message => errors.push(`${PREFIX} ${message}`);
  const docsAbs = path.resolve(root, docsRoot);
  if (!setup) setup = readJsonIf(path.join(docsAbs, 'setup-decisions.json'));
  if (!setup) { fail(`setup-decisions.json is missing or not valid JSON under ${docsRoot}; run e2e-ui-test-env-setup`); return { errors, notes, inventory: [] }; }
  const schemaErrors = validate(JSON.parse(fs.readFileSync(path.join(here, '..', 'schemas', 'setup-decisions.schema.json'), 'utf8')), setup);
  schemaErrors.forEach(e => fail(`schema ${e}`));
  if (schemaErrors.length) return { errors, notes, inventory: [] };

  const pkgDir = setup.owningPackage || '.';
  const at = rel => path.join(root, rel);
  const found = discover(root);

  // D: one validation entry point that runs every validator.
  const pkg = readJsonIf(at(path.posix.join(pkgDir, 'package.json')));
  if (!pkg) fail(`owning package ${path.posix.join(pkgDir, 'package.json')} is missing or unreadable`);
  else {
    const wiring = missingValidators(pkg.scripts);
    if (!wiring.defined) fail('the owning package has no e2e:validate script; generate one that runs .agents/contracts/e2e-ui-test/scripts/validate-all.mjs');
    else if (wiring.missing.length) fail(`e2e:validate does not run ${wiring.missing.join(', ')}, so coverage completeness or config format goes unchecked; run validate-all.mjs instead`);
  }

  const envFiles = [...new Set([path.posix.join(pkgDir, '.env.e2e.example'), '.env.e2e.example'])].filter(f => fs.existsSync(at(f)));
  // Declared means an assignment or a documented table row, not a mention inside a comment.
  const envVars = new Set(envFiles.flatMap(f => [...(readIf(at(f)) || '').matchAll(/^\s*#?\s*(E2E_[A-Z0-9_]+)\s*[=|]/gm)].map(m => m[1])));

  for (const lane of setup.lanes) {
    const label = `lane ${lane.laneId}`;
    const personas = lane.personas || [];

    // E: application development authentication, offered from evidence and local by construction.
    if (lane.target === 'local') {
      const choice = lane.authChoice;
      if (!choice) fail(`${label} does not record authChoice (the options offered, the answer and every discovered development-auth candidate)`);
      else {
        const offered = new Set(choice.offered || []);
        if (!offered.has(lane.authMode)) fail(`${label} authMode ${lane.authMode} is not among the offered options ${[...offered].join(', ')}`);
        // Keyed by file and matched text, not line, so unrelated edits to the file do not invalidate the record.
        const recorded = new Map((choice.devAuthCandidates || []).map(c => [`${c.path}#${c.match}`, c]));
        for (const c of found.devAuthCandidates) {
          const entry = recorded.get(`${c.path}#${c.match}`);
          if (!entry) fail(`${label}: development-auth candidate ${c.path}:${c.line} "${c.match}" was not recorded in authChoice.devAuthCandidates`);
          else if (!(offered.has('app-dev-auth') && entry.offered !== false) && !precise(entry.rejectedReason)) fail(`${label}: candidate ${c.path} "${c.match}" was neither offered as app-dev-auth nor rejected with a precise reason`);
        }
      }
    }
    if (lane.authMode === 'app-dev-auth') {
      if (lane.target !== 'local') fail(`${label} uses app-dev-auth on target ${lane.target}; development tokens are local-only`);
      const dev = lane.devAuth;
      if (!dev) fail(`${label} uses app-dev-auth without a devAuth contract`);
      else {
        const pathPart = String(dev.endpoint || '').replace(/^[A-Z]+\s+/, '');
        const tail = pathPart.split('/').filter(Boolean).pop() || pathPart;
        const evidence = (dev.evidence || []).map(e => String(e).replace(/:\d+$/, ''));
        if (!evidence.length || !evidence.some(f => (readIf(at(f)) || '').includes(tail))) fail(`${label}: devAuth endpoint ${dev.endpoint} is not found in its evidence files`);
        for (const f of [...evidence, ...(dev.guardEvidence || []).map(e => String(e).replace(/:\d+$/, ''))]) if (!fs.existsSync(at(f))) fail(`${label}: devAuth evidence ${f} does not exist`);
        if (!(dev.guardEvidence || []).length || !precise(dev.guard)) fail(`${label}: devAuth needs the non-production guard and its evidence`);
        for (const p of personas) {
          if (p.identity !== 'app-token') fail(`${label}: persona ${p.persona} under app-dev-auth must have identity app-token`);
          const role = dev.personaRoles?.[p.persona];
          if (!role || !(dev.rolesSupported || []).includes(role)) fail(`${label}: persona ${p.persona} has no development role among rolesSupported`);
        }
      }
    } else if (personas.some(p => p.identity === 'app-token')) fail(`${label}: identity app-token requires authMode app-dev-auth`);

    // F: one auth-state artifact per identity-bearing persona.
    const identities = personas.filter(p => ['real', 'app-token'].includes(p.identity));
    if (lane.authMode !== 'none' && identities.length) {
      const keys = identities.map(p => p.stateKey);
      if (identities.length > 1) {
        if (!String(lane.authStateLocation || '').endsWith('/')) fail(`${label} has ${identities.length} identity-bearing personas but authStateLocation ${lane.authStateLocation} is not a per-persona directory`);
        if (keys.some(k => !/^[a-z0-9][a-z0-9-]*$/.test(k || '')) || new Set(keys).size !== keys.length) fail(`${label}: each identity-bearing persona needs a distinct stateKey (lowercase, digits, hyphens)`);
        if (envFiles.length && !envVars.has('E2E_AUTH_STATE_DIR')) fail(`${label}: .env.e2e.example does not declare E2E_AUTH_STATE_DIR for per-persona auth state`);
      }
      const unapproved = identities.filter(p => p.identity === 'real' && p.approvedIdentity === false).map(p => p.persona);
      const blocked = new Set((lane.readinessBlockers || []).flatMap(b => precise(b.blocker) && b.owner ? b.personas || [] : []));
      for (const persona of unapproved) if (!blocked.has(persona)) fail(`${label}: persona ${persona} has no approved identity and no readiness blocker; do not fall back to role simulation silently`);
    }

    // H: the test-data contract is evidenced, seeds as a real identity, cleans up, and the specs honour it.
    if (['api-seeded', 'existing-dataset'].includes(lane.dataStrategy) && !lane.data) {
      fail(`${label}: dataStrategy ${lane.dataStrategy} has no data contract (lanes[].data); record it with e2e-ui-test-env-setup`);
    }
    if (['api-seeded', 'existing-dataset'].includes(lane.dataStrategy) && lane.data) {
      const data = lane.data;
      const tail = value => String(value).trim().replace(/^[A-Z]+\s+/, '').split(/[\s/]+/).filter(t => t && !/^[{:<]/.test(t)).pop() || '';
      const evidenced = (files, value) => (files || []).some(f => (readIf(at(String(f).replace(/:\d+$/, ''))) || '').includes(tail(value)));
      if (lane.dataStrategy === 'api-seeded') {
        if (!(data.createInterfaces || []).length) fail(`${label}: api-seeded needs at least one evidenced create interface`);
        if (!precise(data.namespace)) fail(`${label}: api-seeded needs a namespace rule saying where the worker namespace is written on created records`);
        for (const ci of data.createInterfaces || []) {
          for (const f of ci.evidence) if (!fs.existsSync(at(String(f).replace(/:\d+$/, '')))) fail(`${label}: evidence ${f} for creating ${ci.entity} does not exist`);
          if (!evidenced(ci.evidence, ci.interface)) fail(`${label}: create interface "${ci.interface}" for ${ci.entity} is not found in its evidence`);
          const seedAs = ci.seedAs || data.seedAs;
          if (lane.authMode !== 'none') {
            const persona = personas.find(p => p.persona === seedAs);
            if (!persona) fail(`${label}: ${ci.entity} has no seeding persona among the lane's personas`);
            else if (persona.identity === 'simulated') fail(`${label}: ${ci.entity} is seeded as simulated persona ${seedAs}; creating records through the real API needs a real or app-token identity`);
          }
        }
      }
      if (lane.dataStrategy === 'existing-dataset' && !data.dataset) fail(`${label}: existing-dataset needs the named dataset and whether it is read-only`);
      const cleanup = data.cleanup || { mode: 'none' };
      if (cleanup.mode === 'api-delete') {
        if (!(cleanup.interfaces || []).length) fail(`${label}: cleanup mode api-delete names no delete interface`);
        for (const i of cleanup.interfaces || []) if (!evidenced(cleanup.evidence, i)) fail(`${label}: cleanup interface "${i}" is not found in its evidence`);
      }
      if (cleanup.mode === 'reset-command' && (!cleanup.command || !evidenced(cleanup.evidence, cleanup.command))) fail(`${label}: cleanup reset command "${cleanup.command || ''}" is not found in its evidence`);
      if (cleanup.mode === 'disposable-environment' && lane.target !== 'local') fail(`${label}: a disposable environment is accepted only for a local lane; remote targets need api-delete or reset-command`);

      // Spec-level checks: routed to e2e-ui-test-generator by the evaluator.
      const specs = [];
      walk(at(setup.testDir), (rel, abs) => { if (/\.(spec|test)\.[cm]?[jt]sx?$/.test(rel)) specs.push({ rel: path.posix.join(setup.testDir, rel), text: readIf(abs) || '' }); });
      const appPatterns = (data.applicationApiPatterns || []).map(globToRegExp);
      const external = (data.externalMocks || []).map(e => ({ raw: e.pattern, re: globToRegExp(e.pattern) }));
      for (const spec of specs) {
        for (const m of spec.text.matchAll(ROUTE_ARG)) {
          const sample = m[2].replace(/\*+/g, 'x');
          if (appPatterns.some(re => re.test(sample)) && !external.some(e => e.raw === m[2] || e.re.test(sample))) {
            fail(`${label}: spec ${spec.rel} fakes application API route "${m[2]}" in a seeded lane; seed the data through the API, or declare an external mock with a reason`);
          }
        }
        const uuid = spec.text.match(UUID);
        if (uuid && lane.dataStrategy === 'api-seeded') fail(`${label}: spec ${spec.rel} hard-codes record identifier ${uuid[0]}; use the identifiers returned by seeding`);
      }
      const dataFiles = [...specs];
      if (data.dataModule) walk(at(data.dataModule), (rel, abs) => { if (SOURCE_EXT.test(rel)) dataFiles.push({ rel: path.posix.join(data.dataModule, rel), text: readIf(abs) || '' }); });
      for (const file of dataFiles) {
        for (const m of file.text.matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g)) {
          if (!RESERVED_EMAIL.test(m[1])) { fail(`${label}: data module ${file.rel} uses e-mail domain ${m[1]}; synthetic data must use a reserved domain such as example.test`); break; }
        }
      }
    }

    // G: portability is stated, and a mock-based lane is never called portable.
    if (!lane.portability) fail(`${label} does not state portability (portable or lane-specific)`);
    else if (lane.portability === 'portable' && (lane.dataStrategy === 'route-mocks' || personas.some(p => p.identity === 'simulated'))) {
      fail(`${label} is marked portable but uses ${lane.dataStrategy === 'route-mocks' ? 'route mocks' : 'simulated personas'}, which a remote target cannot reuse`);
    }
  }

  // J: the portal exists only when something can be dispatched.
  const catalogPath = setup.catalogPath || path.posix.join(setup.testDir, 'test-catalog.json');
  const catalog = readJsonIf(at(catalogPath));
  const ready = catalog?.tests ? catalog.tests.filter(t => t.executionReadiness === 'Ready').length : null;
  if (setup.portal.enabled) {
    if (!precise(setup.portal.readyBasis)) fail('portal is enabled without readyBasis: the condition under which a catalog entry can be Ready on an unattended runner');
    if (!setup.lanes.some(l => UNATTENDED_AUTH.has(l.authMode) || l.unattendedAuth === true)) fail('portal is enabled but no lane can authenticate on an unattended runner (authMode none or app-dev-auth, or unattendedAuth confirmed)');
    if (catalog?.tests?.length && ready === 0) fail(`portal is enabled but none of ${catalog.tests.length} catalog entries is Ready, so the workflow is inert`);
  }

  // Artifact inventory by necessity.
  const inventory = [];
  const add = (file, category, why) => { if (fs.existsSync(at(file))) inventory.push({ path: file, category, why }); };
  add(setup.configPath, 'load-bearing', 'Playwright configuration');
  for (const lane of setup.lanes) if (lane.fixtureEntryPoint) add(lane.fixtureEntryPoint, 'load-bearing', `fixture entry point for ${lane.laneId}`);
  envFiles.forEach(f => add(f, 'load-bearing', 'environment contract'));
  walk(at(setup.testDir), rel => { if (/\.(spec|test)\.[cm]?[jt]sx?$/.test(rel)) add(path.posix.join(setup.testDir, rel), 'load-bearing', 'authored suite'); });
  add(catalogPath, 'governance', `test catalog (${catalog?.tests?.length ?? 0} entries, ${ready ?? 0} Ready)`);
  add(path.posix.join(path.posix.dirname(catalogPath), 'test-catalog.schema.json'), 'governance', 'repository catalog schema');
  walk(docsAbs, rel => { if (!rel.startsWith('evaluations/')) add(path.posix.join(docsRoot, rel), 'governance', 'plan, coverage or setup record'); });
  const portalInert = !setup.portal.enabled || ready === 0;
  const readyCondition = setup.portal.enabled ? 'at least one catalog entry becomes Ready' : `portal is enabled (${setup.portal.reason})`;
  for (const w of found.portal.workflows) inventory.push({ path: w.path, category: portalInert ? 'inert' : 'load-bearing', why: portalInert ? `portal workflow; load-bearing once ${readyCondition}` : 'portal workflow with dispatchable entries' });
  walk(at(setup.testDir), rel => { if (/select-tests\.[cm]?[jt]s$/.test(rel)) inventory.push({ path: path.posix.join(setup.testDir, rel), category: portalInert ? 'inert' : 'load-bearing', why: 'portal test selection script' }); });
  for (const a of found.agentDefinitions) inventory.push({ path: a, category: setup.agentPlatform === 'none' ? 'inert' : 'load-bearing', why: setup.agentPlatform === 'none' ? 'agent definition for a platform the team did not choose ("no agents" is fully supported)' : `agent definition for ${setup.agentPlatform}` });
  if (portalInert && found.portal.workflows.length) notes.push('The portal workflow is inert; keep it only if the team wants it once entries can be Ready. e2e-ui-test-env-setup never deletes a pre-existing file.');
  return { errors, notes, inventory, discovered: found };
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
  const usage = m => { console.error(`check-setup: ${m}`); process.exit(1); };
  try {
    if (!args.root) usage('--root is required');
    const root = path.resolve(args.root);
    if (command === 'discover') {
      const d = discover(root);
      if (args.json) { console.log(JSON.stringify(d, null, 2)); process.exit(0); }
      console.log('# E2E setup discovery (static evidence to inspect, not decisions)\n');
      console.log(`## Development authentication candidates (${d.devAuthCandidates.length})`);
      d.devAuthCandidates.forEach(c => console.log(`- ${c.path}:${c.line} ${c.kind} "${c.match}"`));
      for (const [file, hits] of Object.entries(d.devAuthGuards)) hits.forEach(h => console.log(`  ${h.kind} ${file}:${h.line} ${h.text}`));
      console.log(`\n## Validation wiring`);
      d.validationWiring.forEach(p => console.log(`- ${p.path}: e2e:validate ${p.validation.defined ? (p.validation.missing.length ? `misses ${p.validation.missing.join(', ')}` : 'runs every validator') : 'is not defined'}`));
      console.log(`\n## Auth state references`);
      d.authStateReferences.forEach(r => console.log(`- ${r.path}:${r.line} ${r.text}`));
      d.envExamples.forEach(e => console.log(`- ${e.path} declares ${e.variables.filter(v => /AUTH|PERSONA|USER/.test(v)).join(', ') || 'no auth variables'}`));
      console.log(`\n## Route mocking: ${d.routeMocking.mocked} of ${d.routeMocking.specs} spec files intercept routes`);
      console.log(`\n## Portal`);
      d.portal.workflows.forEach(w => console.log(`- workflow ${w.path}${w.manual ? ' (workflow_dispatch)' : ''}`));
      d.portal.catalogs.forEach(c => console.log(`- catalog ${c.path}: ${c.entries} entries, readiness ${JSON.stringify(c.readiness)}`));
      console.log(`\n## Playwright agent definitions (${d.agentDefinitions.length})`);
      d.agentDefinitions.forEach(a => console.log(`- ${a}`));
      console.log(`\n## Data seams: ${d.dataSeams.create.length} create, ${d.dataSeams.delete.length} delete, ${d.dataSeams.reset.length} reset or seed routes, ${d.dataSeams.scripts.length} seed scripts or files`);
      for (const kind of ['create', 'delete', 'reset']) d.dataSeams[kind].slice(0, 15).forEach(s => console.log(`- ${kind} ${s.method} ${s.route}  (${s.path}:${s.line})`));
      d.dataSeams.scripts.slice(0, 15).forEach(s => console.log(`- script ${s.script}: ${s.command}  (${s.path})`));
    } else if (command === 'verify') {
      if (!args['docs-root']) usage('--docs-root is required');
      const docsRoot = posix(path.relative(root, path.resolve(root, args['docs-root'])));
      const result = verifySetup({ root, docsRoot });
      delete result.discovered;
      if (args.json) console.log(JSON.stringify(result, null, 2));
      else {
        result.errors.forEach(e => console.log(`FINDING ${e}`));
        result.notes.forEach(n => console.log(`NOTE ${n}`));
        console.log('\n| Artifact | Necessity | Why |\n| --- | --- | --- |');
        result.inventory.forEach(i => console.log(`| ${i.path} | ${i.category} | ${i.why} |`));
        console.log(`\n${result.errors.length ? `FAIL: ${result.errors.length} setup finding(s)` : 'PASS: setup conforms to its recorded decisions'}`);
      }
      process.exitCode = result.errors.length ? 2 : 0;
    } else usage('command must be discover or verify');
  } catch (error) { console.error(`check-setup: ${error.message}`); process.exitCode = 1; }
}
