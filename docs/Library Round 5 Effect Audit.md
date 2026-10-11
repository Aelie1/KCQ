# KCQ Library — Round 5 effect audit

Scope: all **42 moves** published by the stock campaign Library, including empowered moves, Burnout-granted Punch/Kick, and Pounce-granted Throw Off. Audit date: 2026-10-10. No engine/content definitions, balance, AI, or resolution behavior changed.

Compared sanitized MoveReference/MoveBuffReference data against the authored player and enemy definitions, relevant binding/callback resolution, existing localization, and shared combat/Encounter presentation. No fake battle resolution or benchmarks were used. All supplied static effects, intrinsic modifiers, target counts, accuracy bands, hit counts, cooldown relationships, statuses, conditions, and resource changes were reviewed. “None” below means no move-specific gap; global visual verification remains pending.

Figma inspected through the connected MCP: Library Move 2, node 233:1923, in [KCQ Mobile Combat Prototype](https://www.figma.com/design/MIRj6sMdLvZdIieDvcSz1Q/KCQ-Mobile-Combat-Prototype?node-id=233-1923). Existing CommandTag, EffectPreview, DamageEffect, PipMeter, BindingMeter, StatusChip, libraryRestrictions, and Encounter recipient grouping are reused. The stateless BindingAmountEffect composes the shared binding bar without inventing current/result values. Shared projectBuffMoveList supports clickable expanded references in the Library while preserving consolidated combat labels.

Outcome profiles show neutral baseline ranges, including intrinsic move potency/accuracy; they are not live defense/difficulty predictions. Binding application profiles are nominal additions before current-value growth/caps. Only multi-hit moves show HITS. Variable binding bars remain unfilled and carry a formula or Variable label; exact/percentage deltas fill only the authored amount scale.

## Ko-chan

| Move | Effects represented | Rendering approach | Outstanding issues |
|---|---|---|---|
| Telekinesis (`telekinesis`) | One enemy; base 30 damage, one hit; all four accuracy/outcome bands. | Shared DamageEffect via EffectPreview; public damage/accuracy. | None. |
| Fairy Telekinesis (`fairyTelekinesis`) | All enemies; base 15 per hit, 2 hits; removes Empowerment. | DamageEffect, 2 HITS summary, per-hit caption, Remove Buff row. | None. |
| Starlight Bindings (`starlightBindings`) | One enemy; Defense −2 and Accuracy −2 for 3 rounds; no accuracy roll. | Public effects → EffectPreview modifier pips; duration summary. | None. |
| Fairy Starlight Bindings (`fairyStarlightBindings`) | All enemies; same two modifiers and 3 rounds; removes Empowerment. | Public buff pips; recipient grouping; Remove Buff. | None. |
| Reflect (`reflect`) | Self; next enemy binding this round is halved (remaining amount rounded down); original incoming amount damages attacker; one charge. | Add Buff row and charge label; localized callback note. | Callback/charge metadata is not public; audited note retained. |
| Fairy Reflect (`fairyReflect`) | Self; prevents next enemy binding this round, returns original amount as damage; removes Empowerment. | Add/Remove Buff rows; localized callback note. | Callback/charge metadata is not public; audited note retained. |
| Fairy Transformation (`fairyTransformation`) | Self Defense +3 for 3 rounds; adds Empowerment if absent; own cooldown 3. | Public modifier pips; linked enabled-move badges from character.empoweredMoves; duration/cooldown tags. | Public buff metadata omits the already-empowered condition; source-checked note states it. |
| Fairy Empowerment (`fairyEmpowerment`) | Ko Defense +3 for 3 rounds and removes Empowerment; other allies Defense +2 for 2 rounds and gain their own empowered moves; own cooldown 3. | Encounter-style Ko/allies groups; public buff pips; linked availability and Remove Buff rows; row durations. | Allies’ enabled-move badges show the union of their kits; each ally receives only their own kit. |
| Power of Denial (`powerOfDenial`) | Defeats a selected non-boss enemy, or completely removes an ally’s strongest existing binding; Exhausted seals this move for the encounter. | Alternative recipient groups; BindingAmountEffect + BindingMeter with −100 overview; Exhausted + linked Block badge. | −100 denotes complete removal within the 100 cap; resolver removes the current amount, not a fixed 100. Existing-binding condition retained. |

## Matsuko

| Move | Effects represented | Rendering approach | Outstanding issues |
|---|---|---|---|
| White Flame (`whiteFlame`) | One enemy; base 30 damage; intrinsic Accuracy +2 included in baseline chances. | DamageEffect; independent Accuracy pip modifier row. | None. |
| Fairy White Flame (`fairyWhiteFlame`) | All enemies; base 30; Accuracy +2; removes Empowerment. | DamageEffect; pips; Remove Buff row. | None. |
| Phoenix Kick (`phoenixKick`) | One enemy; base 30; Potency +3 included in rounded outcome ranges. | DamageEffect; independent Potency pip modifier row. | None. |
| Fairy Phoenix Kick (`fairyPhoenixKick`) | One enemy; base 30 per hit, 2 hits; Potency +3; removes Empowerment. | DamageEffect; 2 HITS; per-hit caption; potency pips; Remove Buff. | None. |
| Immolation (`immolation`) | All enemies; base 75 damage; removes 50% of each caster binding, removed amount rounded up; Burnout lasts encounter, blocks five flame moves, enables Punch and Kick. | DamageEffect; percent BindingAmountEffect; Add Buff; five linked block and two linked enable badges; no accordion. | Public effects omit Burnout moveList and binding reduction; small stock presentation annotations retained, checked against authored callback. |
| Compulsion: Obey (`obey`) | Refreshes an ally who already acted and has no Servitude; Servitude blocks Escape for 2 rounds; own cooldown 3, related compulsion cooldowns 2; free action. | Encounter ally group; Add Debuff; public StatusEffects restriction badge; duration; Move/Shared cooldown tags and links. | Servitude status is missing from move.effects; stock annotation references the public status definition. |
| Compulsion: Stop (`stop`) | One enemy; cancels ordinary enemy intentions; boss intentions weakened by 25%; own cooldown 5, related cooldowns 2; free action. | Boss/enemy groups with Weaken/Cancel semantic rows; Move/Shared summary. | Intentions are callback mechanics; source-checked localized labels retained. |
| Compulsion: Attack Me (`attackMe`) | All enemy intentions retarget Matsuko; self Defense +3 for 1 round; own and related cooldowns 2; free action. | Recipient groups; named character reference; buff pips; duration; cooldown summary. | None beyond the existing callback annotation. |
| Punch (`punch`) | One enemy; base 30 damage; Arms; available through Burnout. | DamageEffect; summary type; linked Immolation source note. | None. |
| Kick (`kick`) | One enemy; base 30 damage; Legs; available through Burnout. | DamageEffect; summary type; linked Immolation source note. | None. |

## Hinari

| Move | Effects represented | Rendering approach | Outstanding issues |
|---|---|---|---|
| Rockfall (`rockfall`) | One enemy; base 10 per hit; 4 hits at empty Subspace, falling as it fills; unusable at 100; does not spend Subspace. | DamageEffect; 4 HITS and per-hit caption; resource-condition notes. | getHits is not public; badge is the authored empty-resource count, not a live prediction. |
| Fairy Rockfall (`fairyRockfall`) | One enemy; base 10 per hit; 6 hits at empty Subspace, falling as it fills; unusable at 100; does not spend Subspace; removes Empowerment. | DamageEffect; 6 HITS; per-hit caption; Remove Buff; condition note. | Same getHits metadata limitation. |
| Store (`store`) | Ally’s strongest binding reduced using neutral escape potency ×2, capped by current binding and free capacity; stores up to 25 and remembers binding type; overflow binds caster; needs Subspace below 100 and existing binding. | BindingAmountEffect reduction bar with formula delta; resource semantic row; overflow binding bar; recipient groups and condition notes. | Amount depends on binding/capacity; empty variable bar avoids invented state. Stored amount may differ from removed amount, as authored. |
| Brace (`brace`) | Self; THIS ROUND; absorbs next enemy binding into Subspace, remembers type; overflow binds caster; requires Subspace below 100. | Summary DURATION badge; Add Buff without charge count; localized callback/capacity notes. | Callback remains descriptive because public references do not expose it. |
| Release (`release`) | Enemy Defense/Accuracy −2 for 2 rounds and spends 25 Subspace; ally receives remembered binding equal to half of up to 50 spent, rounded up; requires at least 25 and remembered type. | Alternative recipient groups; buff pips; duration; variable binding bar; resource and condition notes. | Binding amount/type depend on remembered runtime data, intentionally not evaluated. |

## Skunkette (including its granted victim move)

| Move | Effects represented | Rendering approach | Outstanding issues |
|---|---|---|---|
| Latex Spray (`latexSpray`) | One player; selected body-zone binding, base 30 scaled by outcome; no HP damage. | Shared DamageEffect with a Binding label/tone and public baseline projection; semantic Binding tag; clickable binding references. | Amounts are nominal additions; current-binding growth/caps remain state dependent. |
| Latex Mist (`latexMist`) | All players; one-round Spread severity from shared roll (normally +1 to +5); base 10; hit increases one existing binding, crit increases every existing binding at half effectiveness. | Shared buff renderer with range-labeled pips and duration; variable binding bar; accuracy/base amount and conditional notes. | Public effects omit variable Spread and binding selection; no exact current amount is invented. |
| Pounce (`pounce`) | One unpounced player; paired I–IV victim/attacker buffs. Victim: Immobilized; II Accuracy −1; III Accuracy −2 + Stunned; IV Helpless. Attacker: Defense −2, Accuracy +2/+4/+6/+8. Victim gains Throw Off. Conditional Latex Spray follow-up; own cooldown 2. | Paired recipient groups; all severity buff pips; public status restriction badges; linked Throw Off availability; follow-up reference and difficulty note. | Severity thresholds (<0.875, <0.95, <1.5, otherwise IV) and activation timing are not public metadata. Overview lists alternatives, not simultaneous buffs. |
| Throw Off (`throwOff`) | Victim self-check 40% miss/60% hit; successful hit removes linked Pounce from victim and attacker; applies attacker’s Pounce cooldown 2; free on hit; always available once granted. | Accuracy profile; Remove Debuff and conditional linked-removal note; effect-specific cooldown row linking Pounce. | Cooldown is applied to the attacker’s move, so remains an effect rather than a shared actor cooldown summary. |

## Skunk

| Move | Effects represented | Rendering approach | Outstanding issues |
|---|---|---|---|
| Latex Shower (`latexShower`) | One player; selected body-zone binding; base 30 scaled by outcome. | Shared four-band binding profile; binding links. | Nominal amounts; state-dependent growth/caps. |
| Latex Puddle (`latexPuddle`) | Field; adds base 30 × rolled effectiveness to existing trapPuddle. | Accuracy profile; base amount; semantic Trap row and clickable trap note. | Trap existence and current strength are not public move metadata; no invented starting strength. |
| Latex Regeneration (`latexRegeneration`) | Player binding restoration: graze base 40 × effectiveness capped at recorded peak; hit selected binding to peak; crit all bindings to peaks. | Base amount/accuracy; variable binding-style bar; visible conditional peak-restoration note and binding links. | Peak amounts and restoration callback are not public; meter stays variable rather than displaying a new binding. |
| Latex Explosion (`latexExplosion`) | All four body zones of one player receive base 40 × effectiveness. Miss/no target adds trap +30. Critical heals attacker 60. Noncrit defeat differs by difficulty: Extreme survives contact; Mythic also survives miss. | Binding bar, trap, defeat and heal semantic rows; recipient groups; accuracy/base amount; condition/difficulty links. | Conditional callback values lack public effect metadata; audited notes preserved. Healing is the authored fixed 60, not a percentage of difficulty-scaled HP. |

## Fairy

| Move | Effects represented | Rendering approach | Outstanding issues |
|---|---|---|---|
| Binding Magic (`bindingMagic`) | One player; selected body-zone binding; base 20 scaled by outcome. | Shared four-band binding profile; clickable binding references. | Nominal amounts; state-dependent growth/caps. |
| Healing Magic (`healingMagic`) | Selected enemy heals 25% max HP on hit/crit; crit also heals other damaged Skunkette/Skunk/Fairy allies. | Target Enemy/Enemy Allies groups; Heal rows; hit/critical conditions and named enemy links. | Recipient maximum HP is runtime-dependent; percentages remain descriptive. |
| Empowering Magic (`empoweringMagic`) | Selected enemy Potency +5 for 1 round on hit/crit; crit also buffs other Skunkette/Skunk/Fairy/Queen allies. | Shared Add Buff/pip renderer; recipient groups; one-round summary; conditional named references. | Recipients are alternatives conditional on crit, not unconditional party buffs. |
| Barrier Magic (`barrierMagic`) | Selected enemy blocks 1/2/3 damage applications on graze/hit/crit; each consumes a charge. | Add Buff row; visible callback note and accuracy profile. | Charges are stored in duration internally; they are not rounds. Public metadata lacks charge/outcome information, so no false round-duration badge. |

## Rainmaker

| Move | Effects represented | Rendering approach | Outstanding issues |
|---|---|---|---|
| Latex Rain (`latexRain`) | All players; +10 per affected body zone; graze 2 zones, hit 3, crit 4, miss none. | BindingAmountEffect + BindingMeter with public +10 each; accuracy/base amount; conditional count note; binding links. | Which zones are selected depends on rolled effectiveness; no simulated selection. |

## Skunk Queen

| Move | Effects represented | Rendering approach | Outstanding issues |
|---|---|---|---|
| Skunk Gun (`skunkGun`) | One player; selected body-zone binding; base 35 scaled by outcome. | Shared four-band binding profile; binding links. | Nominal amounts; state-dependent growth/caps. |
| Skunk Collar (`skunkCollar`) | One player; base 50 scaled by outcome to actual latexCollar; own cooldown 3. Collar ticks add ceil(value/5) to each body zone. | Binding profile; actual Collar link; ordinary cooldown tag. Linked binding page: Description → Special Rules (1/5) → Effects. | Transfer is authored binding behavior, represented on the clickable binding page; no mechanic change. |
| Skunk Perfume (`skunkPerfume`) | Alternative Defense −2 or Escape −2 for 4 rounds (Willpower check), or heals damaged Skunkette/Skunk/Fairy allies for 10% max HP; own cooldown 5. | Two Add Debuff/pip rows with alternative notes; Heal group; duration/cooldown tags; Willpower label. | Variant selection is intention data absent from public move.effects; visible alternatives preserved. |
| Call Reinforcements (`callReinforcements`) | HP thresholds 80/60/40/20%; current wave chooses Skunkette/Skunk/Fairy composition, starting HP and later Accuracy bonuses. | Spawn semantic row; named enemy links and threshold/wave note. | Wave table is not public. UI summarizes composition; exact per-wave count/HP/modifier table needs authored reference metadata (see below). |
| Latex Rainmaker (`latexRainmaker`) | HP thresholds 2/3 and 1/3; construction wave spawns Rainmaker with wave-specific starting HP/Accuracy bonus. | Spawn semantic row with Rainmaker link; threshold and wave note. | Exact wave HP/Accuracy data are not public; needs authored reference metadata (see below). |

## Metadata limits and source findings

Public MoveBuffReference currently exposes id, recipient, modifiers, statuses and round duration; it omits moveList, conditional effect branches, callback charges, variable amounts and summon-wave data. Existing stock presentation annotations were corrected rather than changing the protected engine/content contract. Named references use localized public IDs and stay campaign-scoped. A future public metadata change can remove these annotations without changing gameplay.

- Empowerment on Fairy Transformation is added only if absent. On Fairy Empowerment, Ko consumes theirs and other allies receive each recipient’s own empowered kit; the group badges are the available kit union, not a promise that every ally gains every move.
- Power of Denial uses **−100** as requested for complete removal under the stock cap. Actual resolution removes the strongest binding’s current value. Its condition note explicitly states complete removal and requires an existing binding.
- Store removal uses min(current strongest binding, neutral escape potency ×2, free Subspace room), while storage adds up to 25. These are intentionally different authored quantities. No second implementation calculates them in the Library.
- Pounce severity is selected by effectiveness: I below 0.875, II below 0.95, III below 1.5, IV otherwise. Buffs begin inactive; existing activation timing is retained. Follow-up Spray is at ≥1.75, or ≥0.95 on Extreme, or always on Mythic. The UI shows all severity alternatives and the follow-up condition, not a simulated outcome.
- Barrier Magic uses its internal duration as a **charge count**, not an elapsed round duration. Its audited callback note remains visible.
- Call Reinforcements authored waves: 1 Skunkette at half HP; 2 Skunkette at full HP; 3 Skunk; 4 Skunkette + Skunk; 5 Skunk + Fairy; 6 all three; 7 all three with Accuracy +2; 8 +4; 9 +6; 10 +8. These exact counts/HP/buffs are not exported by the public Library, so the UI keeps the existing wave summary instead of creating a duplicate wave table.
- Latex Rainmaker authored waves: half HP; full HP; Accuracy +2; +4; +8. The public reference exposes neither the wave selector nor these payloads. Exact structured wave previews require authored metadata.
- Conditional trap callbacks require an existing trap and current/remembered binding data. The Library represents their rule without fabricating runtime state.

## Validation

Focused Library and shared renderer tests cover all published entries and isolation; linked move availability; buff status modifiers and colored restrictions; reduction bars; HITS; Brace summary; own/shared/unequal/related-only cooldowns; single-level status headings; Collar ordering; multi-recipient conditions; localization and history.

TypeScript build/web/test checks and both normal engine/web builds pass. Full normal suites retain **12 pre-existing failures**, reproduced against unchanged HEAD: one Ko content test plus 11 DOM failures in combat cleanup (3), combat interactions (1), combat playback (4), combat reactions (2), and incoming binding playback (1). No new failure appeared. Final totals: **1,605 passed / 1 pre-existing failed** in 112 normal test files; **322 passed / 11 pre-existing failed** in 17 DOM test files. All **134 focused Library/shared-renderer checks** pass (Library 18 + shared move availability 8 + effect previews 19 + Library DOM 89). Build/web/test TypeScript checks, npm run build, Vite production build, and git diff --check pass.

**Manual verification remaining:** browser-rendered glyph fitting/overlap at 320px and 390px. The available browser-control tool returned no browsers, and creating an in-app browser returned “Browser is not available: iab”. Responsive rules are tested (four shrinkable columns, compact width cap, unchanged larger typography, wrapping summary). Happy DOM does not perform layout, so a rendered mobile visual pass could not be completed here.
