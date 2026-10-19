# KCQ Project State

**Repository:** `Aelie1/KCQ`  
**Purpose:** durable project pickup guide, not a rolling task list  
**Baseline reviewed:** `master` at `2025e24` (`fixing tests`), 2026-10-19  
**Authority:** current repository and tests always override this document

> This file is intentionally written to age slowly. Do **not** add current tasks, release checklists, screenshot TODOs, “next up” items, or other information that becomes stale after a few commits. Record architecture, implemented behavior, durable design decisions, conventions, and where to verify live state.

## 1. Source-of-truth order

When returning to KCQ after time away, use sources in this order:

1. **Current repository and tests** — authoritative for implemented behavior.
2. **`docs/Game Rules.md`** — human-readable reference for stable combat rules. Check its recorded source baseline before trusting exact numbers.
3. **`docs/Patch Notes.md` and Git tags** — release history and what was publicly grouped into each version.
4. **This document** — architecture, project shape, long-lived decisions, and pickup context.
5. **Older design documents and conversations** — historical context only unless a decision was explicitly promoted into current code/rules.

Several older documents, especially `docs/KCQ Design Spec.md`, `docs/KCQ Design Notes.md`, and `docs/Campaign + Meta Progression Design.md`, preserve useful history but also contain superseded or never-implemented ideas. Do not treat them as requirements merely because they are detailed.

`package.json` may be updated ahead of a public release. Use tags and Patch Notes, not the package version alone, to determine release state.

## 2. What KCQ is

**Ko-chan's Quest (KCQ)** is a deterministic, turn-based tactical combat game descended from BQuest/Quest.

The core fantasy is asymmetric:

- players primarily defeat enemies through **HP damage**;
- enemies primarily pressure the party through **bindings, statuses, traps, and encounter mechanics**;
- the player sees enemy intentions in advance and chooses how much to attack, defend, recover, manipulate intentions, or accept risk.

The central quality bar is that combat should require meaningful decisions. A difficult encounter that can be reliably cleared by blindly repeating a basic attack is a design warning.

KCQ is now a **browser-first graphical game**. The legacy text/console UI and browser-console client were removed. The combat engine and automated harness remain deliberately presentation-independent.

The normal battle party is **three characters selected from a roster of five**.

## 3. Core architectural principles

These are the most important assumptions to preserve when making future changes.

### Engine / UI separation

The engine owns:

- combat state;
- legality and availability;
- target validation;
- previews;
- action resolution;
- RNG;
- turn flow;
- statuses and bindings;
- enemy intentions;
- encounter setup;
- win/loss state;
- serialization.

The graphical UI, Library, telemetry, replays, and harness should consume public engine state rather than reimplement combat rules.

If the UI needs to know whether an action is legal, prefer the public action view/preview data over reconstructing legality from displayed state.

### Determinism

Combat is seeded and reproducible.

UI rendering, previews, logging, telemetry, replay capture, diagnostics, and harness scoring must not perturb the engine RNG stream.

Serial and parallel harness execution are expected to produce equivalent results for the same configuration and seeds.

### Content-driven mechanics

Character- and encounter-specific behavior belongs in content definitions whenever possible.

Add a generic engine primitive when real content needs it; do not build speculative generalized systems only because an old design note imagined them.

### Public data is sanitized

The public engine/library layer exposes what external consumers need without requiring access to private engine definitions.

Presentation/localization resolves IDs into player-facing text separately from the combat data.

## 4. Repository map

### `src/engine/`

The engine is intentionally split by visibility:

- `src/engine/public/` — API and sanitized types used by UI/harness/external consumers.
- `src/engine/protected/` — definitions and helpers used to author KCQ content.
- `src/engine/private/` — concrete engine implementation, resolution, serialization, views, effects, and other internals.

The top-level public constructors are in `src/engine/public/engine.ts`.

### `src/content/`

Game content is composed from fragments:

