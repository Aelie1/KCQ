# KCQ Project State

**Last updated:** 2026-09-29  
**Status:** Draft — intended for periodic refresh as the project changes  
**Repository:** `Aelie1/KCQ`  
**Current repository baseline:** `master` @ `76d2c178`  
**Current public version tag:** `0.9.1` (2026-09-29)

This document describes **where KCQ is now, what has been established, and what direction the project is taking**.

It is not a substitute for the repository or `Game Rules.md`.

---

## 1. Source of Truth

When sources disagree, use the following priority:

1. **Current repository and tests** — authoritative for implemented behavior, APIs, content, and mechanics.
2. **`Game Rules.md`** — human-readable specification of stable game rules.
3. **This document (`KCQ Project State.md`)** — current project direction, design conclusions, milestones, and priorities.
4. **Trello** — roadmap and task planning. Card completion state may lag actual repository work.
5. **Older design notes and conversations** — historical context only unless reaffirmed.
6. **ChatGPT memory** — convenience, never authoritative over the sources above.

The `package.json` version (`1.0.0`) is package metadata and should not be treated as the KCQ gameplay/release version.

There is currently some known documentation drift, especially in `Game Rules.md`; see **Documentation Debt** below. When that occurs, the repository and tests win.

---

# 2. Project Identity

**Ko-chan's Quest (KCQ)** is the clean reboot/successor to the earlier BQuest implementation.

The project is now well beyond the architecture-prototype stage. It currently has:

* a deterministic combat engine;
* three implemented player characters;
* ten implemented encounters;
* a browser-playable console-style UI;
* anonymous external-playtest telemetry;
* deterministic replay and replay-analysis infrastructure;
* multiple automated combat policies ranging from deliberately naive to full-kit tactical play;
* detailed simulation metrics and batch-comparison tooling;
* a growing set of stress-test / challenge encounters;
* a defined set of larger future directions covering campaigns, more characters, Castle content, and a real web UI.

The project's core goal remains unchanged:

> **Build a mechanically interesting, testable game first; polish the final presentation after the game itself is worth playing.**

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
* enemy behavior and intentions;
* targeting;
* action results and event causality;
* victory and defeat.

UI, harnesses, replay tools, and other consumers should interact through public snapshots, action views, previews, event frames, and sanitized content metadata rather than reproducing engine rules.

The basic interaction remains conceptually:

**GameState + ActionView[] → PlayerAction → ActionResult (EventFrame[] + ActionView[])**

A sanitized public content library now also exists through `getLibrary()`. It exposes safe reference data for characters, enemies, moves, passives, bindings, traps, statuses, and encounters without exposing engine callbacks or mutable internal definitions.

The harness is deliberately treated as another consumer of the engine rather than a privileged simulation layer.

This remains a major architectural improvement over BQuest 1, where testing code increasingly duplicated or depended directly on internal combat logic.

---

# 4. Determinism, Replay, and Reproduction

Determinism remains a first-class project requirement.

Seeded runs should be reproducible, and diagnostics must not perturb the combat RNG.

Combat AI randomness and combat-resolution randomness are deliberately controlled so that:

* problem runs can be reproduced;
* balance changes can be compared;
* policies can be evaluated fairly;
* external player runs can be reconstructed;
* unusual victories or defeats can be inspected after the fact;
* rendering, previews, telemetry, and policy inspection do not change outcomes.

Replay support is now substantial infrastructure rather than a future feature.

The current project includes:

* state-rich fight replays;
* a console replay viewer;
* replay archives;
* retrieval of telemetry-backed external replays;
* release/version-aware replay handling;
* validation of older collected runs where supported;
* batch replay sampling;
* deterministic reproduction from victory/problem seeds.

Replay remains useful both for debugging and for understanding **why** a policy or human player won or lost.

---

# 5. Current Playable Content

## Player characters

The currently implemented party is:

