import test from 'node:test';
import assert from 'node:assert/strict';
import { buildJudgeReport, judgeReportMarkdown } from './judge-report.mjs';

const ob = (id, outcomes, extra = {}) => ({
  obligationId: id, samples: outcomes.length, outcome: extra.outcome || outcomes[0], disagreement: new Set(outcomes).size > 1, incomplete: outcomes.length < 3,
  details: outcomes.map((o, i) => ({ outcome: o, justification: `why ${i}`, citedLine: `line ${i}` })), ...extra,
});

test('counts, sorting and the dispatch mode are recorded', () => {
  const r = buildJudgeReport({ stage: 'tests', model: 'sonnet', dispatch: 'batched', samplesRequired: 3,
    obligations: [ob('B', ['Supported', 'Supported', 'Supported']), ob('A', ['Supported', 'Unsupported', 'Supported'], { outcome: 'Supported' })] });
  assert.deepEqual(r.obligations.map(o => o.obligationId), ['A', 'B']);
  assert.deepEqual(r.counts, { obligations: 2, samples: 6, disagreements: 1, incomplete: 0, byOutcome: { Supported: 2 } });
  assert.deepEqual([r.model, r.dispatch], ['sonnet', 'batched']);
});

test('missing model and dispatch are marked unrecorded, never guessed', () => {
  const r = buildJudgeReport({ stage: 'tests', samplesRequired: 3, obligations: [] });
  assert.deepEqual([r.model, r.dispatch], ['unrecorded', 'unrecorded']);
});

test('every sample keeps its justification and cited line', () => {
  const r = buildJudgeReport({ stage: 'tests', samplesRequired: 3, obligations: [ob('A', ['Supported', 'Supported', 'Supported'])] });
  assert.deepEqual(r.obligations[0].samples[2], { outcome: 'Supported', justification: 'why 2', citedLine: 'line 2' });
});

test('an incomplete obligation is flagged', () => {
  const r = buildJudgeReport({ stage: 'tests', samplesRequired: 3, obligations: [ob('A', ['Supported'])] });
  assert.equal(r.counts.incomplete, 1);
  assert.match(judgeReportMarkdown(r), /Supported \(incomplete\)/);
});

test('markdown cells cannot break the table', () => {
  const r = buildJudgeReport({ stage: 'tests', samplesRequired: 3, obligations: [{ ...ob('A', ['Supported', 'Supported', 'Supported']), details: [{ outcome: 'Supported', justification: 'a | b\nc', citedLine: 'x | y' }] }] });
  const row = judgeReportMarkdown(r).split('\n').find(l => l.startsWith('| A '));
  assert.equal(row.replace(/\\\|/g, '').split('|').length, 7);
});

test('re-derivation results are kept', () => {
  const r = buildJudgeReport({ stage: 'tests', samplesRequired: 3, obligations: [],
    rederivation: [{ section: { path: 'spec.md', heading: '## Spec' }, samples: 3, incomplete: false, missed: [4], extra: [] }] });
  assert.match(judgeReportMarkdown(r), /spec\.md ## Spec \| 3 \| 4 \| none/);
});
