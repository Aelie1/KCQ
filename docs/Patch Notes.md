# Ko-chan's Quest Patch Notes

## 1.0.0 — 2026-10-19

### Responsive Interface Overhaul

The graphical interface received a final large-scale responsive-layout and presentation pass.

* Reworked the interface around consistent **Narrow**, **Medium**, and **Wide** layouts.
* Improved automatic layout selection so transitions between one, two, and three columns make better use of available screen space.
* Increased the amount of screen space available to the two-column layout before switching to three columns, reducing abrupt changes in interface scale.
* Standardized the canonical widths used throughout the graphical interface.
* Removed several older independent responsive-layout systems and consolidated screens around the shared layout model.
* Improved scaling, centering, overflow handling, and behavior when resizing the browser.
* Cleaned up obsolete mobile/desktop layout terminology throughout the interface and tests.

### Encounter and Party Screens

* Redesigned the Encounter Picker for larger displays.
  * Medium layouts present encounters in organized campaign rows.
  * Wide layouts make additional use of horizontal space.
  * Narrow layouts retain the compact card presentation while now displaying campaign section headings.
* Redesigned Encounter Details for medium and wide layouts.
  * Encounter information, story text, enemies, and special rules make better use of available horizontal space.
  * Long narrative and rules sections can scroll independently where appropriate.
  * Narrative text is now constrained to a more comfortable reading width on large displays.
* Redesigned Difficulty Selection for medium and wide layouts, keeping the difficulty choices visible alongside the selected difficulty's details.
* Improved Party Selection layouts and character descriptions.
* Added final combat-role and tactical descriptions for all five playable characters.

### Battle Interface Improvements

* Continued refining the two- and three-column battle layouts introduced in 0.17.0.
* Unified battle headers and navigation across the battle overview, character details, enemy details, targeting, and Escape screens.
* Improved character workspaces so information, commands, targeting, and the Game Log remain organized consistently across responsive layouts.
* Improved handling of enemy details within medium and wide battle layouts.
* Improved layout and scrolling behavior for short screens and resized browser windows.
* Incapacitated character cards now hide stance and character-specific resource information that is no longer relevant while incapacitated.
* Numerous spacing, typography, wrapping, alignment, and overflow fixes throughout combat screens.

### Game Log

* Improved Game Log behavior across responsive layouts.
* Narrow layouts continue to use a dedicated full-screen Game Log.
* Medium layouts display the full Game Log as a modal while keeping the current battle mounted behind it.
* Wide layouts retain the persistent third-column Game Log during battle.
* Opening the Game Log from a completed battle now displays the full modal log even in Wide mode.
* Improved focus handling, keyboard navigation, scrolling, and return behavior when opening and closing the full log.

### Battle Results and Story Presentation

* Redesigned the battle-result presentation.
* Bindings, Hits, and Escapes are now presented as three consistent headline statistic cards across all layout sizes.
* Improved presentation of secondary battle statistics and encounter results.
* Improved Victory and Defeat dialog sizing and behavior across Narrow, Medium, and Wide layouts.
* Standardized story typography and reduced excessively wide story text on large displays.
* Improved scrolling and focus behavior for long victory and defeat narratives.

### Character and Balance Adjustments

**Ko-chan**

* Fairy Transformation and Fairy Empowerment now use part of a character's strongest binding as part of the transformation, removing some of that binding when the transformation occurs.
* Updated transformation descriptions and Library information to explain the new behavior.

**Hinari**

* Release can now spend up to **100 Subspace** when releasing stored material onto an ally, increased from 50.
* Rockfall now loses hits more gradually as Subspace fills.
* Rockfall can now still be used when Subspace is completely full.
* Updated move descriptions and effect information to reflect the new behavior.

### Binding Mechanics

* Removed the general reduction previously applied to binding gained above **80**.
* Binding now accumulates at full effectiveness all the way to the maximum value of **100**.
* Incoming binding that would exceed 100 is still capped at 100.

### Combat Fixes

* Improved target validation when actions are executed, including actions whose legal targets changed after being selected.
* All-target moves now correctly become unavailable when no valid targets remain.
* Fixed bonus Escape consumption when a character has already used their primary action.
* Fixed several cases involving enemy intention redirection and manipulation.
* Difficulty can no longer be changed after an encounter has begun.
* Fixed encounter progression so unavailable encounters accessed through alternate navigation cannot incorrectly unlock later campaign levels.
* Fixed character-specific data being carried incorrectly between encounters.
* Improved save-state validation and restoration behavior.
* Additional fixes to combat previews, status handling, serialization, and event reporting.

### Automated Balance Harness

The simulation and balance-testing harness received a major expansion in preparation for 1.0.

* Harness runs can now select any valid three-character party and any difficulty.
* Added party and difficulty configuration to fight, batch, comparison, replay, and command-line workflows.
* Added matrix testing across:
  * party compositions;
  * difficulty levels;
  * encounters;
  * policies.
