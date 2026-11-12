import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, 'evaluate.mjs');

function judgeDir(bundles, samples = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'judge-'));
  const judge = path.join(root, 'judge');
  for (const name of bundles) {
    const dir = name === 'S01' ? path.join(judge, 'rederive', name) : path.join(judge, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'bundle.json'), '{}');
    for (const [file, body] of Object.entries(samples[name] || {})) fs.writeFileSync(path.join(dir, file), JSON.stringify(body));
  }
  return { root, judge };
}
const status = (root, extra = []) => {
  const r = spawnSync(process.execPath, [script, 'judge-status', '--root', root, '--judge', 'judge', ...extra], { encoding: 'utf8' });
  return { code: r.status, json: JSON.parse(r.stdout) };
};

test('three batches cover every bundle, one per sample number', () => {
  const { root } = judgeDir(['AC-1.a', 'AC-2.a', 'S01']);
  const { code, json } = status(root);
  assert.equal(code, 3);
  assert.deepEqual(json.missingBatches.map(b => [b.sample, b.items]), [[1, 3], [2, 3], [3, 3]]);
});

test('a batch prompt lists each bundle with its absolute output path and keeps the blinding rules', () => {
  const { root } = judgeDir(['AC-1.a', 'S01']);
  const prompt = status(root).json.missingBatches[1].prompt;
  assert.match(prompt, /^You are a blinded batch reviewer\./);
  assert.doesNotMatch(prompt, /<items>/);
  const lines = prompt.split('\n').filter(l => /^(obligation|rederive) \| /.test(l));
  assert.equal(lines.length, 2);
  for (const line of lines) {
    const [, bundle, output] = line.split(' | ');
    assert.ok(path.isAbsolute(bundle) && path.isAbsolute(output), line);
    assert.match(output, /sample-2\.json$/);
  }
  assert.match(prompt, /do not list or\s*search any folder/);
  assert.match(prompt, /never let one answer influence another/);
});

test('both answer formats survive in the batch prompt', () => {
  const { root } = judgeDir(['AC-1.a']);
  const prompt = status(root).json.missingBatches[0].prompt;
  for (const outcome of ['Supported', 'PartiallySupported', 'Unsupported', 'WrongLayer', 'criterionUnits', 'citedLine']) assert.ok(prompt.includes(outcome), outcome);
});

test('a retry batch lists only the bundles still missing that sample', () => {
  const ok = { outcome: 'Supported', justification: 'x', citedLine: 'y' };
  const { root } = judgeDir(['AC-1.a', 'AC-2.a'], { 'AC-1.a': { 'sample-1.json': ok, 'sample-2.json': ok, 'sample-3.json': ok }, 'AC-2.a': { 'sample-1.json': ok } });
  const batches = status(root).json.missingBatches;
  assert.deepEqual(batches.map(b => [b.sample, b.items]), [[2, 1], [3, 1]]);
  assert.match(batches[0].prompt, /AC-2\.a/);
  assert.doesNotMatch(batches[0].prompt, /AC-1\.a/);
});

test('a complete judge needs no batches and exits 0', () => {
  const ok = { outcome: 'Supported', justification: 'x', citedLine: 'y' };
  const full = { 'sample-1.json': ok, 'sample-2.json': ok, 'sample-3.json': ok };
  const { root } = judgeDir(['AC-1.a'], { 'AC-1.a': full });
  const { code, json } = status(root);
  assert.deepEqual([code, json.complete, json.missingBatches], [0, true, []]);
});

test('status output stays small: missing samples carry no prompt unless asked', () => {
  const { root } = judgeDir(['AC-1.a']);
  assert.ok(!('prompt' in status(root).json.missing[0]));
  assert.ok('prompt' in status(root, ['--per-sample']).json.missing[0]);
});

test('an unknown --dispatch value is refused before anything runs', () => {
  const r = spawnSync(process.execPath, [script, 'report', '--dispatch', 'whenever'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--dispatch must be one of batched, per-sample/);
});