- `base.ts` — shared/global content.
- `characters/` — Ko-chan, Matsuko, Hinari, Naruyo, Sakari.
- `skunk/` — the current campaign, enemies, bindings, traps, encounter definitions, and related mechanics.
- `index.ts` — catalog composition and KCQ-specific engine/library constructors.

Current character IDs:

- `ko`
- `matsuko`
- `hinari`
- `naruyo`
- `sakari`

Current campaign ID:

- `skunk`

### `src/ui/`

- `src/ui/presentation/` — presentation/localization-facing formatting and game-log presentation.
- `src/ui/web/app/` — SolidJS graphical application.
- web telemetry code — browser telemetry integration.

The graphical UI is the only active game client.

### `src/harness/`

Automated deterministic combat testing:

- `harness.ts` — single-fight execution and policy contract.
- `configuration.ts` — party/difficulty validation and enumeration.
- `policies.ts`, `policy/` — Idle, Basic, Escape, Smart.
- `batch/` — batches, comparisons, matrices, parallel workers, reports.
- `cli/` — direct commands and interactive launcher.
- `replay/` — replay handling.

### `localization/`

English presentation strings are separated from content/engine logic.

Character names/descriptions, moves, UI labels, Library text, story text, and Game Guide prose are resolved through the presentation layer rather than being hard-coded into engine definitions.

### `tests/`

The test suite covers engine, content, harness, UI/view models, DOM behavior, saves, progression, and responsive presentation.

Many UI tests deliberately verify behavior at Narrow/Medium/Wide layouts and should use shared responsive constants/helpers rather than stale hard-coded viewport assumptions.

## 5. Current public engine contract

KCQ-specific composition is exposed by `src/content/index.ts`:

```ts
createEngine(characters, campaign, seed?)
createCharacterLibrary()
createCampaignLibrary(characters, campaign)
```

The underlying public engine constructor is:

```ts
createGameEngine(campaign, catalog, seed?)
```

The current `Engine` interface exposes:

```ts
getSeed()
getLibrary()
getActionView()
getGameState()
getSaveState()
loadSaveState(save)
setDifficulty(difficulty)
listCharacters()
loadCharacter(id)
listEncounters()
loadEncounter(id)
executeAction(action)
```

Important implications:

- **`getActionView()` is the main public action/availability surface.** Older project discussions referring to separate `getMoves`, `getEscapes`, or broad availability APIs are historical.
- Action views contain actor availability, moves, escapes, capability state, target previews, reasons for invalid actions, and projected effects.
- `executeAction()` returns success/failure. Successful actions return updated public action views plus event frames.
- `GameState.turn` includes `round`, `step`, `phase`, and `outcome`.
- Saves use public serializable state and are restored through `loadSaveState()`.

The stock/default engine still uses the original party:

```ts
["ko", "matsuko", "hinari"]
```

but the game and harness support any valid three-character selection from the five-character roster.

## 6. Combat model

For exact formulas and thresholds, read `docs/Game Rules.md`. The durable model is:

### Turn structure

Battles alternate between **Player** and **Enemy** phases.

A normal player character has one primary action per player phase. Actions can include moves, escaping/assisting, and stance changes, subject to restrictions.

The player may end the phase early.

### Moving and Standing

Characters are either Moving or Standing.

Standing is a tactical trade:

- easier to hit / lower Defense;
- avoids ordinary movement-triggered trap checks;
- can support an additional Escape/Assist through the bonus-escape system.

Changing stance is part of the engine action model rather than an ad-hoc UI toggle.

### Bindings

Bindings are independent numeric tracks.

Current standard binding values are capped at **100**. Binding above 80 no longer receives a universal reduction; incoming binding accumulates normally until the cap.

Binding levels map numeric values into named severity bands and can apply statuses/restrictions.

Encounter content decides which binding tracks exist. The Skunk campaign uses:

- Head
- Arms
- Torso
- Legs
- Collar

