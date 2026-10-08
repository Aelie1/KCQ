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

## Figma Tasks

When implementing UI from a Figma link, always use the connected Figma MCP
server to inspect the referenced design before writing code. Prefer structured
Figma component/variable data over screenshots or visual guesses.

## Protected areas

Treat these as read-only unless the task explicitly requires changing them:

- `src/engine/**`
- `src/content/**`

Do not refactor, relocate, rename, or redesign them while working on UI, harness, localization, tests, tooling, or application wiring.

If a task appears to require modifying them, stop and explain why before making changes.

## Repository structure

- `localization/` intentionally lives at the repository root.
- Do not relocate it under `src/`.
- Keep `StringTable` in Presentation unless explicitly asked to change it.

## Build system

Do not modify:
- TypeScript build configuration
- build output layout
- package scripts
- VS Code launch configuration
- replay runtime paths
- performance tooling paths

unless explicitly requested.