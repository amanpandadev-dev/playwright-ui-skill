# Semantic coverage review

Perform this review after structural validation and before declaring authoring complete. Review inline
or request human review; never launch installed agents, tests, applications, browsers or auth flows.
Metadata, keywords, an `expect` token and a simulated response code are not semantic proof.

For each claimed obligation:

1. Read its verbatim source clause, source location/fingerprint, persona, starting state and evidence
   scope from the independent inventory and manifest. Confirm all compound clauses have obligations.
2. Open the referenced test body and the implementations of helpers it actually calls. For parameterized
   cases, resolve the concrete row, stable identity, inputs and expected outcomes without executing it.
3. Identify the exact trigger, input, action and assertions. Follow assertion evidence anchors into
   helpers and verify the call is reachable from this scenario with the required data and persona.
4. Ask: "If this test passed, which exact requirement clauses would it establish?" Compare the answer
   against the claim. Check both success and required unchanged-on-failure state. For prevention of a
   mutation, feedback alone is insufficient; inspect the request-observation window and state checks.
5. Identify every mocked call and exclude the behavior replaced by it. Simulated status/error handling
   is UI evidence, not real API validation. A success banner is not storage, audit or notification proof.
6. Ask whether removing the required action, allowing the prohibited mutation, or returning the wrong
   state would make these assertions fail. This is reasoning over source, not mutation-test execution.
7. Record `review` evidence using [../../e2e-ui-test-generator/references/assertion-evidence.md](../../e2e-ui-test-generator/references/assertion-evidence.md): status, trigger, input,
   action, concrete assertions and limitations. Retain assertion path/anchor and linked test IDs. Resolve
   unsupported mappings by correcting scoped metadata, adding missing scenarios or recording precise
   blockers; never approve the claim solely because a validator accepted its shape.

Review parent rollups and human-readable plan/ledger/gap prose against the reviewed child obligations.
Confirm scenario-class applicability and examine suspiciously uniform journey counts across varied
stories. Source conflicts must remain visible; follow authority precedence, or isolate the unresolved
decision without blocking unrelated actions.

Regression examples (not application-wide rules): A sorted list cannot establish
approval; short-comment validation cannot establish valid rejection or stale-version handling. Expense
approval success with a mocked mutation cannot establish persisted approval or audit creation. Preserve
the valid UI assertions, remove false claims, and add separately scoped evidence for missing behavior.

Static validators can reject missing rows, broken links, contradictory projections and recognized
vacuous assertions. They cannot reliably infer all business meaning, discover every dynamic test
factory, or certify that review text is truthful. Unsupported source-analysis shapes require explicit
inspection or authoring with supported static forms, never silent omission. Report remaining review
limitations honestly. Full coverage means reviewed authored evidence for the finite confirmed authority,
not all possible scenarios or a successful test run.
