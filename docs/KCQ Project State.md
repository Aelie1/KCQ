# KCQ Project State

**Last updated:** 2026-09-25
**Status:** Draft — intended for periodic refresh as the project changes
**Repository:** `Aelie1/KCQ`
**Current repository baseline:** `master`, 0.8.1 release candidate
**Current public release:** `0.8.1` (2026-09-25)

This document describes **where KCQ is now, what has been established, and what direction the project is taking**.

It is not a substitute for the repository or `Game Rules.md`.

---

## 1. Source of Truth

When sources disagree, use the following priority:

1. **Current repository and tests** — authoritative for implemented behavior, APIs, content, and mechanics.
2. **`Game Rules.md`** — human-readable specification of stable game rules.
3. **This document (`PROJECT_STATE.md`)** — current project direction, design conclusions, milestones, and priorities.
4. **Trello** — roadmap and task planning. Card completion state may lag actual repository work.
5. **Older design notes and conversations** — historical context only unless reaffirmed.
6. **ChatGPT memory** — convenience, never authoritative over the sources above.

The `package.json` version (`1.0.0`) is package metadata and should not be treated as the KCQ release version.

---

# 2. Project Identity

**Ko-chan's Quest (KCQ)** is the clean reboot/successor to the earlier BQuest implementation.

The current project is no longer an architecture prototype. It is a functioning game with:

* a deterministic combat engine;
* three implemented player characters;
* multiple complete encounters;
* a browser-playable console-style UI;
* automated simulation/balance tooling;
* replay infrastructure;
* anonymous playtest telemetry;
* a growing content roadmap.

The immediate goal is to build a game that is mechanically interesting and testable before committing significant effort to a polished final UI.

The current web interface is intentionally an **early-playtest interface**, not the final presentation layer.

---

# 3. Core Architecture Direction

KCQ maintains a strict separation between the game engine and its consumers.

The engine owns:

* game state;
* legality;
* combat resolution;
* RNG;
* status and binding behavior;
* enemy behavior;
* targeting;
* action results;
* victory and defeat.

UI, harnesses, and other consumers should interact through the public state, action, and event-frame interfaces rather than reproducing engine rules.

The basic flow is conceptually:

**GameState + ActionView[] → PlayerAction → ActionResult (EventFrame[] + ActionView[])**

The harness is deliberately treated as another consumer of the engine rather than as a privileged simulation layer.

This is an important difference from BQuest 1, where testing code increasingly duplicated or depended directly on internal combat logic.

---

# 4. Determinism and Replay

Determinism is a first-class project requirement.

Seeded runs should be reproducible.

Combat AI randomness and combat-resolution randomness are deliberately controlled so that:

* problem runs can be reproduced;
* balance changes can be compared;
* harness policies can be evaluated fairly;
* replays can reconstruct player runs;
* UI inspection should not alter combat RNG.

Replay support is not merely debugging infrastructure. Replays are intended to be useful for:

* balance analysis;
* external playtest collection;
* reproducing player behavior;
* forensic examination of unusual victories or defeats;
* future replay viewing.

The current project includes state-rich fight replays and a console replay viewer.

---

# 5. Current Playable Content

## Player characters

The currently implemented playable party is:

* **Ko-chan**
* **Matsuko**
* **Hinari**

Their current kits are implemented and tested, although their final balance is not considered settled.

Naruyo and Sakari remain planned future player characters.

Character-specific rules belong in their content/design documentation rather than in `Game Rules.md`.

## Encounters

The current content catalogue contains six encounters:

### Plains

* `plains_1`
* `plains_2`
* `plains_3`

### Forest

* `forest_1`
* `forest_2`
* `forest_3`

The original Plains progression culminates in the Skunk Queen.

Forest expands the current playable encounter set beyond the original three-fight slice.

---

# 6. Current Public/Web State

KCQ is browser-playable.

The first public version was:

**0.7.2 — 2026-09-22**

The current release is:

**0.8.1 — 2026-09-25**

