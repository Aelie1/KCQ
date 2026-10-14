# Ko-chan's Quest Patch Notes

## 0.15.0 — 2026-10-14

### Story and Campaign Progression

* Added a connected progression path for **Latex Skunk Attacks!**, linking the existing combat encounters into a single story.
* Added five non-combat story scenes: **Prologue**, three **Interludes**, and **Epilogue**.
* Expanded encounter descriptions into full narrative introductions featuring Ko-chan and the student council.
* Added victory and defeat stories for combat encounters.
* Battle endings now display their story scene, when available, before showing the final results.
* Encounter Details now allows players to revisit story introductions and view victory/defeat narratives after clearing an encounter.
* Added encounter unlocking. Completing a level unlocks the next part of the campaign.
  * Defeating the Skunk Empress is no longer the only way forward. Losing certain Tower battles unlocks easier encounters with additional assistance.
* The Encounter Picker now shows unlocked levels by default.
  * Added a **Show All** option to access the full encounter list without following progression.
* Added **Next Level** navigation after completing battles and when viewing non-combat story scenes.

### Persistent Progress

* The game now remembers completed encounters between browser sessions.
* Added **Best Clear** tracking, recording the highest difficulty on which each encounter has been defeated.
* Encounter selection and details screens display the best recorded clear using a crown indicator.
* Campaign unlocks and clear records are stored locally in the browser.

### In-Game Library

Added a comprehensive **Library** for exploring the game's characters, abilities, and mechanics.

* The Library can be opened from encounter-selection screens or during combat without resetting the current battle.
* Added reference sections for:
  * Difficulties
  * Characters
  * Enemies
  * Moves
  * Passives
  * Bindings
  * Traps
  * Statuses
* Character and enemy entries display their attributes, available abilities, and passive effects.
* Move entries include targeting, accuracy, damage, cooldowns, durations, modifiers, and other relevant mechanics.
* Binding and status entries explain their effects, severity levels, restrictions, and immunities.
* Trap entries describe their possible outcomes.
* Added links between related entries, making it easier to navigate from an ability to its effects or from a character to their moves.
* Expanded descriptions and explanatory text throughout the Library.

### Combat Animations and Feedback

Combat now provides significantly more visual feedback when actions resolve.

* Player and enemy actions are presented sequentially instead of displaying the entire enemy phase immediately.
* Added animated feedback for attacking characters, damage, healing, binding changes, and buff/debuff changes.
* Damage and healing numbers now float above affected enemies.
  * Multi-hit attacks display separate numbers.
  * Critical hits receive distinct visual treatment.
* Binding meters animate when restraints are added or removed.
* Buffs and debuffs receive visual feedback when applied, updated, or removed.
* Defeated enemies now glow and fade out instead of disappearing instantly.
* Battle results wait for the final combat presentation to finish before appearing.

### Combat Playback Settings

* Added adjustable **Combat Playback Speed**:
  * **Instant** — No playback delays.
  * **Fast** — 250 ms between actions.
  * **Normal** — 500 ms between actions.
  * **Slow** — 1000 ms between actions.
* Playback speed is saved between browser sessions.

### Enemy Inspection

* Enemy cards on the battle overview can now be selected to open a dedicated **Enemy Details** screen.
* Enemy Details displays:
  * Current and maximum HP.
  * Active modifiers and effects.
  * Upcoming intentions.
  * Intended targets, accuracy outcomes, and projected effects.
* Enemy cards now display up to two intentions directly, with an indicator when additional intentions are available.
* Cancelled enemy intentions remain visible but are dimmed, making it easier to see which attacks have been prevented.
* Improved the presentation of intentions that target the entire party.

### Game Log Improvements

* Added a compact, continuously updated Game Log to the battle overview.
* Clicking the compact log opens the full Game Log.
* Added a setting to display between **0 and 8 lines** of recent combat activity on the overview.
* The full Game Log now automatically follows new activity while allowing players to scroll back and inspect earlier events.
* Added a **View Game Log** option to the battle-result screen.
* Improved log scrolling, layout, and presentation during combat transitions.

### Keyboard Controls

Added keyboard support throughout the graphical interface.

* Number keys can select characters, enemies, moves, and other available choices.
* Added dedicated combat shortcuts:
  * **9** — Change Stance.
  * **0** — Escape.
  * **Space** — End Turn or confirm an available action.
  * **-** — Open/close the Game Log.
  * **Esc** — Return to the previous screen.
  * **Enter** — Confirm selections where applicable.
* Holding **Shift** displays available keyboard shortcuts.
* Added a setting to choose whether shortcut hints are always visible or appear temporarily.
* Improved keyboard navigation and input handling to avoid repeated actions and accidental commands.

### Status and Effect Presentation

