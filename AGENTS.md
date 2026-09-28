# Codex instructions

## Generated harness output

- `harness-output/` contains generated benchmark summaries and very large replay artifacts.
- Do not recursively inspect `harness-output/`.
- Do not open, read, grep, parse, summarize, or otherwise ingest replay files unless the user explicitly asks for replay analysis.
- Do not run large harness benchmarks or 1000-run comparisons unless explicitly requested.
- The user will run balance/performance benchmarks manually.
- For implementation tasks, use focused tests, harness tests, type checks, builds, and `git diff --check`.

## Validation

- Prefer focused tests for changed code.
- Run the normal test/type/build checks when appropriate.
- Avoid generating large benchmark artifacts as part of routine validation.