* **Ko-chan**
* **Matsuko**
* **Hinari**

Their kits are implemented and extensively exercised by the harness, although final design and balance are not considered settled.

Naruyo and Sakari remain future playable characters.

Hinari in particular is explicitly open to a larger redesign; her current Store / Release / Subspace kit should not be preserved merely because Smart already knows how to use it.

Character-specific rules belong in their design/content documentation rather than in `Game Rules.md` unless they become general engine rules.

## Encounters

The current content catalogue contains **ten** encounters.

### Plains

* `plains_1`
* `plains_2`
* `plains_3`

The Plains sequence is the original baseline progression and culminates in the Skunk Queen.

### Forest

* `forest_1`
* `forest_2`
* `forest_3`

Forest expands the original encounter set with Fairy support and more difficult Queen conditions.

### Tower

* `tower_1`
* `tower_2`
* `tower_3`

The Tower encounters are deliberately high-pressure variants built around a strengthened Empress encounter.

`tower_1` is the hardest version and is intended to feel like an expected loss while still leaving open the possibility of victory. `tower_2` and `tower_3` are weakened versions in which the player receives increasing divine assistance.

### Outside Realm

* `outside`

`outside` revives the deliberately absurd BQuest 1 “oh, so you want to lose” style gimmick encounter. It is intentionally extreme rather than a normal balance target.

The 0.9.1 patch note records that the current Smart agent can still clear it roughly **2%** of the time, making it extremely difficult but not literally impossible.

These Tower/Outside encounters are currently individual combat scenarios, not yet a complete campaign flow.

---

# 6. Current Public / Web State

KCQ is browser-playable.

The first public browser version was:

**0.7.2 — 2026-09-22**

The current version tag is:

**0.9.1 — 2026-09-29**

At the current baseline, `master` and the `0.9.1` tag point to the same commit (`76d2c178`).

The browser UI currently provides:

* encounter selection;
* normal player actions;
* move/escape/stance availability;
* action previews;
* keyboard and button input;
* End Turn;
* Quit;
* final battle-state handling;
* return to encounter selection after a battle;
* console-style battle presentation;
* a separate scrolling combat log;
* semantic actor/effect styling;
* battle-state highlighting and timed presentation;
* causal combat-log presentation, including per-hit effects for multihit moves;
* shared presentation/controller code with the console implementation.

The browser interface remains deliberately utilitarian.

Its purpose is to make KCQ **playable and testable without installing Node**, not to represent the final graphical UI.

A separate future direction now exists for designing the real web interface once the surrounding game structure is mature enough to justify it.

---

# 7. Release Tags vs. Master

The GitHub Pages deployment flow uses version tags rather than treating `master` itself as the public release boundary.

Therefore:

> **Public state and current repository state may differ between tags.**

At the time of this update they happen to match at `0.9.1` / `76d2c178`.

The web build's version identifier is derived from the selected version tag. The `package.json` version is not the gameplay/replay version.

When discussing current implementation details, use `master`.

When discussing what an external player is actually playing, verify the current deployed/tagged version rather than assuming `master` is public.

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

Recorded gameplay information includes:

* release/version;
* encounter;
* combat seed;
* replay ID;
* actions;
* action success/failure;
* compact state after actions;
* final/current game state;
* action count.

The implementation distinguishes an explicit quit from a browser/session abandonment.

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

The long-term value of telemetry remains **reconstructable play behavior**, not vanity analytics.

---

# 9. Harness State

KCQ now has a mature deterministic combat harness rather than the lightweight runner originally planned.

The current policy set is:

* `idle`
* `basic`
* `escape`
* `smart`

Older `first` and `random` policies were removed once they stopped answering useful design questions.

## Idle

`idle` does nothing and serves primarily as a control/sanity policy.

It verifies that encounters apply real pressure and that victory is not possible without meaningful player actions.

## Basic

`basic` intentionally uses only each character's simple offensive move:

