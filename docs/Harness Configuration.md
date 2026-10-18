# Harness configuration (Cycles 1 and 2)

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
The launcher's existing single-fight, batch and encounter-set options retain their
default party and difficulty. New comparison options select their own axes below.

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
outside these cycles. Policy compatibility work remains deferred to Cycle 3,
and balance baselines and changes remain deferred to Cycle 4.

## Matrix comparisons (Cycle 2)

Run `npm run harness` and choose:

- **5: Party parity comparison**: select encounters, all parties or a subset,
  one fixed difficulty, policies, master seed, runs per configuration, action
  limit and workers.
- **6: Difficulty progression comparison**: select encounters, one fixed party,
  all difficulties or a subset, policies and the same execution settings.
- **7: Custom matrix comparison**: select any subset of both parties and
  difficulties, including an explicit full cross product.

Multiple-choice prompts accept comma-separated numbers or exact IDs and `a`/`all`.
Parties display as slash-separated character IDs. For example, choose **5**, then
encounters `1`, parties `a`, difficulty `standard`, policy `basic`, seed `123`,
runs `2`, max actions `1000`, workers `2` for a small ten-party comparison.
For a five-difficulty comparison choose **6**, encounter `1`, party `1`,
difficulties `a`, then the desired policies and execution settings.
Existing direct CLI flags continue selecting a single party and difficulty.

The reusable API in `src/harness/batch/matrix.ts` supports the same selections:

```ts
import { executeMatrix } from "./src/harness/batch/matrix";
import { formatPartyParity } from "./src/harness/batch/matrix-reports";
import { policies } from "./src/harness/policies";

const result = await executeMatrix({
    encounterIds: ["plains_1", "forest_1"],
    parties: "all",
    difficulties: ["standard"],
    policies: [policies.basic, policies.smart],
    masterSeed: 123,
    runs: 2,
    maxActions: 1000,
    workers: 2,
});
console.log(formatPartyParity(result.entries).join("\n"));
```

`parties` accepts `"all"` or an array of three-character arrays. Omitting it
selects Ko/Matsuko/Hinari only. `difficulties` accepts `"all"` or an array of
Cycle 1 difficulty IDs; omission selects Standard only. Empty selections are
rejected. Repeated identical selections execute once. Explicit party order is
preserved; generated combinations follow content roster order. Difficulties
always follow Casual, Standard, Veteran, Extreme, Mythic. Execution order is
encounter, party, difficulty, policy; caller encounter and policy order is preserved.
API batches may have zero runs or a zero action limit; interactive prompts require
positive counts but impose no minimum beyond one run.

Every configuration uses the unchanged `deriveRunSeeds(masterSeed, runIndex)`
mapping. All selections validate before execution. One worker pool serves the
complete request. Ordinary batches do not capture replays. The runner awaits
`onConfigurationComplete(entry, comparison, batchInput)` so consumers can write
the full summary and sample replays before releasing that batch. Returned entries
contain compact metrics and timings only. Memory retains one underlying batch
plus compact rows for the selected configurations, rather than all batch results.
As with ordinary batches, custom policy objects are supported serially; parallel
execution requires registered policy objects. The API performs no file writes
unless the caller supplies an output callback.

The launcher prints and saves compact text tables. Party parity groups stay
separate by encounter, difficulty and policy and include highest/lowest observed
win rates, percentage-point spread and differences from Ko/Matsuko/Hinari when
present. Difficulty progression groups stay separate by encounter, ordered party
and policy. Changes name the previous included difficulty, including skipped
levels. Both tables show runs, win rate, mean rounds, mean decisions, mean peak
bondage and the existing Wilson 95% win-rate interval. Empty API batches show
unavailable rates and differences rather than a measured zero win rate.

Launcher output lives in collision-safe directories such as
`harness-output/<timestamp>_<N>_levels_<M>_policies_matrix/`:

- `run.json`: selected encounter IDs, ordered parties, difficulties, policy IDs,
  master seed, runs per configuration, action limit, requested/effective workers
  and seed mapping.
- `matrix.jsonl`: one compact row appended after each completed configuration,
  in execution order. Row 1 corresponds to `configuration-0001/`, and so on.
- `reports.txt`: the workflow's final text tables (both reports for custom matrices).
- `configuration-0001/`, etc.: the existing batch summary JSON format and at most
  two automatic replay samples for that batch. Separate directories prevent
  configuration filename collisions. Replay samples retain the selected party,
  difficulty, policy and original engine/policy seeds. No complete per-run batch
  JSON is duplicated.

Completed summaries and compact rows remain available if a later configuration
fails. Final report writing happens only after successful execution. No resume
mechanism or large balance benchmark is introduced.

## Implementation map

All source paths below are relative to `src/harness/`:

| Files | Purpose |
| --- | --- |
| `configuration.ts` | Shared optional input fields, effective configuration, defaults and runtime validation. |
| `harness.ts` | Compose the selected catalogs, set difficulty before encounter loading and identify fight results. |
| `batch/batch.ts` | Propagate and identify configuration in serial batches, including empty batches. |
| `batch/batch-worker-protocol.ts`, `batch/batch-worker-job.ts`, `batch/parallel-batch.ts` | Carry validated configuration to workers and identify assembled parallel results. |
| `batch/comparison.ts`, `batch/encounter-sets.ts` | Carry a single configuration through all existing encounter/policy execution and comparison reporting. |
| `batch/matrix.ts`, `batch/matrix-reports.ts` | Validate matrix selections, reuse policy comparisons and workers, retain compact rows and calculate grouped parity/progression reports. |
| `cli/launcher.ts` | Expose party parity, difficulty progression and custom matrix workflows with incremental summaries and replay sampling. |
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
