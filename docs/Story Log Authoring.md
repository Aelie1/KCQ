# KCQ Story Log v4: authored keys

All prose is opt-in. Missing, blank, and `...` keys produce no paragraph. No `narrative.event.*` generic text is used. A story entry is only rendered if it contains authored prose, except phase headings, which appear only when the phase contains a subsequent authored event.

For natural-language lists, **optionally** add one system string to `localization/en/system.ts`:

```ts
"ui.storyLog.targetListFinal": "{first} and {second}",
```

Without this optional key, the renderer uses the existing `ui.gameLog.targetList` separator (commas). No localization change is required to run.

- `move.{moveId}.narrative.action` — move with no hit roll
- `move.{moveId}.narrative.miss|graze|hit|crit` (and `.plural`) — same-band results
- `move.{moveId}.narrative.mixed` (and `.plural`) — combination of misses and non-misses
- `buff.{buffId}.narrative.added|removed|changed[.{severity}]` — one paragraph per effect, operation and severity **per action**, regardless of recipient count. Use `.characters` or `.enemies` before severity only if distinct side narration is explicitly authored.
- `binding.{bindingId}.narrative.increased|decreased.{finalLevel}` — narrate meaningful level transitions, with optional fallback to the explicitly authored `.increased` / `.decreased` key
- `character.narrative.incapacitated|rescued`, `enemy.narrative.spawned|defeated` — generic authored transitions; `entity.{id}.narrative.{operation}` can override them
- `trap.{trapId}.narrative.triggered` — trap triggers (not stock changes)
- `escape.narrative.progress|failed`, `assist.narrative.progress|failed` — binding reduction to the escapee distinguishes progress from no progress

## Substitutions

- Move: `{actor}`, `{move}`, `{target}` / `{targets}` (all selected targets), `{hits}` (non-misses), `{misses}`, `{grazes}`, `{crits}`, `{damage}`, `{band}`.
- Buff: `{target}` / `{targets}` (all targets in a grouped consequence), `{buff}`, and `{actor}` for move/escape actions.
- Binding: `{target}`, `{binding}`, `{level}` (final level), `{previous}` (prior level).
- Character/enemy: `{target}`.
- Trap: `{actor}` / `{targets}` (all triggering actors), `{trap}`, `{amount}`.
- Escape/assist: `{actor}`, `{target}`, `{amount}` (binding reduced), `{bindings}`.

## Sample keys

```ts
"move.latexMist.narrative.mixed": "{actor} emits a cloud of mist. {hits} are caught, but {misses} avoid it.",
"buff.latexMist.narrative.added.3": "The latex on their bodies grows more active.",
"binding.latexArms.narrative.increased.severe": "The latex on {target}'s arms forces them to fold into skunk paws.",
"character.narrative.incapacitated": "{target} loses control of her body!",
"enemy.narrative.defeated": "{target} collapses!",
"escape.narrative.progress": "{actor} tears at her bindings and manages to loosen them.",
"trap.trapPuddle.narrative.triggered": "{targets} stumble into the latex puddle!",
```

Existing tests in `tests/ui/storyLog.test.ts` target the old mechanical transcript renderer; replace that entire file with the included `storyLog.test.ts`.

## Further documentation

The new Story Log already supports quite a few combinations, but the important distinction is that you don't need a string for every possible combination of outcomes. The renderer has a fallback hierarchy.

Here's the complete inventory of supported attack narration keys.

## 1. Non-accuracy attacks

These are moves without a recorded accuracy roll, such as an ability that simply applies an effect.

| Key suffix | When used             |
| ---------- | --------------------- |
| `.action`  | No rolled hit results |

Example:

```
"move.example.narrative.action":
    "{actor} releases a cloud of black mist."
```

There's no built-in `.success` or `.failure` alternative for non-accuracy moves. Any consequences are narrated separately through their own effect strings.

## 2. Accuracy attacks — single target

These apply when an attack has rolled results, including multi-hit attacks aimed at one enemy.

| Key suffix | When used                          |
| ---------- | ---------------------------------- |
| `.miss`    | Every roll missed                  |
| `.graze`   | Every roll grazed                  |
| `.hit`     | Every roll hit normally            |
| `.crit`    | Every roll critically hit          |
| `.mixed`   | At least one miss and one non-miss |

