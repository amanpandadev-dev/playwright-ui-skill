# Code navigation

Reading application source is the largest avoidable cost in a pipeline run, because every file read is sent again with
each later call. Use the cheapest step that answers the question, and stop as soon as it does.

## Steps

1. **Check the graph once per step.**
   `node .agents/contracts/e2e-ui-test/scripts/code-nav.mjs status --root <repo> --docs-root <docs-e2e-root> [--scope frontend/src]`.
   `fresh` means use it. `stale` means use it, but read each file in `changed` directly, because the graph predates
   them. Exit code 3 means there is no graph, or the person skipped it: go to step 3.
   Never build or update a graph on your own. When `ask` is `true` and a person can answer (the orchestrator at the
   start of a run, or a skill the person started directly), put `question` to them with AskUserQuestion and these
   options, then act on the answer:
   - **Update the graph (recommended)**: run the graphify skill on the repository (`/graphify <repo> --update`, or
     `/graphify <repo>` when it is missing), then run `status` again. Record `decide --choice run`.
   - **Skip it**: run `code-nav.mjs decide --docs-root <docs-e2e-root> --choice skip`. The choice is saved in
     `<docs-e2e-root>/code-graph.json`, so no later step asks again, and every step uses plain search.
   - **Use the stale graph as it is** (only when `stale`): leave `ask` unanswered for this step and read the files in
     `changed` directly.
   A delegated sub-agent cannot ask. It reads `status`, and when `ask` is still `true` it uses plain search and
   says so in its hand-off. A fresh graph needs no question, and a recorded skip lasts until the graph is fresh.
2. **Query with a budget.**
   `node .agents/contracts/e2e-ui-test/scripts/code-nav.mjs query "<specific question>" --root <repo> --budget 800`.
   Name the screen or component in the question. Each result gives `src` and `loc`. Results are ranked candidates,
   not answers: ignore the ones from unrelated areas, and raise the budget once only if nothing relevant came back.
   Exit code 3 means graphify is unavailable: go to step 3.
3. **Search.** Use a content search for exact strings: a label, a route, a test ID, an error message. The graph holds
   symbols and files, not every UI string, so a visible label usually belongs here.
4. **Read only the lines you need.** Read around `loc` with an offset and a limit. Read a whole file only when the task
   is about the whole file.

## Never load these

- `graphify-out/graph.json` or `graph.html` (megabytes each). Use the query.
- `graphify-out/GRAPH_REPORT.md` as a whole. Search it for a community name when you need one.
- A whole SPEC or PRD when a section will do. `source-sections.mjs` and the inventory's section references locate it.
- A whole `error-context.md` when its `# Error details` section settles the failure. Read the page snapshot only for a
  failure you are about to repair or blame on someone.

## What this does not change

- Evidence must come from the source. Graph output finds where to look, and is never evidence for an `@e2e-evidence`
  anchor, a locator or a triage entry. Open the line before you cite it.
- `INFERRED` graph edges can be wrong, so confirm a relationship in the source before relying on it.
- `e2e-ui-test-coverage-evaluator` judges from the plan and the tests. Judges keep their own protocol and do not use
  this guide.