* Added new icons for several buffs and debuffs, including defensive effects, offensive effects, ambushes, and boss enhancements.
* Temporary effects now have more prominent duration indicators.
* Enemy cards display permanent enhancements separately from temporary effects.
* Improved the display of buff ownership, remaining duration, and numerical modifiers.
* Improved projected binding meters and other combat effect displays.

### Character Changes

**Hinari**

* Added **Power of Space**, a powerful new attack that releases everything stored in Subspace.
  * Hits scale with stored Subspace, gaining one hit for every 10 Subspace.
  * Deals 10 base damage per hit.
  * Applies Hit −2 and Defense −2 to the target when enough Subspace is available, with a duration that increases with stored Subspace.
  * Consumes all stored Subspace.
  * Applies Instability to Hinari, preventing Power of Space from being used again during the encounter.

**Ko-chan**

* Adjusted **Thousand Restraints Body**. Only Mouth-type abilities now bypass ordinary binding-based move restrictions; Arms and Legs abilities no longer receive this exception.

### Difficulty and Encounter Balance

**Global Difficulty**

* Reduced enemy Potency on **Veteran** and **Extreme** from +2 to +1.
* **Mythic** retains its +2 enemy Potency bonus.

**Forest Encounters**

* **Forest 1:** Added an additional Skunkette and a starting Willpower penalty to the party.
* **Forest 2:** Added an additional Fairy and a starting Willpower penalty to the party.
* **Forest 3:** Added a starting Willpower penalty to the party.
* Increased the challenge ratings of all three Forest encounters by one star.

**Tower Encounters**

* Rebalanced the Skunk Empress encounters, adjusting enemy Hit bonuses, defensive bonuses, and starting binding pressure.
* **Tower 1:** Increased enemy Hit pressure.
* **Tower 2:** Reduced starting Collar binding from 40 to 30.
* **Tower 3:** Reduced starting Collar binding from 30 to 10 and added an opening ambush against the enemy party.
* Removed the additional Defense modifiers previously granted to Tower bosses by their encounter-specific enhancements.
* Increased the challenge ratings of all three Tower encounters by one star.

**Outside Realm**

* Rebalanced the Goddess encounter's starting enemy enhancements, increasing offensive pressure while removing the previous boss Defense bonus.
* Increased its challenge rating from five to six stars.

**Boss Reinforcements**

* Standardized the enhancement effects granted to summoned enemies and Rainmakers.
* Added distinct buff names and icons to make reinforcement enhancements easier to identify.

### Fixes and Polish

* Improved handling and presentation of cancelled or already-resolved enemy intentions.
* Improved combat event processing for effects that generate additional effects during resolution.
* Updated public combat-state information to expose enemy modifiers and pending effects more consistently.
* Fixed several scrolling, clipping, and navigation issues.
* Improved the presentation of effect previews and combat-status information.
* Expanded automated tests covering progression, persistent records, keyboard navigation, the Library, animations, enemy details, and combat playback.

## 0.14.0 — 2026-10-09

### Game Log Improvements

The combat log has received a major overhaul!

- **Binding activations:** Recurring effects such as Skunk Collar now identify themselves in the log instead of silently increasing restraints.
- **Grouped binding changes:** Attacks affecting multiple binding zones now display their results together instead of filling the log with separate entries.
- **Compact formatting:** Binding changes use short names and numeric transitions, with colors indicating severity.
- **Improved accuracy display:** Hits, grazes, misses, and critical hits are displayed alongside the affected character.
- **Incapacitation and rescue:** These events are now highlighted, with redundant cleanup messages suppressed.
- **Cleaner attack results:** Unnecessary accuracy messages, including rolls against already-defeated enemies, have been removed.
- **Better buff reporting:** Buff additions, removals, refreshes, extensions, and severity changes are presented more clearly.
- **Improved readability:** Reduced text size, fewer repeated labels, and better grouping make the log significantly easier to follow, particularly on smaller screens.

### Combat UI Improvements

- **End Turn indicator:** The End Turn button is dimmed while party members still have actions available. It remains usable if you want to end your turn early.
- **Faster targeting:** Single-target attacks execute immediately when you select a valid target, removing the extra confirmation click.
- **Multi-target attacks:** Moves requiring multiple target selections retain their existing confirmation flow.

## 0.13.0 — 2026-10-08

### Title Screen / Campaign Selection

* Added a proper graphical title screen as the new entry point for KCQ.
* Added campaign selection before encounter selection.
  * The currently available campaign is **Latex Skunk Attacks!**
* Added the language selector to the title screen.
  * English is currently the only bundled language.
* Added game credits, copyright, and version information to the title screen.
* Version displays now include the build's Git revision when available.

### Battle Results