For example:

```
"move.example.narrative.miss": "...",
"move.example.narrative.graze": "...",
"move.example.narrative.hit": "...",
"move.example.narrative.crit": "...",
"move.example.narrative.mixed": "...",
```

There are two additional behaviors worth knowing:

Mixed non-miss results: If a multi-hit attack has both a graze and a critical hit, but no misses, the renderer falls back to `.hit`.

Mixed misses: If it has a miss plus any successful hit band, it looks for `.mixed`, even when there are multiple different successful bands.

## 3. Accuracy attacks — multiple targets

The same five categories exist, but with optional `.plural` variants.

| Key suffix      | When used                         |
| --------------- | --------------------------------- |
| `.miss.plural`  | All targets missed                |
| `.graze.plural` | All targets grazed                |
| `.hit.plural`   | All targets hit normally          |
| `.crit.plural`  | All targets critically hit        |
| `.mixed.plural` | Some rolls missed, others did not |

Example:

```
"move.example.narrative.miss.plural": "...",
"move.example.narrative.graze.plural": "...",
"move.example.narrative.hit.plural": "...",
"move.example.narrative.crit.plural": "...",
"move.example.narrative.mixed.plural": "...",
```

Plural is determined by whether the recorded rolls involve more than one distinct target, not simply whether the move is designated AOE.

### Actual fallback order

EXAMPLE: ALL THREE TARGETS CRITICALLY HIT

1

`crit.plural`

2

`crit`

3

`hit.plural`

4

`hit`

The renderer uses the first authored, nonblank string. If none exists, that attack produces no action narration.

For example, a multi-target mist attack can use `.hit.plural` for ordinary hits and `.mixed` when some characters avoid it, without requiring every possible variant to be written.

## 4. Substitution variables

All attack strings can use the following placeholders:

| Variable    | Meaning                           |
| ----------- | --------------------------------- |
| `{actor}`   | Attacker's name                   |
| `{move}`    | Move name                         |
| `{target}`  | All targets with recorded rolls   |
| `{targets}` | Same as `{target}`                |
| `{hits}`    | Targets with non-miss results     |
| `{misses}`  | Targets whose rolls missed        |
| `{grazes}`  | Targets with graze results        |
| `{crits}`   | Targets with critical results     |
| `{damage}`  | Total damage across recorded hits |
| `{band}`    | Localized result band or category |

One caveat: the name lists are deduplicated, so a three-hit attack against the same target doesn't produce three copies of the name.

## 5. Consequence strings

These are independent of the attack's accuracy. They're especially relevant to your goal of combining multiple effects into a single flowing description.

| Category            | Supported strings                                                    |
| ------------------- | -------------------------------------------------------------------- |
| Buffs / debuffs     | `added`, `removed`, `changed`                                        |
| Buff severity       | `added.1`, `added.2`, etc.                                           |
| Buff recipient side | `added.characters`, `added.enemies`, including severity variants     |
| Bindings            | `increased`, `decreased`, optionally followed by final severity name |
| Characters          | `incapacitated`, `rescued`                                           |
| Enemies             | `spawned`, `defeated`                                                |
| Traps               | `triggered`                                                          |

Buff consequences are grouped across recipients when the same buff, operation, and severity are involved. Different severities can still produce separate passages.

Binding narration only happens on a severity-level transition, not every numeric change.

Some mechanical outcomes, including ordinary damage totals, resources, cooldowns, and intention manipulation, do not currently have their own authored Story Log strings.

## 6. What you actually need to write

For each attack, I'd start with just these:

miss
hit
mixed
hit.plural
mixed.plural

For your mist example, `hit.plural` and `mixed.plural` are probably the most useful specialized variants. You might want `miss.plural`, but the fallback to singular `miss` can suffice if written generically.

One important implementation detail: The Story Log currently renders the attack narration and its consequence narrations as separate paragraphs in the view model. So the strings and grouping already exist, but your desired presentation—

> Skunkette B releases a cloud of black mist that Ko-chan, Matsuko, and Hinari cannot avoid! Their bindings awaken and react to attempts to remove them.

—will still require a presentation change to join those pieces into one paragraph.

That is a formatting change we can address after you've written the strings, without throwing away the current event structure.