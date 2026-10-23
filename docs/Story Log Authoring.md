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
