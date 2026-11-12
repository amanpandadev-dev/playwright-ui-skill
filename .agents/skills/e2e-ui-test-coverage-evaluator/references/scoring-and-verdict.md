# Scoring and Verdict

Gates come first. Scores never rescue a failed blocking gate.

## Dimensions

| Dimension | Scale | Weight | Source | Scored at |
| --- | --- | ---: | --- | --- |
| `obligation_accounting` | 0–1 | 15 | Share of inventory obligations present in the manifest | plan, tests |
| `requirement_traceability` | 0–1 | 15 | Traced source-owned identifiers divided by those discovered (G-D02); omitted with a reason when the authority owns none | plan, tests |
| `journey_proportionality` | 0–1 | 10 | Per story: linked tests divided by unblocked browser obligations, capped at 1, averaged | tests |
| `assertion_support` | 1–5 | 25 | Judge: `1 + 4 × credit`, where Supported earns 1, PartiallySupported 0.5, others 0 | tests, with judge |
| `evidence_layer_honesty` | 1–5 | 15 | Judge: `1 + 4 × (1 − WrongLayer share)` | tests, with judge |
| `scenario_class_coverage` | 1–5 | 10 | Needs machine-readable scenario applicability in plans | not yet scored |
| `selector_and_wait_quality` | 1–5 | 10 | `5 −` penalties for `waitForTimeout`, `networkidle`, XPath and CSS-class or ID locators; minimum 1 | tests |

0–1 values are normalized with `1 + 4x`. The final score is the weighted mean over the dimensions that could
be scored. Every report lists omitted dimensions with the reason, and states `weightCoverage`: the share of
the total weight that was actually scored.

## Verdict

Evaluated in this order:

| Verdict | Condition |
| --- | --- |
| **FAIL** | Any blocking gate failed, **or** any high-severity finding, **or** final score below 3.0 |
| **REVIEW** | Any `judge_disagreement`, `judge_incomplete`, `judge_not_run`, `unsupported_claim`, `wrong_evidence_layer`, `partial_support`, `rederivation_mismatch` or `rederivation_not_run` finding; **or** a non-blocking gate failed; **or** final score below 4.2 or unavailable; **or** `weightCoverage` below 0.5 |
| **PASS** | None of the above |

Three rules deserve emphasis:

- **Weight coverage of at least 50% to pass.** A score measured on a minority of the weight must not read
  as a clean pass. At the plan stage only `obligation_accounting` and `requirement_traceability` (30%) can be scored, so a plan-stage
  evaluation is `REVIEW` at best. That is intended: the human Gate A review decides plan approval.
- **A missing or incomplete judge means `REVIEW`.** The judge is mandatory at Gate B.
- **A failed non-blocking gate means `REVIEW`.** A gate failure is never silently a pass.

The report schema enforces the gate-first rules independently: a report whose blocking gate failed, that
has a high-severity finding, or that records judge disagreement cannot carry `PASS`.

## Exit codes

`report`: 0 PASS, 3 REVIEW, 4 FAIL. Either command: 2 when the entry gate refuses, 1 for usage or internal
errors.

## What PASS means

`PASS` states that authored coverage is structurally complete for the implemented gates and that the judge
found the linked tests support their clauses. It never states that tests pass on its own evidence.
`executionStatus` stays `NotRun` unless execution evidence was supplied through `e2e-ui-test-verify-run`; the
report then transcribes the recorded results (gate G-D13), and the evaluator still runs nothing.