0.8.1 is a mechanics and character-balance follow-up to the 0.8.0 event-model release. It introduces first-class player move cooldowns and applies them to existing character mechanics, while also making another focused pass over Ko-chan and Matsuko's kits.

The browser UI currently provides:

* an encounter selector;
* normal player action choices;
* keyboard and button input;
* End Turn;
* Quit;
* final battle-state handling;
* return to encounter selection after leaving a completed battle;
* the existing console-style combat display;
* a separate scrolling combat log;
* semantic actor/effect styling;
* battle-state highlighting and timed presentation;
* causal combat-log presentation, including per-hit effects for multihit moves;
* shared presentation/controller code with the console implementation.

The browser UI remains deliberately utilitarian.

It is intended to make KCQ **playable and testable by other people without installing Node**, not to represent the final graphical interface.

---

# 7. Release vs. Master

The deployed GitHub Pages workflow builds from the **latest release tag**, not directly from `master`.

Therefore:

**public release state and current repository state may differ.**

The 0.8.0 release captures the completed event-model revamp, its consumer migrations, the richer action/damage preview work, and the causal combat-log presentation. After the release is tagged, later `master` work may again move ahead of the public build.

The web build's release identifier is injected from the release tag selected by the deployment workflow. The `package.json` version is not used as the KCQ gameplay/replay release identifier.

When discussing current implementation details, use `master`.

When discussing what an external player is actually playing, check the latest release tag/deployed build.

---

# 8. Playtest Telemetry

The browser build contains anonymous gameplay telemetry using PostHog when telemetry configuration is present.

Telemetry is deliberately limited to gameplay data rather than general user tracking.

Current lifecycle events include:

* `battle_started`
* `battle_action`
* `battle_finished`
* `battle_quit`
* `battle_abandoned`

Recorded information includes:

* release;
* encounter;
* combat seed;
* replay ID;
* actions;
* action success/failure;
* compact game state after actions;
* final/current game state;
* action count.

The current implementation also distinguishes an explicitly quit battle from a browser/session abandonment.

PostHog configuration intentionally disables unrelated tracking features including:

* autocapture;
* automatic pageviews;
* session recording;
* heatmaps;
* surveys;
* exception capture;
* campaign/referrer persistence.

An anonymous locally generated player identifier is used without creating PostHog person profiles.

Telemetry must never affect gameplay if initialization or delivery fails.

The long-term value of this system is primarily **reconstructable play behavior**, not vanity analytics.

---

# 9. Harness State

KCQ has a functioning deterministic combat harness rather than the minimal prototype originally planned.

Current policy families include:

* `first`
* `idle`
* `random`
* `basic`
* threshold-based `basicEscape` policies from `basic10` through `basic50`

The **basic** policy intentionally uses only each character's simple offensive move:

* Ko-chan → Telekinesis
* Matsuko → White Flame
* Hinari → Rockfall

It is useful as a low-skill baseline, not as a representation of competent full-kit play.

The threshold escape policies add simple rescue behavior, generally prioritizing assistance and using Standing to exploit the double-escape mechanic.

The harness currently includes infrastructure for:

* deterministic single fights;
* large batches;
* policy comparisons;
* parallel batch execution;
* aggregate metrics;
* replay capture;
* replay archives;
* retrieval/analysis of collected external replays.

Simulation performance has improved substantially during development and is now fast enough for large experimental batches.

---

# 10. Balance State

The project has completed its first meaningful balance pass.

The important result of that work was not a claim that combat is “balanced.” It established that the game now produces meaningful pressure and decisions rather than functioning as an auto-attack simulator.

A major design criterion is:

> **A naive basic-attack policy should not be able to beat major boss content such as the Queen.**

That criterion has been achieved.

Recent benchmarks continue to show the basic policy losing all tested `plains_3` runs.

At the same time, ordinary encounters remain winnable by much simpler policies, giving the encounter sequence an actual difficulty curve.

Escape behavior matters substantially in intermediate encounters. Earlier threshold-policy experiments showed that escaping neither constantly nor never was universally correct; moderate escape thresholds could materially change success rates.

