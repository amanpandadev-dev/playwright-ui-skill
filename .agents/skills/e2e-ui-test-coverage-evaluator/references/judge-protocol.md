# Blinded Judge Protocol

The judge answers one question per obligation: **does this test body actually establish this source
clause?** It runs at the tests stage, and Gate B requires it. It also re-derives criteria from sampled source
sections, at either stage (see Criterion re-derivation).

The judge's independence comes from what it is denied. A judge that sees the generator's plan rationale,
the manifest's own status claims, or the review notes will tend to agree with them.

## Bundles

Prepare bundles with:

```text
node .agents/contracts/e2e-ui-test/scripts/evaluate.mjs prepare-judge --root <repo> --docs-root <docs-e2e-root> --catalog <catalog> --typescript <typescript.js>
```

It writes one `bundle.json` per obligation that has linked tests, under
`<docs-e2e-root>/evaluations/judge-<timestamp>/<obligationId>/`. Bundle format `1.1` writes every multi-line text
(test and helper bodies, intercepted routes, the rubric) as an array of lines, so a file viewer shows it whole.
It also writes `prompts.json`: `batches`, one entry per sample number with the batch `prompt` below already filled
in (the default dispatch), and `samples`, one entry per bundle sample with the single-bundle `prompt` below already
filled in. Every path in a prompt is absolute. The prompts are read from this file, so this protocol stays their only
source.

**A bundle contains exactly:**

1. The verbatim source clause, its heading and path, re-checked against the source file.
2. The obligation: persona, preconditions, expected behavior and claimed evidence layer.
3. For each linked test: the test body and the bodies of helpers it directly calls, from the same file or a
   relatively imported file.
4. The routes each test and helper intercepts, and the routes the fixture entry point intercepts.
5. Whether the persona's identity is `real`, `app-token` or `simulated`, from `setup-decisions.json`. An
   `app-token` persona proves the application's own authorization, not identity-provider role assignment.
6. The rejection rubric, [unsupported-mappings.md](unsupported-mappings.md).

**A bundle never contains:** plan prose, the ledger or gap register, the manifest's coverage status,
semantic review, blocker text, `claimedTests`, `mockingScope`, assertion references, or the `@e2e-evidence`
and `@e2e-meta` marker comments, which are stripped from bodies.

## Sampling

For each bundle, run **three independent samples**, each a fresh sub-agent with no shared context:

- Give the sub-agent only the prompt below. Do not paste bundle content yourself, and do not pass the
  manifest, plans, ledger, catalog, earlier samples or any generator transcript.
- Use a different model from the one that generated the tests when one is available, and record its ID
  with `--model`.
- Do not read the bundles yourself before sampling finishes.

Sub-agent prompt:

```text
You are a blinded reviewer. Read only this file: <bundle.json path>. Do not open any other file.
Decide whether the test bodies establish the source clause for the obligation, using the rubric in the
bundle. Treat intercepted routes as mocks: a mocked response proves only how the UI handles that response.
Choose exactly one outcome:
- Supported: the actions and assertions establish the whole clause at the claimed evidence layer.
- PartiallySupported: they establish only part of the clause.
- Unsupported: they do not establish the clause, or they test something else.
- WrongLayer: they establish the behavior only at a different layer than claimed.
Write <sample-N.json path> containing JSON: {"outcome": "...", "justification": "one sentence", "citedLine": "a line copied from a test or helper body in the bundle"}.
```

Write the samples as `sample-1.json`, `sample-2.json` and `sample-3.json` beside the bundle.

### Batched dispatch (the default)

One sub-agent per bundle sample costs a full startup context each, which dwarfs the 3 KB bundle: a story of 46 bundles
needs 138 agents. Instead dispatch one fresh sub-agent per **sample number**: three agents, each judging every bundle
still missing that sample. The three samples of a bundle still come from three separate contexts that share nothing, so
they stay independent of each other. What changes is that one agent judges many bundles in sequence, so its judgments
could influence each other; the prompt tells it to judge each bundle alone. Use the batch prompt from `prompts.json`
`batches` unchanged:

