# Story Log authoring

The Game Log starts on **Combat**. **Story** presents the same semantic history as localized prose. The selected presentation is shared between the overview and full log and survives layout changes. Full and Wide logs remember each tab's scroll position and whether it follows new events while mounted.

Every overview has compact **Game Log** and **Story Log** tabs. Clicking a name switches the displayed log. In Narrow and Medium, clicking the preview body opens the selected log in the existing full subscreen or dialog. Wide switches its scrollable history in place, with the existing keyboard shortcut focusing that history. The full log uses the same compact text-tab styling. Completed battle results also open the tabbed log in every layout.

## Adding move prose

Add keys to an existing character or campaign localization table under `localization/en/`. Generic narrative text lives in `localization/en/narrative.ts`, which is included in the base string table. New keys in those tables need no TypeScript changes. Use the actual move ID (for example `latexMist`, not its displayed name).

For each attack group, lookup stops at the first nonempty translation in this order:

1. `move.{moveId}.narrative.{band}.plural` — only for multiple distinct targets.
2. `move.{moveId}.narrative.{band}`.
3. `move.{moveId}.narrative.{category}`.
4. `narrative.generic.{category}`.

`band` is `miss`, `graze`, `hit`, or `crit`. The category is `miss` for misses and `hit` for the other three bands. When the exact band equals the category, steps 2 and 3 are the same key. Missing keys, empty/whitespace strings, and `...` placeholders fall through. Keep both generic category translations in every language's base table.

Plural lookup applies to the **exact band**, not the broader category. For example, a group of grazes tries `.graze.plural`, `.graze`, then `.hit`. It does not try `.hit.plural`. Write non-plural fallback strings so that they also read naturally with multiple names; no grammar is rewritten at runtime.

The small `latexMist` examples in `localization/en/skunk.ts` demonstrate `.hit`, `.hit.plural`, and `.crit`. Grazes fall back to `.hit`; misses use the generic miss text.

```ts
"move.latexMist.narrative.hit": "{actor} releases a cloud of mist, catching {targets} in its path.",
"move.latexMist.narrative.hit.plural": "{actor} releases a cloud of mist. {targets} are caught in its path.",
"move.latexMist.narrative.crit": "{actor}'s mist engulfs {targets} with a critical strike.",
```

## Attack variables

| Variable | Value |
| --- | --- |
| `{actor}` | Localized acting entity name, including enemy instance numbering. |
| `{target}` | Localized recipient list; same as `{targets}`. |
| `{targets}` | Localized names joined with the existing Game Log target-list formatter. |
| `{move}` | Localized move name. |
| `{damage}` | Sum of recorded HP damage for the hits in this sentence; zero for non-damaging hits. |
| `{band}` | Localized exact hit-band label. |

Damage, healing, and blocking also have generic consequence sentences. Avoid repeating their numbers in custom attack text if you want to keep the prose brief. A hit does not necessarily deal HP damage or apply a binding/status: write only effects guaranteed by the move and band. Templates describe outcomes; they never determine them.

## Grouping and chronology

Grouping uses semantic exact bands before localization. Consecutive hits on distinct targets with the same band can share a sentence, including when their binding, buff, or resource consequences intervene. Consequences keep their semantic order after the attack sentence. Different bands, repeated recipients, unrelated actions, recurring activation boundaries, and significant transitions such as defeats break the group. This preserves repeated hits and avoids grouping across activations or reordering mixed-band attack sequences.

The existing presentation aggregation retains its net binding/resource/buff endpoints. Optional `order` metadata records chronology only where aggregation would otherwise pull later hits ahead of effects or other targets. Combat ignores this metadata. It survives JSON history saves; older histories without it remain readable in their recorded aggregated order. The renderer never parses mechanical log text or changes source history.

## Other events

Unrolled actions use `narrative.move.{moveId}.action`, then `narrative.event.move`. These templates receive `{actor}` and `{move}`. They never go through hit/miss lookup. Their recorded consequences follow separately.

Other semantic events use the following extensible keys. Edit their translations directly; the authoritative initial wording is in `localization/en/narrative.ts`.

| Key after `narrative.event.` | Variables |
| --- | --- |
| `escape`, `assist` | `actor`, `target` |
| `phase` | `phase` (localized); round and phase boundaries also retain their heading |
| `stance` | `actor`, `stance` |
| `damage`, `healing`, `blocked` | `target`, and respectively `damage`, `healing`, `blocked` |
| `binding` | `target`, `binding`, `change` (recorded signed delta) |
| `bindingBlocked` | `target`, `binding`, `blocked` |
| `bindingTick` | `target`, `binding`; its consequences stay within this activation |
| `buff.added`, `buff.removed`, `buff.changed` | `target`, `buff` (localized name and known severity) |
| `resource` | `target`, `resource`, `change` (recorded signed delta) |
| `trap` | `trap`, `change` |
| `trapTriggered` | `actor`, `trap`, `amount` |
| `character.incapacitated`, `character.rescued` | `target` |
| `enemy.defeated`, `enemy.spawned` | `target` |
| `interrupt` | `actor`, `reason` |
| `refresh` | `target` |
| `retarget` | `target`, `destination` |
| `intention.cancelled`, `intention.weakened`, `intention.discorded` | `target`, `move` |
| `bonus` | `target`, `amount` (recorded signed delta) |
| `encounter.loaded`, `encounter.failed`, `character.loaded`, `character.failed` | `target` (localized name on success, requested ID on failure) |

### Buff prose

Each buff participant tries these keys in order, using the actual buff ID and `added`, `removed`, or `changed` as the operation:

1. `narrative.buff.{buffId}.{operation}.{side}.{severity}` (when side and severity are known).
2. `narrative.buff.{buffId}.{operation}.{side}` (when side is known).
3. `narrative.buff.{buffId}.{operation}.{severity}` (when severity is recorded).
4. `narrative.buff.{buffId}.{operation}`.
5. `narrative.event.buff.{operation}` (the existing generic translation).

`side` is `characters` or `enemies`, determined from the battle's party roster. These keys apply to every participant on that side; no per-character translations are needed. Callers without a roster skip side-specific keys. Linked participants are looked up separately using their own recorded payloads and side, so the same buff can describe both sides differently.

For example, Pounce additions can define `narrative.buff.pounce.added.1`, `narrative.buff.pounce.added.2`, `narrative.buff.pounce.added.3`, and `narrative.buff.pounce.added.4`. Use `narrative.buff.pounce.added.characters.1` and `narrative.buff.pounce.added.enemies.1` for distinct side-specific prose at severity 1. Side-specific prose takes priority over shared prose, including a shared severity-specific key. Missing, blank/whitespace, and `...` translations fall through. No custom buff keys are required.

Templates receive `{target}` (the localized participant name) and `{buff}` (the localized buff name including known severity). Severity comes from the final recorded buff payload, or the initial payload when the final payload is absent, including removal. Older histories without a recorded severity skip the severity-specific keys.

Buff and stance changes already marked as summarized by an explicit incapacitation/rescue transition are omitted. Binding ticks retain separate activation sentences. No custom move prose is required for any move to appear in Story.