* Ko-chan → Telekinesis
* Matsuko → White Flame
* Hinari → Rockfall

It is a deliberately low-skill anchor, not a representation of competent play.

## Escape

`escape` is the middle anchor.

It starts from Basic-style play but adds simple binding cleanup/rescue behavior around a fixed threshold, generally preferring assistance and using Standing when useful for the bonus escape.

It is intentionally understandable and limited rather than a full tactical player.

## Smart

`smart` is now the full-kit competent harness policy.

It is no longer a planned milestone: Smart v1 is implemented and has already been used for repeated balance work and new encounter calibration.

The harness also includes:

* deterministic single fights;
* large batches;
* parallel batch execution;
* multi-policy comparisons;
* detailed aggregate metrics;
* detailed combat metrics;
* victory/problem seed reporting;
* replay capture;
* replay archives;
* replay sampling;
* external replay retrieval and analysis;
* compare-oriented CLI tooling.

Simulation performance remains fast enough for large experimental batches.

---

# 10. Smart Policy — Current State

The Smart-policy milestone substantially changed what automated testing can tell us.

Smart is built around **public game state and public previews**, rather than reaching into private engine resolution logic.

Its main architecture includes:

* a board assessment of current party/enemy state;
* candidate generation from available actions;
* modular score components with inspectable diagnostics;
* public-preview damage distributions rather than hidden-roll peeking;
* explicit knowledge modules for tactical concepts that generic EV alone cannot understand.

Current Smart knowledge is split into focused modules covering areas such as:

* control effects;
* enemy intentions;
* character-kit interactions;
* periodic binding pressure;
* reactive mechanics;
* Skunk-specific mechanics;
* sustained pressure;
* tempo / encounter pacing.

Smart can currently reason about far more than raw expected damage, including:

* current and projected binding pressure;
* recovery debt;
* assists and self-escapes;
* Standing versus Moving decisions;
* movement traps;
* committed enemy intentions;
* incoming binding pressure;
* linked threats;
* future move access;
* limited/reserve resources;
* control effects;
* kill/finisher pressure;
* Queen reinforcement thresholds and phase stacking;
* encounter-specific Skunk mechanics.

The scoring system is intentionally inspectable. A candidate retains named score components and diagnostics so bad decisions can be investigated rather than treated as unexplained AI behavior.

## What Smart is not

Smart is **not** intended to be an optimal solver.

It is also not a content-agnostic general game AI. The current policy contains substantial authored knowledge for the Skunk content set.

That is acceptable because its job is to be a useful design instrument, not to prove theoretical optimality.

Future content should add focused knowledge only when necessary. Smart maintenance should not become the reason character or encounter designs are frozen in place.

---

# 11. Balance State

KCQ has now progressed beyond its first crude balance pass into a **Smart-informed balance phase**.

The original important result still holds as a design principle:

> **Major encounters should not collapse into an auto-attack solution.**

Basic remains useful as a lower-bound anchor, Escape as a simple survival heuristic, and Smart as a much stronger full-kit reference point.

The existence of Smart means the project no longer has to infer full-kit balance from Basic results that ignore most of the characters' abilities.

Recent balance work has focused not only on win rate but also on whether mechanics create the intended decisions:

* whether control moves are worth actions;
* whether defensive abilities have real boss use cases;
* whether binding cleanup has meaningful partial value;
* whether Queen thresholds create tactical pacing rather than accidental punishment;
* whether encounters become grindy rather than dangerous;
* whether the policy recognizes and responds to explosive enemy mechanics;
* whether character resources are worth spending;
* whether the player is rewarded for reacting to pressure rather than following a fixed rotation.

The project still should **not** treat any automated policy's win rate as the definition of fun or as a perfect estimate of human performance.

Smart is a stronger instrument, not an oracle.

---

# 12. Recent Balance and Content Changes

The period from 0.8.1 through 0.9.1 contained several meaningful balance iterations.