```text
You are a blinded batch reviewer. Below is a list of items. Handle them one at a time, in order, and judge each as if
it were the only one: never compare items and never let one answer influence another.
For each item, read only its bundle file and write only its output file. Do not open any other file, do not list or
search any folder, and do not open any output file but your own.
Items, one per line as: kind | bundle file | output file
<items>
For an item of kind obligation: decide whether the test bodies establish the source clause for the obligation, using the
rubric in the bundle. Treat intercepted routes as mocks: a mocked response proves only how the UI handles that response.
Choose exactly one outcome:
- Supported: the actions and assertions establish the whole clause at the claimed evidence layer.
- PartiallySupported: they establish only part of the clause.
- Unsupported: they do not establish the clause, or they test something else.
- WrongLayer: they establish the behavior only at a different layer than claimed.
Write its output file containing JSON: {"outcome": "...", "justification": "one sentence", "citedLine": "a line copied from a test or helper body in the bundle"}.
For an item of kind rederive: answer the bundle's question: which units state an acceptance criterion, a testable
condition the delivered behaviour must meet? Notes, examples, intent and scope statements are not criteria.
Write its output file containing JSON: {"criterionUnits": [unit indices], "justification": "one sentence"}.
When every item is written, reply with the single word done.
```

Dispatch the batches in **one parallel wave**. Record in the evaluation hand-off that the dispatch was batched by sample
number. Use the single-bundle prompts instead (one agent per entry of `samples`, one parallel wave) when a batch
agent fails to finish and its samples are still missing after one retry, or when the protocol is being followed
strictly. Then run:

```text
node .agents/contracts/e2e-ui-test/scripts/evaluate.mjs judge-status --root <repo> --judge <judge-dir>
```

It exits 0 when every sample is present and valid, or 3 with `missingBatches` (one prompt per sample number, listing
only the bundles still missing it) and `missing` (the samples, without prompts; add `--per-sample` for the single-bundle
prompts). Re-dispatch only the missing ones. It reads only the sample files, never bundle content.

## Aggregation

`evaluate.mjs report --judge <judge-dir>` aggregates each obligation:

- **Outcome.** The strict majority outcome (two of three). The spec's "median" is undefined for
  categorical outcomes, so with no majority the outcome is conservatively `Unsupported`.
- **Disagreement.** Any samples that differ produce a `judge_disagreement` finding routed to a human, and
  the verdict is at least `REVIEW`. Disagreement is never averaged away.
- **Incomplete.** Fewer than three valid samples produce a `judge_incomplete` finding and `REVIEW`.

Majority outcomes become findings:

| Outcome | Finding | Severity | Route to |
| --- | --- | --- | --- |
| `Unsupported` on a `Covered` obligation | `unsupported_claim` | high (forces `FAIL`) | `e2e-ui-test-generator` |
| `Unsupported` otherwise | `unsupported_claim` | medium | `e2e-ui-test-generator` |
| `WrongLayer` | `wrong_evidence_layer` | medium | `e2e-ui-test-generator` |
| `PartiallySupported` | `partial_support` | medium | `e2e-ui-test-generator` |

## Criterion re-derivation

Gate G-D01 proves the inventory accounts for every source unit, but not that it classified them correctly.
The judge therefore re-derives, from the source alone, which units of up to three sampled criteria sections
are acceptance criteria.

`prepare-judge --stage plan` writes only these bundles; at the tests stage they are written alongside the
obligation bundles. Each is `<judge-dir>/rederive/S<NN>/bundle.json` and contains the section path, heading
and its numbered units. It never contains the inventory's dispositions, criterion IDs, reasons or
requirement groups.

Sample three times, blinded as above, with this prompt:

```text
You are a blinded reviewer. Read only this file: <bundle.json path>. Do not open any other file.
Answer the bundle's question: which units state an acceptance criterion, a testable condition the delivered
behaviour must meet? Notes, examples, intent and scope statements are not criteria.
Write <sample-N.json path> containing JSON: {"criterionUnits": [unit indices], "justification": "one sentence"}.
```

A unit is a criterion when a strict majority of samples lists it. A unit the majority finds to be a criterion
but the inventory records as a non-criterion is a `rederivation_mismatch` routed to `e2e-ui-test-plan-generator`; the
reverse is a mismatch routed to a human. Fewer than three samples is `judge_incomplete`. A plan-stage
evaluation without re-derivation samples records `rederivation_not_run`. All of these mean at least `REVIEW`.

## Ceiling

A model judging model-authored tests can share the generator's blind spots. Blinding makes independence
procedural, not absolute. The judge can move a verdict to `REVIEW` or `FAIL`; it can never override a failed
deterministic gate.