* Added compact comparison reports for party parity and difficulty progression.
* Expanded automated policies to better support the complete five-character roster.
* Added character-specific policy knowledge and compatibility testing.
* Improved parallel batch execution with dynamic worker scheduling.
* Added extensive validation to ensure serial and parallel simulations remain deterministic.
* Added documentation for harness configuration and policy compatibility.

### Testing and Maintenance

* Greatly expanded responsive-interface regression testing across Narrow, Medium, and Wide layouts.
* Added dedicated tests for Encounter Picker, Encounter Details, Difficulty Selection, Party Selection, battle results, responsive scaling, and multi-column character and enemy views.
* Expanded combat and content regression coverage.
* Added additional save, campaign-progression, replay, and harness tests.
* Consolidated responsive CSS and removed obsolete selectors and duplicated layout rules.
* General cleanup, refactoring, and bug fixing throughout the engine and graphical interface.

## 0.18.0 — 2026-10-18

### New Playable Characters

Expanded the playable roster from **three to five characters**, introducing Naruyo and Sakari with new combat abilities, passives, and tactical options.

**Naruyo — Time and Battlefield Control**

* **Precision Stab** — A highly accurate physical attack.
* **Snowstorm** — Reduces the Hit and Potency of all enemies for two rounds.
* **Time Acceleration** — Grants an additional action to every party member.
* **Temporal Lock** — Weakens an enemy's committed intentions by 25%.
* **Power of Time** — A once-per-battle ability that cancels all normal enemy intentions and weakens boss intentions by 40%.
* **Expert Artisan** — Allows Naruyo to assist allies with their bindings even when ordinary binding restrictions would prevent assistance.
* Added an empowered version of Precision Stab that attacks all enemies.

**Sakari — Chaos and Disruption**

* **Malfunction** — Damages an enemy and reduces its Potency.
* **Overload** — Damages an enemy and increases its Vulnerability.
* **Overconfidence** — Increases a target's Hit while reducing its Defense. Can target either allies or enemies.
* **Discord Seal** — Redirects an enemy's binding intentions against another enemy.
* **Power of Chaos** — A once-per-battle ability that disrupts binding intentions across the enemy party.
* **Thrillseeker** — Increases Sakari's Hit based on her accumulated bindings, gaining +1 Hit for every 40 binding points.
* Added empowered versions of Malfunction and Overload with extended debuff durations.

### Party Selection

* Added a new **Party Selection** screen before entering combat.
* Players can now choose any three characters from the five available council members.
* Character selection displays each character's combat role and key abilities.
* Added selection indicators and keyboard shortcuts.
* The Continue button becomes available only when a valid three-character party is selected.
* The selected party is remembered between encounters and browser sessions.
* Updated battle initialization, encounter navigation, and saved-game handling to support variable party compositions.

### Game Guide

* Added a comprehensive **Game Guide** to the in-game Library.
* The guide includes five sections:
  * **Combat Basics** — Battle flow, turns, stances, and enemy intentions.
  * **Moves** — Move types, accuracy, outcomes, cooldowns, and special traits.
  * **Bindings and Escaping** — Binding severity, escaping, assisting, and bonus escapes.
  * **Modifiers** — Explanations of combat statistics and their effects.
  * **Strategy** — Practical advice for approaching combat encounters.
* Added visual tables for binding severity, attack outcomes, and escape mechanics.
* Added examples of move traits and modifier descriptions using existing interface elements.
* Integrated the guide into the Library's navigation system for desktop and mobile layouts.

### Light Mode and Interface Themes

* Added a complete **Light Mode** for the graphical interface.
* Added theme selection with three options:
  * **Dark** — The original appearance.
  * **Light** — A brighter interface with a redesigned color palette.
  * **System** — Automatically follows the operating system's appearance setting.
* Theme preferences are saved between browser sessions.
* Introduced shared color tokens to provide consistent styling throughout the interface.
* Updated battle panels, cards, buttons, dialogs, navigation, and the Library to support both themes.

### Combat and Interface Improvements

* Added new move trait indicators to make special combat actions easier to identify.
* Improved move descriptions, target previews, and effect presentation.
* Updated combat previews to support new intention cancellation, weakening, and redirection mechanics.
* Improved character information and Library entries for the expanded roster.
* Added more persistent presentation settings, including preferred difficulty and party composition.
* Refined the title screen and encounter-selection flow to accommodate party selection.
* Additional responsive-layout, spacing, and visual refinements.

### Engine and Gameplay Changes

* Added support for new intention manipulation effects used by Naruyo and Sakari.
* Expanded status and passive handling to support special assistance permissions and Willpower behavior.
* Added **Absolute Will**, Matsuko's new passive ability affecting Willpower checks.
* Updated combat effect resolution and serialization to support the new mechanics.
* Updated existing character abilities and combat data for compatibility with the expanded roster.
* Improved effect previews and combat event reporting.

