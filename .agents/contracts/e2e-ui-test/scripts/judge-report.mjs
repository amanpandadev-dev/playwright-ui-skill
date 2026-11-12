// The committed record of a blinded judge. The judge folder (bundles, prompts, samples) is working data that is not
// committed, so without this file the report keeps only counts. This keeps each obligation's outcome, every sample's
// justification and cited line, the dispatch mode and the criterion re-derivation result. Pure functions: evaluate.mjs
// reads the samples and writes the files.

export const DISPATCH_MODES = ['batched', 'per-sample'];

/** `obligations` come from aggregateJudge, `rederivation` from aggregateRederivation. */
export function buildJudgeReport({ stage, model, dispatch, samplesRequired, obligations, rederivation = [] }) {
  const sorted = [...obligations].sort((a, b) => a.obligationId.localeCompare(b.obligationId));
  return {
    schemaVersion: '1.0',
    stage,
    model: model || 'unrecorded',
    dispatch: dispatch || 'unrecorded',
    samplesRequired,
    counts: {
      obligations: sorted.length,
      samples: sorted.reduce((n, o) => n + o.samples, 0),
      disagreements: sorted.filter(o => o.disagreement).length,
      incomplete: sorted.filter(o => o.incomplete).length,
      byOutcome: sorted.reduce((m, o) => ({ ...m, [o.outcome]: (m[o.outcome] || 0) + 1 }), {}),
    },
    obligations: sorted.map(o => ({
      obligationId: o.obligationId,
      outcome: o.outcome,
      disagreement: o.disagreement,
      incomplete: o.incomplete,
      samples: (o.details || []).map(d => ({ outcome: d.outcome, justification: d.justification || null, citedLine: d.citedLine || null })),
    })),
    rederivation: rederivation.map(r => ({
      section: `${r.section.path} ${r.section.heading}`,
      samples: r.samples,
      incomplete: r.incomplete,
      missed: r.missed,
      extra: r.extra,
    })),
  };
}

const cell = text => String(text ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

export function judgeReportMarkdown(report, evaluationFile) {
  const c = report.counts;
  const lines = [
    `# Blinded judge report (${report.stage} stage)`,
    '',
    evaluationFile ? `Companion of \`${evaluationFile}\`, which holds the verdict.` : '',
    '',
    `Model \`${report.model}\`. Dispatch: ${report.dispatch}. ${report.samplesRequired} sample(s) required per obligation.`,
    '',
    `${c.obligations} obligation(s), ${c.samples} sample(s), ${c.disagreements} disagreement(s), ${c.incomplete} incomplete. `
      + `Outcomes: ${Object.entries(c.byOutcome).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}.`,
    '',
    '## Obligations',
    '',
    '| Obligation | Outcome | Samples | Justification | Cited line |',
    '| --- | --- | --- | --- | --- |',
  ].filter((l, i, all) => !(l === '' && all[i - 1] === ''));
  for (const o of report.obligations) {
    const first = o.samples.find(s => s.outcome === o.outcome) || o.samples[0] || {};
    const flag = o.disagreement ? ' (disagreement)' : o.incomplete ? ' (incomplete)' : '';
    lines.push(`| ${cell(o.obligationId)} | ${o.outcome}${flag} | ${o.samples.map(s => s.outcome).join(', ')} | ${cell(first.justification)} | ${cell(first.citedLine)} |`);
  }
  if (report.rederivation.length) {
    lines.push('', '## Criterion re-derivation', '', '| Section | Samples | Missed by the inventory | Extra in the inventory |', '| --- | --- | --- | --- |');
    for (const r of report.rederivation) lines.push(`| ${cell(r.section)} | ${r.samples}${r.incomplete ? ' (incomplete)' : ''} | ${r.missed.join(', ') || 'none'} | ${r.extra.join(', ') || 'none'} |`);
  }
  lines.push('', 'The judge folder holds the bundles and raw samples as working files and is not committed.', '');
  return lines.join('\n');
}
