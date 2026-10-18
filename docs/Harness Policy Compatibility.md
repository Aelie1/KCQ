# Harness Cycle 3B: policy compatibility

Cycle 3B generalizes the existing policies without tuning combat balance or win
rates. Smart's Cycle 3A kit knowledge and scoring weights remain intact. Idle
remains passive.

## Decisions changed intentionally

- Escape discovers actors in authoritative action-view order instead of using the
  Matsuko/Hinari rescuer list. Ko, Naruyo and Sakari can now rescue or self-escape
  when their public options permit it. For each actor, bonus escapes are spent
  first; otherwise dangerous assists precede self-escape. The strict `> 20`
  threshold, standing preparation, strongest-binding preference and stable
  preview-order ties are retained. Earlier party members now have priority, so
  original-roster Escape traces can intentionally differ.
- Basic retains Telekinesis, White Flame and Rockfall as its original defaults.
  Naruyo uses Precision Stab (her repeatable damaging attack); Sakari uses
  Malfunction (repeatable damage plus Potency suppression). All party members'
  preferred moves are tried before fallback attacks. If none can be used, Basic
  selects the first available enemy attack identified by public damage previews
  or library damage traits. Invalid targets are skipped, target IDs are unique,
  and incomplete target selections are rejected. Thus a blocked preferred move
  can now produce an attack instead of an unnecessary end turn. The old test
  requiring an end turn in that situation was changed explicitly for this rule.

Neither policy reconstructs cooldowns, costs or restrictions. Engine action
availability and valid target previews remain authoritative.

## Smart and Idle audit

Smart already enumerates available actors, moves, valid target combinations,
escapes and stances in stable public-view order, with end turn last. Kit-specific
lookups tolerate absent characters. Scoring divisions use living enemies or
explicit denominator guards. No demonstrated compatibility defect required a
Smart change; its candidate generation, scores and Cycle 3A rules are preserved.
Idle always ends the turn and needs no roster-specific behavior.

The existing `smart-kit-parity.test.ts` tests remain in place: Naruyo's control,
bonus-escape allocation and one-use reserve; Sakari's debuffs, conditional Discord
conversion, cooldown fallback, empowered variants and one-use reserve. Existing
Smart suites also cover unfamiliar moves/effects, bindings, status restrictions,
stance rejection, linked enemies, periodic pressure and original-character kits.

## Regression coverage

- `policy-roster.test.ts`: all five Basic defaults, blocked-move fallback,
  availability and target selection; all five Escape actors plus an unfamiliar
  actor, assistance, threshold, deterministic ties, standing and bonus escapes.
- `policy-compatibility.test.ts`: all ten parties × five difficulties × four
  policies, one fixed engine/policy seed pair on both `plains_1` and `forest_2`,
  repeated for exact result equality. Each fight has a 48-action budget. Every
  submitted action is checked against the current public view; Smart's candidate
  actions and all component/total scores are checked for legality and finiteness.
  Additional Extreme/Mythic `plains_3` and `tower_1` cases cover bosses, ambushes,
  bindings and reinforcement encounters for every party and policy with another
  fixed seed pair.
- Real persistent two-worker batches are compared with serial execution for all
  200 configurations, using two deterministic runs and a 16-action budget per
  run. Entire results, including traces, final states, seeds and metrics, must
  match. No matrix runner or seed mapping changes are needed.
- `policy-kit-compatibility.test.ts`: engine-backed restrictions on all five
  difficulties, with Naruyo/Sakari/Hinari and no Ko/Matsuko dependency. It covers
  Discord target prerequisites, cooldown expiry, one-use move removal,
  empowerment consumption, Subspace gates and externally granted bonus escapes.
  Each Smart candidate is independently executed from the same saved engine/RNG
  state; scoring itself must leave that state unchanged.
- `policy-historical.test.ts`: original-roster trace/final-state fingerprints for
  Idle, Smart and Basic on two encounters, recorded before the Cycle 3B edits.
  The existing full-result digest in `configuration.test.ts` is retained unchanged.

No generated harness-output files or existing replays are read. The tests observe
small fights directly and use in-memory saves for candidate diagnostics.

## Action limits and tactical limitations

A short compatibility budget is not a required victory/defeat deadline. Capped
runs must consume exactly the budget and advance rounds through legal end-turn
submissions. The audit rejects more than 24 decisions without a round change or
more than two visits to an identical board in one round (allowing Smart's single
stand/inspect/return probe). These guards distinguish budget exhaustion from a
repeating stance/action loop in the current kits. No unexplained round stalls or
repeated-board loops were observed in the compatibility cases.

Idle intentionally does no damage. Basic does not plan control, recovery or
resource expenditure. Escape applies a fixed binding threshold and actor order;
prolonged rescue can leave little offense. Smart uses heuristic public-preview
estimates rather than exact multiround planning: control values, future buffs,
random Discord destinations, bonus-escape allocation and long-term reserves are
approximations. Unfamiliar mechanics receive only generic recognized-effect
credit. These limitations can cause losses or ongoing fights on Extreme/Mythic;
they do not justify new encounter strategies or weight tuning in this cycle.

## Validation

Run focused policy and kit suites first, followed by the compatibility suite,
existing harness suites, `npm run typecheck:test`, `npm run typecheck`, and
`git diff --check`. Compatibility tests write no benchmark/replay artifacts.
Cycle 4 balance baselines and statistical performance comparisons remain manual
and outside this cycle.

Validated for this change:

- Focused original harness and Cycle 3A suites passed before implementation.
- Final compatibility suite: 212 tests passed.
- Remaining harness suites: 691 tests passed in 45 files.
- Repository-wide Vitest run excluding the separately executed compatibility
  suite: 2,694 tests passed in 164 files, including the DOM project. Together,
  2,906 tests passed across 165 files.
- `npm run typecheck:test` and `npm run typecheck` passed (test, build and web
  TypeScript configurations).
- `git diff --check` passed.