### Legacy Client Removal

* Removed the original text-based Console UI.
* Removed the old browser console entry point and associated presentation code.
* Consolidated the application around the graphical browser interface.
* Removed obsolete console-specific tests and unused legacy code.
* Retained the combat engine and automated testing infrastructure.

### Testing and Maintenance

* Added dedicated combat tests for Naruyo and Sakari.
* Added tests for party selection, saved preferences, and new character combinations.
* Added coverage for the Game Guide and theme switching.
* Expanded UI tests for combat controls, previews, and responsive presentation.
* Updated regression tests for new engine mechanics and removed legacy dependencies.
* General code cleanup and internal refactoring.

---

**0.18.0 completes the five-character Student Council roster, introduces customizable party compositions, and adds the Game Guide and Light Mode.** Together, these changes significantly expand combat strategy while making the game more approachable for new players.

## 0.17.0 — 2026-10-16

### Desktop and Responsive Interface

* Added dedicated **two-column and three-column battle layouts**, allowing the graphical interface to take advantage of larger screens.
* The interface now supports three presentation modes:
  * **Single Column** — The original compact/mobile interface.
  * **Two Columns** — Displays party information alongside enemies or the active command workspace.
  * **Three Columns** — Displays the party, enemies, and a persistent Game Log simultaneously.
* Character and enemy details now replace their respective columns instead of requiring full-screen navigation in multi-column layouts.
* Selecting a character keeps their information visible while commands, targeting, and Escape actions appear in the adjacent workspace.
* Selecting an enemy displays its detailed information in the enemy column, with a button to return to the enemy list.
* The main battle header remains consistent when navigating between overview, character details, and enemy details.
* Added contextual column headings for characters, enemies, commands, targeting, and Escape actions.
* Improved the layout of the combat header, including encounter information, difficulty, round, phase, trap meter, and battle controls.
* The three-column layout includes a full-height, independently scrollable Game Log.
* Preserved the existing mobile interface and navigation.

### Automatic Layout and Display Settings

* Reworked automatic scaling to prioritize displaying more columns before enlarging the interface.
* Auto mode now chooses the maximum number of columns that fit at 100% zoom, then scales the selected layout up to a maximum of 150%.
* Added a **Columns** setting:
  * **Auto** — Automatically choose the layout based on available screen width.
  * **1 Column** — Force the compact layout.
  * **2 Columns** — Force the two-column layout.
  * **3 Columns** — Force the three-column layout.
* Manually selected column counts remain fixed when resizing the window. Layouts that cannot fit at 100% remain accessible through horizontal scrolling.
* Added an **Enemy Cards** setting:
  * **Auto** — Choose the card presentation appropriate for the layout.
  * **Compact** — Use the original compact enemy cards.
  * **Expanded** — Show complete enemy intention previews.
* Column and enemy-card preferences can be configured independently and are saved between browser sessions.
* Added **Reset to Defaults** to restore display and other persistent presentation settings.

### Enemy Cards and Intentions

* Redesigned expanded enemy cards to use a single full-width card per enemy.
* Expanded cards display all upcoming intentions and their projected consequences, rather than limiting the overview to two intentions.
* Multi-target attacks display separate outcomes for each affected character.
* Added HP meters to expanded enemy cards, alongside current and maximum HP.
* Improved the placement of permanent buffs, temporary effects, duration indicators, and linked-entity icons.
* Linked-entity icons now appear before enemy names.
* Simplified the presentation of linked Pounce effects to avoid displaying redundant self-buff intention rows.
* Improved intention wrapping and spacing for narrower layouts.

### Character Details and Commands

* Redesigned character details for multi-column layouts.
* Added a compact character selector that remains visible while inspecting character information and choosing actions.
* Character status, capabilities, bindings, and active effects are displayed alongside the command workspace.
* Commands, targeting, and Escape actions share a consistent workspace without hiding the selected character's information.
* Improved desktop command layouts and navigation between action screens.
* Preserved targeting and Escape selections when changing between responsive layouts.

### Desktop Library

* Added a desktop-oriented Library layout for multi-column displays.
* The Library now provides a persistent navigation area alongside the selected reference entry.
* Improved navigation between reference categories and individual entries without repeatedly returning to the category list.
* Preserved the existing compact Library presentation for smaller screens.

### Fixes and Improvements

* Improved responsive navigation and layout transitions across screen sizes.
* Improved handling of scrolling and content overflow in multi-column layouts.

## 0.16.0 — 2026-10-14

### Save and Resume

* Added automatic battle saving and resuming.
* Active battles can be restored after leaving or reloading the game.
* The title screen now provides an option to continue a saved battle.
* Added controls for deleting saved battle data, including confirmation before deletion.
* Added handling for incompatible or corrupted save data.
* Save and resume preserve the battle state and associated session information.

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