This is considered a desirable property.

## Important limitation

The existing basic and threshold policies do **not** establish full-kit balance.

Current character utility moves, transformations, Compulsions, Store/Release, Reflect, and similar mechanics still need evaluation by policies capable of understanding them.

The project should therefore avoid conclusions like:

> “Character X is balanced because Basic has a 50% win rate.”

Basic does not use most of the characters' kits.

---

# 11. Recent Balance Changes

The 0.8.1 balance pass makes several additional changes to the current character kits:

* Ko-chan gains Power of Denial, a single-use ability capable of removing a character's strongest binding or defeating a non-boss enemy.
* Normal Reflect now halves incoming binding while retaining its retaliation; Fairy Reflect still negates the binding completely.
* Fairy Transformation and Fairy Empowerment now have cooldowns.
* Matsuko's Compulsions now use the general move-cooldown system, including cross-cooldowns between related Compulsions.
* Immolation damage increased from 60 to 75 and now removes half of Matsuko's current bindings.
* Fairy White Flame is now an all-enemy attack rather than a Potency-enhanced attack.
* Fairy Phoenix Kick now attacks twice rather than receiving a Hit bonus.

These remain targeted kit adjustments rather than a claim of final balance. Full-kit evaluation remains one of the primary goals of the planned Smart harness.

---

# 12. Current Balance Philosophy

Balance should be evaluated through several levels of player behavior rather than by trying to invent one perfect approximation of a human player.

Useful anchors include:

* intentionally idle behavior;
* naive/simple offense;
* simple escape heuristics;
* kit-aware scripted behavior;
* eventually, tactical board evaluation.

Different policies answer different design questions.

The harness should expose:

* degenerate strategies;
* dominant moves;
* irrelevant moves;
* encounter pacing problems;
* escape/assist value;
* pressure escalation;
* failure modes;
* character-specific balance problems.

It does **not** need to prove a single precise “human win rate.”

A fight can be considered wrong because it:

* ends too quickly;
* lasts far too long;
* is beatable by mindless attacks when it should require tactics;
* creates no meaningful pressure;
* produces unavoidable collapse;
* makes an important mechanic irrelevant.

Those judgments remain useful even when there is no perfect automated player.

---

# 13. Immediate Development Sequence

The event-model milestone is complete. The current sequence is now:

1. **Completed: event revamp / causal combat log**
2. **Current: Smart harness policy / board evaluation**
3. **Next: further balance work using the smarter harness**

This ordering remains intentional.

The event revamp established the causal structure needed by presentation, replay inspection, telemetry, and richer action analysis before investing heavily in the next generation of harness reasoning.

The next major testing milestone is therefore a Smart policy capable of evaluating actual character kits and tactical board state.

The resulting policy should then be used for another substantial balance pass.

---

# 14. Completed Milestone: Event Revamp / Causal Combat Log

The event revamp is complete for 0.8.0.

Combat-event causality is now explicit instead of requiring downstream consumers to reconstruct relationships from a flat stream.

The established model is:

* only the engine produces top-level game events;
* concrete state changes/results are leaf events owned by the game event that caused them;
* `useMove` owns ordered target-result entries plus separate move-level leaf effects;
* each evaluated target result owns the leaf effects causally produced by that result, even when an effect's recipient is somebody else;
* misses remain represented as evaluated target results with empty effect stacks;
* `useEscape`, `changePhase`, `changeStance`, `loadCharacter`, and `loadEncounter` likewise own the leaf effects they cause;
* the actual stance mutation is represented separately as `stanceSet`;
* phase-boundary effects are attached to `changePhase`;
* traps report `trapTriggered` before the leaves produced by the trap;
* target-result effects resolve before move-level effects in the canonical move-processing order.

The motivating multihit case now presents naturally as:

**Hit → Damage → Hit → Damage**

rather than emitting all hit results first and all resulting damage afterward. The console/browser presentation now preserves that causal grouping, so callbacks and secondary effects appear under the specific hit that caused them.