* Added dedicated Victory and Defeat result screens when a battle ends.
* Battle results now summarize the encounter, difficulty, rounds, and player actions.
* Added post-battle statistics for:
  * successful Escapes and average binding removed;
  * damaging attacks, including average damage and the strongest hit;
  * enemy binding attacks, including average binding and the strongest attack;
  * peak total party binding on victory;
  * incapacitations and rescues when applicable.
* Defeats now show the remaining boss HP, or remaining enemy HP for encounters without a boss.
* Added **Retry** and **Back to Level Select** actions after battle.
* The completed battle remains visible behind the result window while its controls are disabled.

### Settings / Navigation

* Added a shared graphical Settings menu to encounter-selection screens and battles.
* Settings can be opened without leaving or resetting the current screen.
* Added controls for:
  * resuming the game;
  * language selection;
  * retrying the current battle;
  * returning to Level Select;
  * returning directly to the Title Screen.
* Returning to the Title Screen from an active battle now cleanly ends and disposes that battle.
* Settings now display the current version and Git revision in the upper-right corner.

### Character Status Presentation

* Reduced unused space on character screens by hiding empty status sections.
* Zero-value capabilities are no longer displayed unless the capability is completely blocked.
* Binding zones with no binding are no longer shown in character details.
* Renamed the character **Effects** section to **Buffs**.
* Buff details can now show moves granted or blocked by the buff.
* Improved wrapping and layout for status details to avoid unnecessary blank space.

## 0.12.0 — 2026-10-07

### Encounter Selection

* Added a graphical Encounter Picker as the new entry point for the game.
* Added Encounter Details screens showing:
  * challenge rating;
  * encounter description;
  * enemy lineup, rank, and HP;
  * encounter-specific starting effects and special conditions.

### Difficulty Selection

* Added a dedicated graphical Difficulty Select screen between Encounter Details and battle.
* All five difficulty levels can now be selected directly in the graphical interface.
* Difficulty descriptions are shown before starting the encounter.
* Global difficulty modifiers are displayed using the normal buff/effect preview system.
  * Casual shows the player Hit and Escape bonuses.
  * Veteran, Extreme, and Mythic show the enemy Potency bonus.
* Extreme and Mythic now show their campaign-specific enemy rule changes before battle.

### Graphical Navigation / Web

* The graphical interface is now the default KCQ web entry point.
* The normal flow is now:
  * Encounter Picker → Encounter Details → Difficulty Select → Battle.
* The earlier browser-console interface remains available at `console.html`.

### Layout / Presentation

* Reworked graphical screens around a shared viewport-sized layout.
* Headers and action buttons now remain in fixed screen regions while the main content area scrolls independently.
* Unified Encounter Picker, Encounter Details, battle, targeting, Escape, character details, and game-log screens around the same screen shell.
* Improved responsive scaling to account for the actual browser viewport, including mobile visual-viewport changes.
* Reworked effect previews for numeric resources and traps to show current and projected values with reusable projected meters.
* Effect previews can now group effects by recipient, avoiding repeated recipient labels when several effects apply to the same target.
* Encounter setup previews now use zero-baseline projected values where appropriate, making starting traps, bindings, and other setup effects easier to read.

## 0.11.6 — 2026-10-06

* Binding bars now show the peak value as a hollow section, and the main bars show the incoming binding from all current intentions as a faded section

## 0.11.5 — 2026-10-06

### Escape / Capability Presentation

* Capability meters now distinguish between a numeric modifier and a capability being completely blocked.
  * Attack-type meters display `BLK` when attacks are disabled.
  * Escape displays `BLK` only when Escape itself is disabled, rather than when all individual escape choices happen to be unavailable.
* Escape previews can now determine whether a selected escape is expected to grant a bonus escape.
  * Spread generated by the escape is taken into account, including spread that applies a status which blocks bonus escapes.
* Selected Escape actions can now display a `BONUS ESCAPE` tag when the escape is expected to grant one.

## 0.11.4 — 2026-10-05

### Action Tags / Free Actions

* Moves that do not consume the character's normal action on a successful hit now expose that property through the public move data.
* Added a `FREE` command tag for these moves.
* After successfully using a free action, the graphical interface now returns to that character's command screen instead of returning to the battle overview when another action is still available.

## 0.11.3 — 2026-10-05

### Battle Overview

* Replaced the compact H/A/T/L binding readout on party cards with unlabeled horizontal binding meters.
* Binding meters now scale automatically to however many binding zones the encounter defines rather than assuming exactly four.
* Binding severity remains color-coded while using substantially less space on the overview.
* Improved several small text-weight and readability details across the graphical interface.

## 0.11.2 — 2026-10-05

### Display / Mobile Scaling

