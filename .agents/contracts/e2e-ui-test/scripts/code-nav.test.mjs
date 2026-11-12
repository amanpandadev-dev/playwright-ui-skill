import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findGraph, relativize, status } from './code-nav.mjs';

function repo() {
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'code-nav-'));
  const root = path.join(outer, 'app');
  fs.mkdirSync(path.join(root, 'frontend', 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'frontend', 'src', 'Page.tsx'), 'export {};');
  return { outer, root };
}
const graphAt = (dir, when) => {
  fs.mkdirSync(path.join(dir, 'graphify-out'), { recursive: true });
  const file = path.join(dir, 'graphify-out', 'graph.json');
  fs.writeFileSync(file, '{}');
  fs.utimesSync(file, when, when);
  return file;
};

test('no graph means search, not failure', () => {
  const { root } = repo();
  assert.equal(findGraph(root), null);
  assert.equal(status(root).state, 'missing');
});

test('a graph in a parent folder is found', () => {
  const { outer, root } = repo();
  const graph = graphAt(outer, new Date());
  assert.equal(findGraph(root), graph);
});

test('a graph newer than the source is fresh', () => {
  const { root } = repo();
  graphAt(root, new Date(Date.now() + 60_000));
  assert.deepEqual([status(root).state, status(root).changedCount], ['fresh', 0]);
});

test('files changed after the build are listed so they get read directly', () => {
  const { root } = repo();
  graphAt(root, new Date(Date.now() - 60_000));
  const result = status(root);
  assert.equal(result.state, 'stale');
  assert.deepEqual(result.changed, ['frontend/src/Page.tsx']);
});

test('dependency folders never count as changed', () => {
  const { root } = repo();
  graphAt(root, new Date(Date.now() + 60_000));
  const dep = path.join(root, 'frontend', 'src', 'node_modules');
  fs.mkdirSync(dep);
  const file = path.join(dep, 'x.ts');
  fs.writeFileSync(file, '');
  fs.utimesSync(file, new Date(Date.now() + 120_000), new Date(Date.now() + 120_000));
  assert.equal(status(root).state, 'fresh');
});

test('paths print relative to the repository', () => {
  const { outer, root } = repo();
  const graph = path.join(outer, 'graphify-out', 'graph.json');
  assert.equal(relativize('NODE x [src=app/frontend/src/Page.tsx loc=L1]', root, graph), 'NODE x [src=frontend/src/Page.tsx loc=L1]');
});

import { decide, readDecision } from './code-nav.mjs';

test('a stale or missing graph asks, a fresh one does not', () => {
  const { root } = repo();
  const docs = path.join(root, 'docs');
  assert.deepEqual([status(root, undefined, docs).ask, status(root, undefined, docs).skipped], [true, false]);
  const graph = graphAt(root, new Date(Date.now() + 60000));
  assert.deepEqual([status(root, undefined, docs).state, status(root, undefined, docs).ask], ['fresh', false]);
  fs.utimesSync(graph, new Date(0), new Date(0));
  const stale = status(root, undefined, docs);
  assert.deepEqual([stale.state, stale.ask], ['stale', true]);
  assert.match(stale.question, /stale \(1 source file/);
});

test('a skip is saved, stops the question, and is ignored once the graph is fresh', () => {
  const { root } = repo();
  const docs = path.join(root, 'docs');
  const out = decide(docs, 'skip', 'missing');
  assert.equal(out.recorded, true);
  assert.equal(readDecision(docs).choice, 'skip');
  const skipped = status(root, undefined, docs);
  assert.deepEqual([skipped.state, skipped.skipped, skipped.ask], ['missing', true, false]);
  graphAt(root, new Date(Date.now() + 60000));
  const fresh = status(root, undefined, docs);
  assert.deepEqual([fresh.state, fresh.skipped, fresh.ask], ['fresh', false, false]);
});

test('choosing to update clears an earlier skip', () => {
  const { root } = repo();
  const docs = path.join(root, 'docs');
  decide(docs, 'skip', 'missing');
  assert.equal(decide(docs, 'run', 'missing').recorded, false);
  assert.equal(readDecision(docs), null);
  assert.equal(status(root, undefined, docs).ask, true);
});

test('a missing docs root means no decision and the old behaviour', () => {
  const { root } = repo();
  assert.equal(readDecision(undefined), null);
  assert.equal(status(root).state, 'missing');
});
