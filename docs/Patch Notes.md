# Ko-chan's Quest Patch Notes

## 0.8.1 — 2026-09-25

### Player Cooldowns

* Added first-class cooldown support for player moves.
* Moves can now apply cooldowns to themselves or to other related moves.
* Moves on cooldown remain visible in the action list and display their remaining cooldown.
* Player cooldown state is now exposed through the public game state and ticks alongside enemy cooldowns.
* Matsuko's Compulsions now use the normal cooldown system instead of a hidden cooldown buff.
* Using a Compulsion applies a 2-turn cooldown to the other Compulsions, while Obey, Stop, and Attack Me have self-cooldowns of 3, 5, and 2 respectively.

### Ko-chan

* Added **Power of Denial**, a single-use move that can completely remove a character's strongest binding or instantly defeat a non-boss enemy.
* Normal Reflect now halves incoming binding, rounded down, while still retaliating for the original amount.
* Fairy Reflect continues to completely negate the incoming binding.
* Fairy Transformation and Fairy Empowerment now have 3-turn cooldowns.

### Matsuko

* Immolation damage increased from 60 to 75.
* Immolation now removes half of each binding currently affecting Matsuko.
* Fairy White Flame now attacks all enemies instead of receiving a Potency bonus.
* Fairy Phoenix Kick now attacks twice instead of receiving a Hit bonus.

### Engine / Presentation

* Action menus now display the number of hits for multi-hit moves.
* Cooldown failures now use the normal action-availability system instead of hiding affected moves.

## 0.8.0 — 2026-09-25

### Action Previews
- Move previews now show expected damage ranges for each hit band, including Potency, Vulnerability, and other combat modifiers.
- Target selection now previews non-damage effects such as bindings, buffs, healing, traps, and spawned enemies.
- Targetless actions can now preview their effects or success chance directly.
- Move-level effects are now represented separately from target-specific effects instead of being duplicated across target previews.

### Combat Log / Events
- Reworked the combat event system to preserve causal relationships between actions and their results.
- Moves now keep separate result stacks for each evaluated target, with move-wide effects stored separately.
- Multi-hit moves now display each hit immediately followed by the effects caused by that hit.
- Triggered effects such as damage reactions, linked buffs, defeats, cooldown changes, and other follow-up effects now remain grouped with the action that caused them.
- Phase changes, stance changes, escapes, character loads, and encounter loads now own their resulting effects instead of emitting unrelated flat events.
- Misses are preserved as evaluated target results with no resulting effects.
- Combat presentation and highlighting were updated to understand the new event hierarchy.

### Presentation
- Accuracy previews now include both result chances and their corresponding damage ranges.
- Pure-effect moves now show compact effect descriptions in the action UI.
- Targetless accuracy checks are displayed as a single success chance.
- Fairy Transformation and Fairy Empowerment buff names were simplified to `transformation` and `empowerment`.

### Fixes
- Fixed triggered traps reporting that they consumed zero trap strength.
- Fixed move-level effects disappearing from action previews.
- Fixed preview ownership that could duplicate move-wide effects across multiple targets.
- Fixed several event consumers to preserve target-specific effect ordering after the event-system overhaul.

## 0.7.3 — 2026-09-23

### Balance
- Fairy Empowerment can now be saved by using a character's normal moves.
- Ko-chan now takes binding while using non-empowered Reflect, but still retaliates with equal damage.
- Fairy Reflect negates the incoming binding while retaliating as Reflect did before.
- Matsuko's Stop cooldown increased to 5 turns.
- Hinari's Store now scales with binding severity and is limited by available Subspace.
- Store continues to incur a fixed 25 Subspace cost, with excess overflowing onto Hinari.
- Hinari's offensive Release no longer deals heavy damage; it now applies a debuff.
- Friendly Release now scales with the amount of Subspace released.

### Fixes
- Escape potency can no longer exceed the amount of binding actually present.
- Escape spread effects now use the amount actually removed.
- Fixed cases where an escape/stand sequence could leave the player stuck with no valid follow-up escape.

## 0.7.2 — 2026-09-22

- First public version