### Escaping and assisting

Escaping is deterministic rather than a hit/miss roll.

A character can work on their own binding or assist another character when allowed.

**Bonus escapes** permit an additional Escape/Assist after the normal primary action has been consumed. They do not grant another ordinary move or stance change.

### Status/capability system

Current public status flags include:

- `blocksAttack`
- `blocksEscape`
- `blocksAssist`
- `blocksBonusEscape`
- `blocksMoving`
- `autoWillpower`
- `allowAssist`
- `skipsTraps`
- `skipsTurn`
- `incapacitated`

Current public combat modifiers include:

- Arms / Mouth / Legs hit modifiers
- general Hit
- Defense
- Escape
- Vulnerability
- Potency
- Traps
- Willpower
- Spread

Statuses, bindings, passives, and buffs combine to produce the current capability/action view.

### Accuracy

Ordinary rolled attacks resolve through:

- Miss
- Graze
- Hit
- Crit

Accuracy modifiers reshape which band a committed roll falls into; effectiveness then scales compatible effects.

Willpower-based abilities are a separate check and may use `autoWillpower` behavior.

### Enemy intentions

Enemies commit intentions before the player resolves the round.

The random basis of an ordinary intention is committed, but the final outcome remains sensitive to live state. Player actions can change Defense, Hit/Potency modifiers, statuses, and other conditions before the intention executes.

Specific abilities can explicitly manipulate intentions through:

- retargeting;
- cancellation;
- weakening;
- Discord conversion.

These are explicit mechanics, not permission for arbitrary rerolls.

### Battle outcome

The current standard engine battle model is:

- **Victory:** no enemies remain.
- **Defeat:** every player character is incapacitated.
- otherwise **Ongoing**.

### Difficulty

Five global difficulties exist:

| Difficulty | Global effect | Behavior |
|---|---|---|
| Casual | Player Hit +2, Escape +2 | normal enemy behavior |
| Standard | none | baseline |
| Veteran | Enemy Potency +1 | normal enemy behavior |
| Extreme | Enemy Potency +1 | selected enhanced enemy rules |
| Mythic | Enemy Potency +2 | strongest enhanced enemy rules |

Encounter-specific Extreme/Mythic behavior lives in content.

## 7. Playable roster

Five playable Student Council members are implemented. The role summaries below are conceptual; the source files are authoritative for exact numbers.

### Ko-chan — resilient mage / party support

Primary themes:

- Telekinesis damage.
- Starlight Bindings debuff.
- Reflect / Fairy Reflect.
- Fairy Transformation and Fairy Empowerment.
- Empowered versions of several party abilities.
- One-use **Power of Denial**.
- **Thousand Restraints Body** passive.

Fairy transformation is both a defensive buff and a kit-enabling mechanic. Current transformation behavior also removes part of the target's strongest binding while forming the fairy costume.

### Matsuko — aggressive striker / tempo control

Primary themes:

- White Flame and Phoenix Kick offense.
- One-use emergency **Immolation**.
- **Power of Compulsion** abilities:
  - Obey
  - Stop
  - Taunt / Attack Me
- Compulsions are free-on-hit and manipulate action economy/intentions rather than replacing her entire turn.
- **Absolute Will** controls Willpower interactions.

### Hinari — defensive specialist / Subspace resource

Primary themes:

- **Subspace** resource, 0–100.
- Rockfall damage scales with how full Subspace is.
- Store removes bindings and stores material.
- Brace intercepts incoming binding into Subspace.
- Release spends stored material either offensively or by applying remembered binding material.
- One-use **Power of Space** expels Subspace as a large attack/debuff.
- **Subspace Movement** skips ordinary traps and provides Hobbled immunity.

### Naruyo — recovery / tempo support

Primary themes:

