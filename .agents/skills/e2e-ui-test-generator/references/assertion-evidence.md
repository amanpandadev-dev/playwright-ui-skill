# Coverage Manifest v1 (extract: authored evidence)

## Authored evidence

Use `.agents/contracts/e2e-ui-test/schemas/coverage-manifest.schema.json` for `<docs-e2e-root>/coverage-manifest.json`:

- `schemaVersion: "1.0"`, `applicationId`, `requirements: [{requirementId, coverageStatus}]`.
- `obligations` contains exactly the independently inventoried IDs, each once. Required fields are
  `obligationId`, `requirementId`, `persona`, `preconditions`, `expectedBehavior`, `evidenceLayer`,
  `mockingScope`, `testIds`, `assertionReferences`, `coverageStatus`, and `executionStatus`.
- `evidenceLayer` is `BrowserMocked`, `BrowserIntegrated`, `API`, `Repository`, or `Internal`.
  `mockingScope` lists exact intercepted calls and replaced behavior; use `[]` for no mocking.
  The integrated browser label requires no replaced API calls. Separate mixed evidence into narrower
  obligations and claims; API/internal mocks also cannot prove the backend behavior they replace.
- `assertionReferences` items are `{testId, path, anchor, sourceFingerprint, testSourceFingerprint}`. Put
  `// @e2e-evidence <stable-anchor>` immediately before the concrete assertion statement. Hash the
  assertion's source file and the calling test's source file using the same normalization, so changing
  an action invalidates review even when a helper assertion is unchanged. Multiple assertions/tests per obligation and
  multiple obligations per test are supported. No one-to-one mapping is imposed. Record references with the
  `evidence` list of a `sync-coverage.mjs` patch, which computes both fingerprints; never compute or paste them by hand.
- `review: {status, trigger, input, action, assertions, limitations, reviewer}` records the actual
  semantic review. `status` is `Supported`, `Unsupported`, or `Pending`. Only `Supported` can justify
  Covered. Record limitations explicitly, e.g. "Proves client validation only; API is intercepted."
- Gaps require specific `blocker`, `remediation`, evidenced `owner`, and `blockedActivity` (authoring,
  runtime readiness, or evidence collection with the exact missing prerequisite). `OutOfScope` also
  requires `exclusionAuthority`. Do not turn missing runtime credentials into an authoring gap if the
  concrete contract can be authored. Catalog readiness remains separate.
- Execution is `NotRun` by default. `Passed`, `Failed`, or `Skipped` require `resultReference` to
  supplied evidence. The static check resolves that file; review must confirm it establishes the
  actual test/revision/environment outcome. Never create execution evidence during generation.

Atomic obligations use Planned, Covered, Blocked, NotBrowserObservable or OutOfScope. `Planned` is the
plan generator's input state and carries no test IDs, evidence or review; authoring replaces it, and the
tests-stage evaluation fails while any remains. Split a partially proven obligation further. Parent
rollup: all Covered → Covered; any Covered/PartiallyCovered child → PartiallyCovered; otherwise identical
child statuses → that status; otherwise Planned when some child is Planned and none is Blocked; otherwise
Blocked. Thus an
excluded or internal child cannot silently disappear from a Covered parent.

For linked non-browser authored evidence, optional `supportingTests` entries contain `testId`,
`requirementReferences`, and `automationReference: {specPath}`. IDs must be unique across this list and
the browser catalog. These entries do not enter or alter the portal catalog. The bundled parser
supports JavaScript/TypeScript `test(...)` with expect matchers and the same metadata/evidence anchors
(for example Vitest/Jest API or repository tests); other languages/frameworks require an explicit
static adapter and reviewed evidence. Do not claim a linked internal test is verified if its source
cannot be resolved. Authoring new backend tests remains subject to the requested generation scope.