## 0.8.1 — cooldowns and kit cleanup

* Player move cooldowns became a first-class mechanic.
* Ko-chan gained Power of Denial.
* Normal Reflect was reduced to half-binding mitigation while Fairy Reflect retained full negation.
* Fairy Transformation / Empowerment gained cooldowns.
* Matsuko's Compulsions moved to the shared cooldown system.
* Immolation became stronger and also removes half of Matsuko's current bindings.
* Fairy White Flame became an all-enemy attack.
* Fairy Phoenix Kick became a two-hit attack.

## 0.8.2 — pressure/value adjustments

* Attack Me gained a temporary +3 Defense benefit.
* Collar's ongoing spread was changed to scale with its current value rather than behaving almost identically at tiny and large amounts.
* Latex Rain was simplified into clearer fixed binding applications.

## 0.8.3 — modifier rebalance

* Hinari's offensive Release became a -2 Hit / -2 Defense debuff.
* Potency and Vulnerability changed from 12.5% per point to **10% per point**.
* Existing users of those modifiers were adjusted around the new scale.

## 0.9.0 — Skunk pressure cleanup

* Skunks now explode at 20% HP / 60 HP rather than 25% / 75 HP.
* When Pounce ends, the affected character returns to Moving if movement is legal.

## 0.9.1 — challenge encounters and fixes

* Added `tower_1`, `tower_2`, and `tower_3`.
* Added `outside`.
* Fixed Collar spreading at only one quarter of its intended value.
* Changed the third Rainmaker from a Defense buff to a Hit buff to reduce grindiness.

These changes should be viewed as a continuing calibration of tactical pressure, not as a declaration that the current game is finally balanced.

---

# 13. Current Balance Philosophy

Balance should be evaluated through several levels of player behavior rather than by trying to invent one perfect approximation of a human player.

Useful anchors now include:

* intentionally idle behavior;
* naive/simple offense;
* simple escape/rescue behavior;
* full-kit Smart behavior;
* eventually, real-player replay evidence in larger quantities.

Different policies answer different questions.

The harness should expose:

* degenerate strategies;
* dominant moves;
* irrelevant moves;
* encounter pacing problems;
* escape/assist value;
* pressure escalation;
* failure modes;
* character-specific balance problems;
* policy blind spots;
* encounter mechanics that demand or fail to demand the intended response.

It does **not** need to prove one precise “human win rate.”

A fight can be considered wrong because it:

* ends too quickly;
* lasts far too long;
* is beatable by mindless attacks when it should require tactics;
* creates no meaningful pressure;
* produces unavoidable collapse;
* becomes a grind rather than a threat;
* makes an important mechanic irrelevant;
* makes one option obviously dominate the rest of a kit.

Those judgments remain useful even without a perfect automated player.

---

# 14. Completed Foundation: Event Revamp / Causal Combat Log

The 0.8.0 event-model milestone remains an important completed foundation.

Combat-event causality is explicit rather than reconstructed by downstream consumers.

The established model includes:

* only the engine producing top-level game events;
* concrete state changes/results being leaf events owned by the game event that caused them;
* `useMove` owning ordered target-result entries plus move-level effects;
* each evaluated target result owning the effects caused by that result;
* misses remaining represented as evaluated target results with empty effect stacks;
* escapes, phase changes, stance changes, character loads, and encounter loads owning their resulting effects;
* trap triggers appearing before the effects produced by the trap;
* target-result effects resolving before move-level effects.

The motivating multihit case therefore presents naturally as:

**Hit → Damage → Hit → Damage**

rather than all hit rolls followed by all damage events.

This causal structure now supports presentation, telemetry, replay inspection, previews, and Smart-policy analysis.

It should be treated as solved infrastructure rather than a current milestone.

---

# 15. Completed Milestone: Smart Harness v1

The previous project-state document described Smart as the **next major milestone**.