- Accurate Precision Stab.
- Snowstorm reduces enemy Hit and Potency.
- Time Acceleration grants party bonus escapes.
- Temporal Lock weakens committed enemy intentions.
- One-use **Power of Time** cancels normal enemy intentions and weakens bosses.
- **Expert Artisan** allows assistance through ordinary Assist restrictions.

Naruyo's role is recovery and control, not simply another damage character.

### Sakari — disruptive attacker / risk scaling

Primary themes:

- Malfunction damage plus Potency suppression.
- Overload damage plus Vulnerability.
- Overconfidence trades Defense for Hit on allies or enemies.
- Discord Seal converts eligible enemy binding intentions against other enemies.
- One-use **Power of Chaos** applies the same disruption across the enemy side.
- **Thrillseeker** raises Sakari's Hit as her total bindings increase.

Her design intentionally rewards operating under increasing pressure.

## 8. Campaign and encounter structure

KCQ currently ships one campaign:

```text
skunk — Latex Skunk Attacks!
```

It contains **15 encounter definitions**:

- **10 combat encounters**
  - `plains_1`–`plains_3`
  - `forest_1`–`forest_3`
  - `tower_1`–`tower_3`
  - `outside`
- **5 story-only encounters**
  - `prologue`
  - `interlude_1`
  - `interlude_2`
  - `interlude_3`
  - `epilogue`

The presentation groups these into Prologue, Acts 1–3, and Epilogue/Outside Realm.

Progression is lightweight:

- campaign unlocks persist locally;
- victory normally unlocks the next chapter;
- Tower defeats can unlock easier continuation routes;
- **Show All** allows direct access rather than forcing progression;
- story-only encounters advance through **Next Level**;
- Best Clear stores the highest completed difficulty for each combat encounter.

### Important scope decision

The implemented lightweight story/unlock flow is real and should be preserved unless intentionally redesigned.

The much larger campaign/meta-progression ideas in `docs/Campaign + Meta Progression Design.md` are **not active requirements**. Do not assume KCQ needs persistent cross-battle resources, a general campaign economy, mandatory gauntlets, universal attrition, or a larger meta-progression framework.

Those ideas can be revisited later, but they are historical/deferred, not unfinished 1.0 work.

## 9. Graphical application flow

`GraphicalApp.tsx` composes the top-level application around `createGraphicalController()`.

Primary screens:

```text
Title
  -> Party Selection (when changing party)
  -> Encounter Picker
  -> Encounter Details
  -> Difficulty Select
  -> Battle
```

Battle results/story presentation are managed from the battle UI rather than being separate controller screens.

The Library and Settings are overlays that can be opened without throwing away the underlying game state.

### Persistence

The browser stores, where applicable:

- preferred party;
- preferred difficulty;
- campaign unlocks;
- best clears;
- active battle save;
- layout preferences;
- enemy-card preference;
- theme;
- Game Log preference;
- shortcut-hint preference;
- combat playback speed;
- language selection.

Active battle saves include enough state to rebuild the campaign/party engine and load the serialized engine state without rerunning setup.

Telemetry/replay integration must never block navigation or change combat behavior.

## 10. Responsive UI model

The responsive system is intentionally semantic and centralized in:

```text
src/ui/web/app/responsiveScale.ts
```

### Canonical geometry

Each primary column is **366px** wide with a **24px** inter-column gap.

```text
Narrow:  366px
Medium:  756px = 366 + 24 + 366
Wide:   1146px = 366 + 24 + 366 + 24 + 366
```

These canonical canvas widths are independent of the automatic viewport breakpoints.

### Semantic layout states

```ts
type LayoutSize = "narrow" | "medium" | "wide";
```

The selected state is published through `ResponsiveLayoutContext` and `data-kcq-layout`.

Prefer semantic layout state over ad-hoc viewport media queries.

Do not reintroduce old `mobile` / `desktop` terminology where the actual model is Narrow / Medium / Wide.

### Auto layout

Current automatic viewport breakpoints:

```text
Medium: 800px browser viewport
Wide:   1400px browser viewport
```

