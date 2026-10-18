# Harness configuration (Cycle 1)

Each fight, batch or policy comparison selects one party and one difficulty.
Omitting both retains Ko/Matsuko/Hinari and Standard. Party order is preserved.

API callers can add the following fields to `SingleFightInput`, `BatchInput`,
`PolicyComparisonInput` or `EncounterSetInput`:

```ts
party: ["ko", "naruyo", "sakari"],
difficulty: "mythic",
```

The party must contain exactly three distinct IDs from `ko`, `matsuko`, `hinari`,
`naruyo` and `sakari`. Difficulties are `casual`, `standard`, `veteran`, `extreme`
and `mythic`. Invalid configurations throw a clear error before engine creation
or worker execution, including for empty batches and comparisons.

The direct CLIs accept `--party <id,id,id>` and `--difficulty <id>` anywhere among
their existing positional arguments. The `--option=value` form also works:

```sh
npm run fight -- plains_1 123 basic 42 --party ko,naruyo,sakari --difficulty veteran
npm run batch -- plains_1 123 basic 2 1000 2 --party ko,naruyo,sakari --difficulty mythic
npm run compare -- plains_1,forest_1 123 basic,escape 2 1000 2 --party ko,naruyo,sakari --difficulty extreme --replay-levels none
```

Existing positional arguments, defaults and replay filters retain their meanings.
The interactive launcher continues using its existing default party and difficulty.

Fight results (including saved replay results), batch results, summaries,
comparison results and `run.json` manifests carry the effective `party` and
`difficulty`. Batch replay sampling uses the completed batch's configuration and
original run seeds. Replay state and step serialization are unchanged.

Default filenames retain their existing form. Non-default filenames append the
ordered party and difficulty, for example
`plains_1-basic-ko-naruyo-sakari-mythic.json`. Sample replay filenames include the
same suffix before their sample label. Run directories retain their existing
collision-safe naming scheme.

Configuration does not affect run-index seed derivation, policy RNG streams,
decision logic or combat balance. Policy quality with Naruyo and Sakari remains
outside this cycle. Automatic party/difficulty enumeration and matrix reports
are deferred to Cycle 2; policy compatibility work is deferred to Cycle 3.

## Implementation map

All source paths below are relative to `src/harness/`:

| Files | Purpose |
| --- | --- |
| `configuration.ts` | Shared optional input fields, effective configuration, defaults and runtime validation. |
| `harness.ts` | Compose the selected catalogs, set difficulty before encounter loading and identify fight results. |
| `batch/batch.ts` | Propagate and identify configuration in serial batches, including empty batches. |
| `batch/batch-worker-protocol.ts`, `batch/batch-worker-job.ts`, `batch/parallel-batch.ts` | Carry validated configuration to workers and identify assembled parallel results. |
| `batch/comparison.ts`, `batch/encounter-sets.ts` | Carry a single configuration through all existing encounter/policy execution and comparison reporting. |
| `batch/summary.ts`, `batch/summary-format.ts` | Include effective configuration in saved and console summaries. |
| `batch/replay-samples.ts` | Rerun selected seeds using the completed batch's effective configuration. |
| `output.ts` | Add manifest metadata and distinguish non-default summary and replay filenames. |
| `cli/configuration-cli.ts` | Parse and validate shared single-party and single-difficulty flags. |
| `cli/batch-cli.ts`, `cli/compare-cli.ts` | Accept shared flags while preserving existing positional arguments and replay filters. |
| `cli/fight-main.ts`, `cli/batch-main.ts`, `cli/compare-main.ts` | Pass selections through execution, output metadata and replay capture. |

The tests in `tests/harness/configuration.test.ts` cover all ten combinations,
all five difficulties, invalid inputs, the pre-change default result digest,
real persistent workers, comparisons, saved metadata and replay state.
`tests/harness/fight-main.test.ts` covers fight CLI defaults, explicit flags and
invalid input. The existing `batch-main.test.ts` and `compare-main.test.ts` add
configuration propagation checks and updated metadata fixtures.

Existing fixtures in `tests/harness/batch-cli.test.ts`, `batch.test.ts`,
`launcher.test.ts`, `output.test.ts`, `replay-samples.test.ts` and
`summary.test.ts` now include the required result metadata. This guide documents
the API, CLI syntax, compatibility behavior and remaining cycle boundaries.