* Added Selawik as the bundled graphical-interface font, including Regular, Semibold, and Bold weights.
* Improved font consistency and readability across platforms.
* The graphical interface now scales upward based on the physical width available to it, improving readability on wider phones and small screens.
* Scaling updates automatically when the available viewport changes.
* Improved low-contrast secondary text.

## 0.11.1 — 2026-10-05

### Telemetry / Replay

* Browser battle telemetry now records the selected difficulty.
* Telemetry-backed replays now restore the original difficulty before reconstructing the fight.
* Added validation for imported replay difficulty values.
* Updated replay and telemetry tests for difficulty-aware recordings.

## 0.11.0 — 2026-10-05

### Graphical Interface

* Added the first graphical battle interface.  The old console interface is still available from the encounter launcher.
* The graphical interface is now the default option when starting an encounter.
* Added an overview screen showing enemies, intentions, party status, bindings, effects, difficulty, round, phase, and encounter traps.
* Added character detail screens showing capabilities, bindings, effects, and available commands.
* Added graphical targeting and Escape screens with previews before committing an action.
* Enemy intentions now show their move, target, and expected result, and can expand to multiple lines when needed.
* Added linked-entity indicators for effects such as Pounce and other effects connecting two combatants.
* Added a shared combat header and persistent party selector to make navigating between characters and action screens easier.

### Action Previews

* Expanded graphical previews for damage, bindings, buffs, debuffs, healing, traps, movement, and other effects.
* Damage previews show the possible damage for each accuracy result.
* Binding previews show the current value, projected value, and severity changes.
* Buff and debuff previews show their modifiers, duration, and other relevant effects.
* Commands now have semantic tags such as Damage, Buff, Debuff, Escape, One Time, Heal, and AOE.

### Localization

* Added the first localization/presentation system and moved player-facing names and combat text into translation tables.
* Added the initial English localization for characters, enemies, moves, bindings, statuses, difficulties, combat events, and UI text.

### Web / Presentation

* Added a dedicated graphical battle page that can be launched directly with an encounter and difficulty.
* The encounter launcher now allows choosing between the Graphical and Console interfaces.
* Improved mobile-sized layout behavior, scrolling, sticky navigation, and desktop centering.

## 0.10.0 — 2026-09-30

 * Added difficulty system.  This offers five levels of difficulty:
 * * Casual:  some bonuses for the player (+2hit, +2esc) -- this matches the old "failure bonuses" you could get in bq1
 * * Standard:  its standard, no effects
 * * Veteran:  some bonuses for the enemy (+2pot)
 * * Extreme:  veteran+each enemy has a new power
 * * * Skunks survive Explosion when they hit
 * * * Skunkettes add Spray to Pounce when it would be a level 3 or 4 pounce
 * * * Queen gets a free Skunk Gun attack when below half health
 * * * Rainmakers explode into 50 puddles on defeat
 * * * Fairies have a 50% chance to use a binding attack in addition to their support attack
 * * Mythic: veteran+each enemy has a stronger power
 * * * Skunks survive Explosion when they hit or miss
 * * * Skunkettes add Spray to Pounce
 * * * Queen gets a free Skunk Gun attack each turn
 * * * Rainmakers explode into 100 puddles on defeat
 * * * Fairies use a binding attack in addition to their support attack each turn

## 0.9.1 — 2026-09-29

 * Added tower levels - tower_1 is the hardest(an expected loss, but maybe you can still beat it), tower_2 and tower_3 are weakened versions after the goddess helps you
 * Added outside realm level - This was the "oh so you want to lose" gimmick fight from bq1.  My agent can still clear it 2% of the time, so i guess it's still possible, but very, very hard
 * Fixed the collar which was apparently spreading at 1/4 of its intended value
 * Changed the third rainmaker from +Def to +Hit to make it less grindy

## 0.9.0 — 2026-09-29

* Skunks now explode at 20% (60HP) instead of 25% (75HP)
* When Pounce falls off, no matter how, the player will begin moving again if they are able to

## 0.8.3 — 2026-09-28

* Hinari's Release is now -2 Hit / -2 Defense
* Potency/Vulnerability are now 10% per point instead of 12.5%, and existing users have been modified
* * Skunkette resistance is -4 (up from -3)
* * Matsuko's Phoenix kick is now +3 (up from +2)
* * Fairy Empower is still +5 (lowering its final effect slightly)
* * Submissive is still +1 per level (lowering its final effect slightly)

## 0.8.2 — 2026-09-28

* Matsuko's Attack Me! now grants +3 Defense for that turn
* Skunk Collar spread is now based on its value — stays +10 at 50, and scales from +1 at 5 to +20 at 100
* Latex Rain is simplified.  It used to have multiple random values, now it does 2/3/4 tracks of +10 flat binding, slightly skewed to lower tracks at neutral Defense

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