The normal app shell has 12px padding on each side, represented by the shared 24px horizontal-padding constant/helper.

`calculateResponsiveLayout()` receives **available shell width**, not raw viewport width. Do not mix those coordinate systems in code or tests.

### Zoom

After selecting a canvas, the UI scales upward from **1.0× to 1.5×**.

Auto mode therefore:

1. selects Narrow / Medium / Wide from the auto breakpoint policy;
2. scales that canonical canvas into available space up to the 1.5× cap.

Manual `1`, `2`, or `3` column preferences select the requested semantic layout regardless of whether it naturally fits the viewport. Horizontal scrolling remains the fallback when necessary.

### Responsive testing convention

Use:

```text
tests/helpers/responsiveLayouts.ts
```

for semantic Narrow/Medium/Wide test fixtures.

Boundary tests should derive values from shared responsive constants and explicitly distinguish viewport width from available width. Avoid hard-coded copies of old breakpoint values across individual test files.

## 11. Battle UI shape

`BattleApp.tsx` has its own battle navigation state:

- Overview
- Character
- Enemy
- Targeting
- Escape

Presentation changes by semantic layout without changing the underlying battle state.

### Narrow

Compact/single-column navigation. Details and action screens replace the primary view.

### Medium

Two-column battle presentation. Character details and command/targeting workspaces can remain side by side; enemy/details/log presentations are arranged within the shared medium canvas.

### Wide

Three-column battle presentation. The ordinary battle overview can show party, enemies/details, and a persistent Game Log simultaneously.

The full Game Log can still become a modal where appropriate, such as completed-battle/result viewing.

The guiding rule is that responsive changes should alter **presentation**, not create independent game-state or action-flow implementations.

## 12. Library and Game Guide

The in-game Library is a first-class reference browser.

Current categories:

- Guide
- Difficulties
- Characters
- Enemies
- Moves
- Passives
- Bindings
- Traps
- Statuses

The Library uses sanitized engine references plus presentation text. Cross-references between entries are explicit and navigable.

### Game Guide

The Game Guide is implemented as five authored pages:

- Combat Basics
- Moves
- Bindings and Escaping
- Modifiers
- Strategy

Implementation deliberately uses a small explicit content model in:

```text
src/ui/web/app/content/gameGuide.ts
```

It is **not** a Markdown/MDX system and does not require a general documentation framework.

Guide prose lives in localization/presentation strings and is rendered with reusable UI pieces such as trait tags, tables, binding severity presentation, and modifier examples.

## 13. Harness and balance infrastructure

The harness is part of the project architecture, not a temporary experiment.

### Policies

Registered policies:

- **Idle** — always ends the turn.
- **Basic** — naive offense using authored/default repeatable attacks and generic legal-damage fallback.
- **Escape** — simple binding-recovery heuristic.
- **Smart** — larger tactical heuristic using public previews and kit knowledge.

Smart is a practical automated reference player. It is **not** intended to be a perfect human emulator or optimal solver.

Do not restart the old rabbit hole of trying to prove exact human-performance equivalence.

### Party / difficulty configuration

Harness runs support:

- any of the **10** unique three-character combinations from the five-character roster;
- all five difficulties.

The default remains Ko / Matsuko / Hinari on Standard.

### Matrix workflows

The interactive harness supports:

- party parity comparisons;
- difficulty progression comparisons;
- custom party × difficulty matrices.

The matrix/batch infrastructure supports persistent worker pools, compact reporting, replay samples, deterministic seed derivation, and serial/parallel equivalence checks.

### Balance philosophy

Use the harness to answer concrete design questions:

- Does a mechanic matter?
- Is a naive policy succeeding where it should not?
- Are difficulty steps meaningful?
- Are party combinations wildly out of family?
- Can a suspicious run be reproduced by seed/replay?

Old numerical baselines should not be assumed current after character, encounter, or rules changes. Rerun the relevant matrix when a number matters.

