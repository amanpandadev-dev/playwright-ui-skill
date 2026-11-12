# Scoped and Full-Coverage Generation (extract: metadata repair)

## Scoped metadata repair and batching

A coverage request authorizes correcting inaccurate claim metadata for its exact scope without
pretending the underlying requirement changed. Remove false obligation mappings from scoped manifest,
plan, ledger and catalog projections, retain the valid scenario and stable test ID, and report each
correction with old claim, actual evidence and replacement classification. Do not delete a valid test,
change its actions/assertions or expand requirements under metadata repair. Behavior-changing replacements
still require exact artifacts and explicit replacement authority. Out-of-scope false claims are reported,
not silently changed. A sorting journey wrongly tagged as approval retains its sorting identity while
missing approval and rejection obligations receive new concrete coverage or precise blockers.