The migration covered engine consumers, previews, console/browser presentation, harness metrics and replay, serialization, fixtures, and tests. Two localized regressions were found during migration and fixed: trap-trigger consumption reporting and missing move-level effects in action previews.

The completed 0.8.0 candidate passes **1,224 tests across 84 test files**, with build and web TypeScript checks also clean.

This was an **engine/event-model cleanup**, not a balance change.

---

# 15. Current Priority: Smart Harness

With the event revamp complete, the current major harness task is a policy that can actually understand the game board and character kits.

The current Trello direction is a **Smart policy using move previews / EV scoring**.

Recent engine work exposing richer action/damage previews is directly related to this goal.

The intended Smart-policy direction is:

* evaluate current board state;
* evaluate projected action outcomes;
* score candidate actions;
* preserve inspectable/debuggable reasoning;
* support different tactical priorities rather than one opaque master score.

Possible tactical perspectives include:

* stable/default play;
* escape/danger response;
* damage race;
* cleanup.

The goal is **not an optimal AI**.

The goal is an agent competent enough to expose problems that Basic cannot see.

The Smart harness should be useful for answering questions such as:

* Is a character's utility kit actually worth using?
* Are transformations or empowerment options worth their action cost?
* When should a competent player stop attacking and start escaping?
* Does a control move meaningfully improve expected outcomes?
* Are some moves dominated by other moves?
* Are encounter mechanics demanding the intended tactical response?
* Are characters contributing in distinct, useful ways?

---

# 16. Following Smart Harness: Further Balance Pass

A new major balance pass should follow the Smart-policy work.

This pass should not merely repeat Basic-policy tuning.

Its purpose is to evaluate KCQ under increasingly credible use of the actual character kits.

Areas of interest include:

* full-kit character effectiveness;
* move selection;
* utility versus damage tradeoffs;
* escape and assist timing;
* Standing decisions;
* target prioritization;
* transformation/empowerment value;
* Compulsion value;
* Hinari's Subspace economy;
* Reflect and defensive utility;
* encounter-specific tactical demands;
* whether particular moves become dominant or irrelevant.

The earlier Basic-policy balance work remains valuable as a lower-bound anchor.

The Smart policy should add another reference point rather than replacing simpler policies.

---

# 17. Current Development Position

The project has now completed a cluster of work around:

* public deployment;
* telemetry/replay collection;
* first major balance adjustments;
* richer action/damage previews;
* the 0.8.0 causal event model;
* causal console/browser combat presentation;
* durable game-rule documentation.

Following the 0.8.0 event-model milestone, 0.8.1 added general player cooldown support and another focused character-kit balance pass.

The immediate planned work remains:

**Smart harness → further balance**

The event revamp should be treated as a completed foundation rather than an outstanding prerequisite. This sequence should be treated as current project intent even if Trello's list positions or card states temporarily lag behind it.

---

# 18. Major Near-Term Directions After the Current Sequence

Once the event/harness/balance sequence is sufficiently mature, larger project directions include:

### Campaign / carryover vertical slice

Move beyond independent battles into authored sequences where state can persist between encounters.

Planned campaign work includes:

* encounter chains;
* between-fight recovery/carryover;
* route state;
* pre/between-fight decisions;
* deterministic campaign harness runs.

The campaign layer should remain small and authored rather than becoming a general quest scripting system prematurely.

### Additional playable characters

Naruyo and Sakari remain to be implemented.

Their kits should drive generic engine additions where necessary rather than introducing character-specific engine hacks.

### Additional campaigns/content

Longer-term content currently includes concepts for:

* Normal / Hard / Extreme Skunk campaigns;
* Castle routes;
* Factory;
* smaller Bandit/Rope content;
* additional bosses and enemy types.

Much of this remains deliberately deferred while the core combat/campaign architecture matures.

---

# 19. Known Engine/Content Work Still Deferred

Several useful systems are planned but are not current universal engine rules.

These include:

### Generic binding spread