## 14. Replay and telemetry

Replayability is a first-class property of the engine design.

Harness and browser telemetry preserve enough deterministic information to investigate a run rather than merely storing aggregate win/loss counts.

Browser telemetry is intended for gameplay/balance reconstruction, not general browsing surveillance.

Rules for future changes:

- telemetry failure must not break the game;
- replay/telemetry work must not consume or reorder combat RNG;
- save/replay formats should preserve enough party, campaign, encounter, difficulty, seed, and action information to reconstruct the intended run.

## 15. Testing and build commands

Common commands:

```sh
npm test
npm run typecheck
npm run typecheck:test
npm run web:build
npm run build
npm run web
npm run harness
npm run fight
npm run batch
npm run compare
```

`npm test` compiles the test project and runs both the standard Vitest suite and the DOM/Happy DOM suite.

Before treating a substantial refactor as finished, the usual repository-level validation is:

```sh
npm test
npm run typecheck
npm run web:build
git diff --check
```

For harness changes, also run the focused policy/compatibility suites relevant to the change.

For responsive changes, test representative Narrow/Medium/Wide layouts and breakpoint transitions, not just a single desktop viewport.

## 16. Durable design decisions and non-goals

These are useful guardrails when returning after a long break.

### Preserve

- deterministic combat;
- engine/UI separation;
- public action views as the authority for legality/previews;
- content-driven special mechanics;
- visible enemy intentions and tactical counterplay;
- meaningful binding pressure and recovery decisions;
- three-character party selection from distinct authored kits;
- replayability;
- browser-first graphical presentation;
- semantic Narrow/Medium/Wide responsive behavior;
- lightweight campaign/story progression already implemented;
- Library/Game Guide as the in-game rules/reference surface.

### Do not assume as requirements

- restoring the legacy console UI;
- universal RPG levels/XP/gear progression;
- a deep campaign economy or mandatory cross-battle attrition framework;
- old Castle plans;
- generalized traps/binding systems without content that needs them;
- Super Skills / Double Tech / Triple Tech systems from old brainstorming;
- a perfect/optimal Smart policy;
- another wholesale UI rewrite merely because older screenshots/code looked different.

Historical ideas remain available as a mine for future content, but they do not constitute unfinished work.

## 17. How to pick the project back up

This is a **reorientation procedure**, not a task list.

After a long pause:

1. Inspect current Git history/tags:
   ```sh
   git status
   git log --oneline --decorate -20
   ```
2. Read the top of `docs/Patch Notes.md` to see what changed after the baseline of this document.
3. Check the source baseline recorded in `docs/Game Rules.md`.
4. Run the test/typecheck/build commands before assuming the checkout is healthy.
5. For implementation questions, inspect the current files first. Do not rely on remembered class names, old conversation summaries, or this document when the repository has moved.
6. If working on UI responsiveness, start with `responsiveScale.ts`, `ViewPreferencesContext`, and the shared responsive test helpers.
7. If working on combat mechanics, start with the public action/state types, then inspect the relevant protected definition/content and tests before touching private engine logic.
8. If working on balance, rerun current harness matrices rather than quoting historical results.
9. If an old design document conflicts with current code/rules, assume the old document is historical until the creator explicitly revives it.

## 18. Maintenance rule for this document

Update this file only when something **structural or durable** changes, for example:

- a new engine/API boundary;
- a new playable roster member;
- a new campaign;
- a major rules-model change;
- a new canonical UI architecture;
- removal/addition of a major subsystem;
- a durable project-scope decision.

Do **not** update it for:

- the current bug being fixed;
- a temporary Codex task;
- release screenshots;
- announcement drafting;
- an uncommitted polish item;
- “what I am doing tonight”;
- a one-off failing test;
- a short-lived release checklist.

Those belong in commits, issues/boards, patch notes, or conversation—not in the pickup guide.