That description is obsolete.

Between September 26 and September 29, Smart grew through repeated iterations into a substantial full-kit policy with board assessment, modular knowledge, detailed diagnostics, richer metrics, and dedicated competency tests.

The repository now treats `smart` as a normal policy alongside `basic`, `escape`, and `idle`.

The first major use of Smart has already occurred:

**Smart implementation → repeated Smart-informed balance work → Tower/Outside stress encounters**

The project should therefore preserve the following lesson:

> **Do not spend another cycle trying to build a mythical perfect human simulator. Maintain Smart as a practical design instrument and move the game forward.**

New Smart knowledge should be added as maintenance when real content requires it, not as an endless standalone project.

---

# 16. Current Development Position

KCQ has just completed a dense cluster of milestones:

* public browser deployment;
* telemetry/replay collection;
* causal event-model revamp;
* action and damage previews;
* first-class player cooldowns;
* sanitized public content-library data;
* Smart v1;
* detailed combat metrics and compare tooling;
* multiple Smart-informed balance passes;
* additional Tower challenge encounters;
* Outside Realm stress/gimmick encounter.

This means the old immediate sequence:

**event revamp → Smart harness → further balance**

has now been substantially completed.

As of this update, Trello's **In Progress** list is empty. There is no single next major engineering direction that should be presented as already chosen.

KCQ is at a genuine milestone boundary / crossroads.

---

# 17. Major Near-Term Directions

The current Trello board now contains several larger **Future Directions** rather than one mandatory next step.

These should be treated as options / project branches until one is deliberately selected.

## Engine support for future content

### Generalize binding spread

Move spread out of Latex-specific behavior into a reusable engine mechanic so future bindings such as Castle Ribbons can use the same primitive.

### Generic binding lock / floor

Allow bindings to carry a locked minimum value that ordinary escape actions cannot reduce below.

This is intended to support systems such as Leather restraints and Castle Seal Ribbons, with campaign rules deciding when unlock actions are allowed.

### Expanded traps

Grow traps beyond the current probabilistic movement hazard only when actual content needs visible, hidden, disarmable, persistent, or condition-triggered trap behavior.

### Engine helper / cleanup pass

Perform narrow cleanup opportunistically where upcoming mechanics reveal repeated awkward plumbing. Avoid speculative framework building.

## Game/content directions

### Add Naruyo + Sakari and character selection

Expand the playable roster to five and stop assuming one fixed three-character party.

This requires both worthwhile character kits and party-selection support across engine/content/UI/harness boundaries.

### Build a complete campaign loop

Turn the current collection of isolated fights into an authored start-to-finish experience with encounter sequencing, carryover/cleanup, transitions, defeat/restart flow, and a real endpoint.

The Trello card was written when there were six levels; the concept remains valid even though the catalogue now contains ten encounters.

### Build the Castle content set

Begin the next major content area, using real Castle content to drive generic spread, lock/seal, and other engine additions where needed.

### Design the real web UI

Replace the utilitarian browser console with the long-term presentation layer once campaign navigation, party selection, story presentation, and content structure are stable enough to design around.

### Revamp Hinari

Revisit whether Store / Release / Subspace should be simplified, replaced, or substantially reworked.

Smart knowledge should be updated after that design decision, not used as an argument against changing her.

---

# 18. Campaign / Carryover Direction

Campaign structure remains one of the largest missing pieces between “combat game” and “complete game.”

The intended direction remains a relatively small authored campaign layer rather than a generic quest scripting engine.

Expected campaign responsibilities include:

* encounter sequencing;
* explicit victory/defeat progression;
* between-fight carryover rules;
* cleanup of encounter-local state;
* route state;
* pre-fight and between-fight decisions;
* story/transition presentation;
* deterministic campaign harness runs;
* restart/completion flow.

The existing engine already reports battle outcomes, but a full campaign layer must define what persists and what resets across encounters.