Latex currently owns specialized spread behavior.

The intended future direction is to make spread an engine-level reusable binding mechanic so other restraint types, such as Castle Ribbons, can reuse it.

### Generic binding locks / floors

Future bindings may contain a locked minimum value that ordinary escapes cannot reduce.

Unlock actions and campaign-specific permission to unlock are planned.

This system does not yet belong in `Game Rules.md` because it is not implemented as a general rule.

### Expanded traps

Current traps are primarily movement-triggered probabilistic hazards.

Future content may require visible, hidden, disarmable, persistent, or conditionally triggered traps.

This should be built only as actual content requires it rather than as a speculative dungeon engine.

---

# 20. Campaign / Meta Progression

Large-scale progression remains intentionally deferred.

Two broad ideas remain alive:

* character-oriented **Ascension** progression;
* collectible magic-item/perk loadouts;
* potentially a hybrid of both.

The important constraint is that the **base game must stand on its own**.

Core characters, campaigns, and encounters should not depend on a meta-progression layer to become complete or enjoyable.

Meta progression should primarily expand options, interactions, replayability, and character expression rather than repair an incomplete baseline game.

---

# 21. Important Design Principles

The following principles have survived enough development to be treated as current project direction.

### Build the game before polishing the shell

Mechanical correctness, testability, and interesting decisions take priority over a final graphical UI.

### Keep the engine black-box usable

A UI or harness should not need private knowledge to play KCQ correctly.

### Prefer generic mechanics driven by real content needs

When multiple pieces of content require the same behavior, promote it into a reusable engine mechanic.

Do not build large generalized systems merely because they might someday be useful.

### Preserve determinism

Diagnostics, previews, rendering, telemetry, and policy evaluation must not accidentally change combat outcomes.

### Replay is first-class

Runs should remain reproducible and inspectable.

### Automated testing informs design; it does not define fun

Harness data should identify behavior worth investigating, not replace design judgment.

### Avoid the auto-attack game

A major encounter that can be reliably solved by blindly using basic attacks is a warning sign.

Meaningful abilities, escape decisions, target priorities, and enemy mechanics should matter.

---

# 22. Explicitly Obsolete Project Assumptions

The following older descriptions should no longer be treated as current:

### “KCQ is still primarily an engine prototype.”

Obsolete. It now has playable content, browser presentation, public releases, telemetry, and a substantial testing apparatus.

### “The public/web console is the next major milestone.”

Obsolete. The browser version has already been implemented and publicly released.

### “The web build still needs an encounter selector.”

Obsolete. The browser currently exposes the encounter catalogue.

### “Analytics/replay reporting are still only a future design problem.”

Obsolete. Anonymous battle telemetry and replay-oriented collection infrastructure now exist.

### “There are only three Plains encounters.”

Obsolete. The current content catalogue contains six encounters: three Plains and three Forest.

### “The current milestone is 0.5.”

Obsolete. The current documented public release is 0.8.0.

### “The harness is still just a simple single-fight runner.”

Obsolete. The project now has batch comparison, multiple policy families, parallel infrastructure, metrics, replay capture, and replay analysis tooling.

### “The event revamp is still the immediate next task.”

Obsolete. The event revamp is complete in 0.8.0. Smart harness work is now the current major development priority, followed by another balance pass.

### “BQ1 policy architecture should be recreated directly.”

Obsolete.

BQ1 remains useful historical evidence, but KCQ's character kits and tactical structure should drive its own policy architecture.

---

# 23. Document Maintenance

Update this file when one of the following changes substantially:

* public milestone/release;
* primary development focus;
* major architecture decision;
* playable roster;
* encounter/campaign availability;
* balance conclusions;
* external-testing/telemetry approach;
* major roadmap priority;
* a previously deferred mechanic becomes a stable part of the game.

Do **not** update this document for:

* routine refactors;
* renamed interfaces;
* individual test additions;
* minor numeric tuning;
* implementation details already obvious from the repository.

When this file conflicts with current code, **the repository wins** and this document should be corrected.