Tower and Outside currently provide additional encounter content, but they do not replace the need for campaign progression.

---

# 19. Additional Playable Characters

Naruyo and Sakari remain planned future characters.

Their kits should be designed as distinct contributions to the party rather than simply increasing roster count.

New character mechanics should drive generic engine additions only when those mechanics genuinely need reusable support.

Avoid character-specific hacks in the core engine.

Character selection will become necessary once the roster exceeds the fixed three-character party.

That change will also need deterministic harness support for explicit party compositions.

---

# 20. Known Engine / Content Work Still Deferred

Several systems remain intentionally deferred until real content demands them.

## Generic binding spread

Latex currently owns specialized spread behavior.

The desired direction is a reusable engine-level spread primitive with content-defined topology/amount.

## Generic binding locks / floors

A binding may eventually store a minimum locked value that normal escape cannot cross until an unlock action or campaign permission removes the lock.

## Expanded traps

Current traps are primarily movement-triggered probabilistic hazards.

Future content may require traps with visible/hidden state, disarming, persistence, alternate triggers, or richer interaction.

## Super Skills / Limit Breaks

Still deep-future design work.

Do not add them merely because they are a familiar RPG feature; they need a clear charge/use role and should not become automatic first-turn burst buttons.

## Double / Triple Techs

Also deferred.

Cooperative techniques may eventually support character relationships and progression, but their action economy and unlock structure should be designed only when the baseline game is stable enough to justify them.

---

# 21. Campaign / Meta Progression

Large-scale progression remains intentionally deferred, but the design direction has become more concrete.

The current dedicated campaign/meta-progression design favors **horizontal unlocks rather than permanent stat inflation**.

Core characters should be complete without this layer.

The present conceptual split is:

* **Ko-chan — Why Not?**: changes a rule or limitation affecting a selected character.
* **Matsuko — Training Program**: improves or alters a specific move.
* **Naruyo — Battle Outfit**: provides an encounter-start performance benefit until the outfit is damaged/broken.
* **Sakari — Distortion / Sabotage**: makes some part of the enemy side work incorrectly or less reliably.
* **Hinari — Inventory**: brings limited-use tactical items into a campaign.

The shared principle is:

> **Progression should unlock new choices, not mandatory permanent power.**

Campaign/meta systems should remain unimplemented until the game has at least:

* stable core character kits;
* stable enemy mechanics;
* a working campaign structure;
* enough harness evidence to understand baseline balance.

They must not be used to repair incomplete base characters or encounters.

---

# 22. Documentation Debt / Known Source Drift

The project documentation is useful, but the development pace from September 25–29 outran some of it.

## `Game Rules.md` needs a refresh

Its header still identifies `f30b6c0` from 2026-09-24 as its source baseline.

At least one known rule is now stale:

* `Game Rules.md` still describes Potency and Vulnerability as **12.5% per point**.
* Current code and the 0.8.3 patch notes use **10% per point**.

Player cooldown semantics added in 0.8.1 also need to be represented as stable rules if they are not already documented in the relevant section.

Until that document is refreshed, repository/tests are authoritative.

## Trello contains some stale cards

This is expected and is why Trello is below the repository in the source-of-truth order.

Examples at this checkpoint:

* the backlog still contains “Add sanitized definition/library API,” but `master` now exposes `getLibrary()` and a sanitized `ContentLibrary`;
* the campaign-loop Future Direction still refers to “the current six levels,” while the content catalogue now contains ten.

Do not infer implementation status from card location without checking the repository.

## Patch Notes

`Patch Notes.md` is currently updated through 0.9.1 and is a useful concise record of release-level changes, but it should not replace the repository or this broader project-state document.

---

# 23. Important Design Principles

The following principles have survived enough development to be treated as current project direction.

### Build the game before polishing the shell

Mechanical correctness, testability, meaningful decisions, and content take priority over a final graphical UI.

### Keep the engine black-box usable

A UI, harness, replay viewer, or future client should not need private engine knowledge to play KCQ correctly.

### Expose useful public information instead of duplicating rules

Action views, previews, event frames, and the sanitized content library should give consumers enough information to make decisions without reimplementing combat logic.

### Prefer generic mechanics driven by real content needs

When multiple pieces of content require the same behavior, promote it into a reusable engine mechanic.

Do not build large generalized systems merely because they might someday be useful.

### Preserve determinism

Diagnostics, previews, rendering, telemetry, replay tools, and policy evaluation must not accidentally change combat outcomes.

### Replay is first-class

Runs should remain reproducible and inspectable.

### Automated testing informs design; it does not define fun

Harness data should identify behavior worth investigating, not replace design judgment.

### Smart is a tool, not the game

Do not freeze character/content design merely because Smart currently understands it.

Update the policy when the game improves.

### Avoid the auto-attack game

A major encounter that can be reliably solved by blindly using basic attacks is a warning sign.

Meaningful abilities, escape decisions, target priorities, enemy mechanics, and timing should matter.

### Avoid the endless-harness trap

The project now has a competent Smart policy. Improve it when content exposes a meaningful blind spot, but do not indefinitely postpone campaigns, characters, content, or UI in pursuit of a perfect simulated human.

---

# 24. Explicitly Obsolete Project Assumptions

The following older descriptions should no longer be treated as current.

### “KCQ is still primarily an engine prototype.”

Obsolete. It has playable content, public browser presentation, telemetry, replays, a substantial harness, and multiple released/tagged balance iterations.

### “The public/web console is the next major milestone.”

Obsolete. It has already been implemented and released.

### “The web build still needs an encounter selector.”

Obsolete. The browser exposes the encounter catalogue.

### “Analytics/replay reporting are still only a future design problem.”

Obsolete. Anonymous battle telemetry and replay-oriented collection/analysis infrastructure exist.

### “There are only three Plains encounters.”

Obsolete. The catalogue now contains ten encounters across Plains, Forest, Tower, and Outside Realm.

### “There are six encounters.”

Obsolete as of 0.9.1. Tower and Outside Realm increased the catalogue to ten.

### “The current release is 0.8.0 / 0.8.1.”

Obsolete. The current version tag is 0.9.1.

### “The harness is still just a simple single-fight runner.”

Obsolete. It includes multiple policy levels, parallel batch comparison, detailed metrics, replay capture/sampling, external replay analysis, and Smart.

### “Smart harness / board evaluation is the current next task.”

Obsolete. Smart v1 is implemented and has already been used for substantial balance work.

### “The next sequence is Smart → balance.”

Obsolete as an immediate roadmap. That sequence has already occurred through the 0.9.1 cycle.

### “Full-kit balance still cannot be evaluated automatically.”

Obsolete in the old absolute sense. Smart now provides a competent full-kit automated reference, although it is heuristic and content-aware rather than an optimal player.

### “BQ1 policy architecture should be recreated directly.”

Obsolete.

BQ1 remains useful historical evidence, but KCQ's actual mechanics and content should drive its testing architecture.

### “The sanitized content-library API is still future work.”

Obsolete. `master` now exposes `getLibrary()` and `ContentLibrary`.

---

# 25. Document Maintenance

Update this file when one of the following changes substantially:

* public milestone/version tag;
* primary development focus;
* major architecture decision;
* playable roster;
* encounter/campaign availability;
* balance conclusions;
* harness capability level;
* external-testing/telemetry approach;
* major roadmap priority;
* a previously deferred mechanic becomes a stable part of the game.

Do **not** update this document for:

* routine refactors;
* renamed interfaces;
* individual test additions;
* minor numeric tuning that does not alter broader balance conclusions;
* implementation details already obvious from the repository.

When this file conflicts with current code, **the repository wins** and this document should be corrected.
