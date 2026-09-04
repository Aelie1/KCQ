# KCQ Design Notes — v5

**Refresh:** 2026-09-01  
**Checkpoint:** Historical archaeology through v4 is consolidated; v5 records the first substantial KCQ combat-system design pass through core state, turns/intents, resolution, timing, persistence, and dashboard requirements.  
**Purpose:** Living design/archaeology notes. These are **not requirements** unless explicitly promoted to a committed decision.

## Version History

- **v1** — Initial board: Adventure scenario archaeology (Factory/Castle/Skunk/Bandit), setup events, between-fight events, fail-forward state, and early KCQ candidates.
- **v2** — Consolidates Arena v1, Arena v2, Adventure, and Quest PnP observations; adds Quest PnP core combat/classes/enemies/Castle; adds defeat-after-capture and Ascension-style difficulty ideas; standardizes lineage terminology; records current preservation priorities before moving into computerized Quest.
- **v3** — Adds the computerized Quest review: implemented class changes, engine/state observations, the complete Skunk enemy-family and campaign analysis, computerized Castle combat material, the Castle development postmortem, difficulty/balance lessons, and current resurrection priorities.
- **v4** — Adds primary-source feedback/revival history: 2016 launch/playtest discussion, DeviantArt reception, later Discord design debates, the 2020 Castle recollection, and the 2023 attempted revival. Refines the Skunk balance diagnosis, documents the old UI/engine architecture failure, records the three-path computerized Castle plan and Super Princess concept, and adds resolution/UI/testing principles for KCQ.
- **v5** — Records the first structured KCQ combat contract: scenario authority, fine-grained bondage with discrete bands, character capabilities, Stand Still, shared party/enemy phases, visible locked intents, arbitrary enemy `chooseMove(gameState)` logic, unified status timing, the Miss/Graze/Hit/Crit resolution bar, mobility-style Defense, fixed character power with scenario-defined persistent state, and dashboard/UI requirements.

## Status Key

- **Current intent** — user currently expects this to survive into the new game unless later work gives a reason to change it.
- **Preserve target** — specific old content/identity the user currently wants to recreate or closely analogize.
- **Strong candidate** — currently looks worth carrying forward, but not committed.
- **Historical lesson** — something learned from an earlier game in the lineage.
- **Scenario salvage** — an idea worth preserving even if the original scenario is not rebuilt.
- **Open question** — deliberately undecided.
- **Probably avoid** — an old pattern that seems undesirable in a future version.

## Working Terminology

Use these names consistently while discussing the lineage:

- **Arena v1** — original Arena chat PvP game.
- **Arena v2** — Arena remake.
- **Adventure** — PvE GM-run combat/RP game.
- **Quest PnP** — tabletop/chat Quest ruleset that followed Adventure.
- **Quest** — computerized Quest/BQuest game.
- **KCQ** — provisional working name for the new project; likely to receive a distinct final title later.
- **Lia's Adventure** — the separate Castle CYOA / interactive-novel / escape-room branch. It is a content mine, not the primary combat-structure ancestor for KCQ Castle.

### Side branches / provenance cautions

- Arena v1's wiki was open. PvE/Boss/Adventure-looking pages in that wiki are not automatically evidence of the user's own design trajectory; some were community-created.
- An independent JavaScript implementation of Arena v2 made by another player exists. Treat it as a useful interpretation/automation side branch, not automatically as a main lineage step.
- Adventure was collaborative. Talyn authored the feats and a substantial amount of the surrounding class/mechanical material. The user's strongest personal authorship/interest is in the scenarios, especially Skunk, Bandit, and Castle. Do not treat every Adventure subsystem as direct evidence of the user's own design intent.
- Lia's Adventure is much larger than the combat Castle versions but is not a combat game. Use it later to mine rooms, situations, route concepts, traps, prose ideas, etc.; do not let its structure override Adventure/Quest PnP/Quest Castle when reconstructing the combat lineage.

## Lineage / Main Design Pressures

| Generation | Main reason for change | Main lesson |
|---|---|---|
| **Arena v1** | Original chat PvP game | Large bespoke class kits created duplicated niches, arbitrary balance, turn-1 “ult” behavior, and abrupt 0→60 capture outcomes. |
| **Arena v2** | Fix Arena v1's mechanical/balance problems | Standardized attack slots, 2d10, staged buildup, and an ultimate that rewards accumulated board state created a much cleaner PvP game. |
| **Adventure** | Most of the community wanted to play subs and had little/no interest in dominating another player | PvE solved an incentive/social problem rather than a flaw in Arena v2's PvP rules. |
| **Quest PnP** | Adventure sessions were slow and produced substantial player downtime | Strip down the human procedure while making bondage itself the player's defeat/progression system. |
| **Quest** | Dealing with other people was itself a barrier to play | Computerization made the system reliably playable and gave the rules substantial real testing despite sparse PnP play. |
| **KCQ** | Modern implementation and AI may remove old GM/programming/content burdens | Reconsider ideas that died because of human-GM load, programming cost, or multiplayer downtime—not only ideas that were genuinely unfun. |


---

# KCQ Combat Contract — v5 Checkpoint

This section records the **current design decisions from the structured KCQ combat discussion**. Where it conflicts with older candidate language later in this document, this section is the newer authority. Exact numbers, formulas, visual styling, and implementation architecture remain intentionally undecided unless noted.

## Core asymmetry and scenario authority

**Current intent.** KCQ keeps the basic asymmetry of computerized Quest without imposing universal encounter outcomes.

- Players attack enemies primarily through **HP damage**.
- Players do **not** have an ordinary HP loss clock by default; bondage and other scenario states are the relevant player-side pressure systems.
- **Victory conditions are defined by the scenario.** In the large majority of ordinary fights this will probably amount to defeating the required enemies, but the engine does not hard-code that assumption.
- **Defeat conditions are defined by the scenario.** There is no universal requirement that all characters be Captured, incapacitated, or otherwise reach a specific state.
- **Captured is scenario-defined.** It does not universally mean removed from combat, unable to act, or defeated. The old Dress Stand case remains a useful example: a character can count as Captured while still having enough freedom to attack.
- Scenario-specific rules may override normal combat conventions whenever the content calls for it.

The general design direction is therefore **engine capabilities, scenario policy**: the core provides combat/state machinery, while scenarios decide what those states mean for winning, losing, recovery, routes, and special objectives.

## Persistent character power and between-fight state

**Current intent.** Go approximately as far as computerized Quest did rather than adding a conventional RPG progression treadmill.

- Characters have authored baseline identities rather than general XP/level/stat-growth systems.
- No default gear ladder, randomized equipment progression, permanent stat inflation, or ordinary leveling system is assumed.
- A character is normally mechanically the same character from fight to fight.
- **Any state may persist between encounters if the scenario says it does.** Bondage is an obvious example, but persistent restraints, buffs/debuffs, assistance effects, curses, tutus, route conditions, or arbitrary scenario flags are equally valid.
- Persistence is not the same thing as progression.
- There is **no universal between-fight recovery rule**. A scenario may fully reset the party, partially clean them up, preserve nearly everything, add new state after victory/defeat, or do something entirely bespoke.

This keeps campaign attrition available without requiring every campaign to use the same attrition model.

## Bondage state model

**Current intent / strong candidate.** Use fine underlying numerical state with low player-facing arithmetic.

- A scenario defines whichever **bondage tracks** it needs. The Skunk family currently suggests tracks such as Head, Torso, Arms, Legs, and Collar, but this is not a universal mandatory list.
- Tracks are **independent**. Distinct restraints that need distinct mechanical meaning should normally be distinct tracks rather than multiple overlapping objects hidden inside one number. For example, handcuffs and mittens can be separate tracks if a scenario needs both.
- Ordinary bondage tracks can use the familiar severity ladder **Easy / Medium / Hard / Extreme / Impossible**.
- The engine may use a much finer internal scale such as roughly 0–100+ rather than the old 1–10 tabletop-friendly values.
- **100 is a threshold, not necessarily a hard cap.** Overbinding above the normal Impossible threshold is allowed when the fantasy/mechanics benefit from it.
- Exact band widths, thresholds, and consequences may vary **by bondage type**.
- Crossing a band boundary changes its consequences **immediately**, in either direction.
- Higher bondage can reduce combat effectiveness or remove capabilities, but those consequences are defined by the bondage/status rather than by one universal severity equation.
- The player should not need exact bondage numbers. Bars, band labels, and clear capability/status changes are the main presentation.

### Skunk-specific escape direction worth prototyping

A particularly promising Skunk-family behavior is that heavy latex makes escape increasingly resemble **redistribution** rather than a binary success/failure:

- at low bondage, escape mostly removes latex;
- at moderate bondage, some removed material may spread elsewhere;
- at high bondage, a successful local escape may mainly move the problem from one body area to another;
- at extreme/overbound state, an escape could even increase total latex while still freeing the targeted area enough to recover an important capability.

This is a **Skunk-specific candidate**, not a universal escape rule.

## Character capabilities and move requirements

Moves should care about **what the character can physically/functionally do**, not about rigid RPG damage categories.

- At minimum, useful capability concepts include **Motion** (enough arm/body freedom for actions that require physical motion) and **Verbal** (enough mouth/speech freedom for actions that require it).
- Moves define their own requirements. A move may require Motion, Verbal, both, neither, or some other capability.
- A class/character only needs to display capabilities that actually matter to its kit. If Valkyrie's moves do not care whether her mouth is free, a Verbal indicator is pointless clutter and should not be shown.
- Additional capabilities such as Vision, Concentration, Movement, etc. should be introduced only when concrete mechanics need them.
- Bindings/statuses alter capabilities; move availability follows from those requirements.
- Exceptions belong naturally to the move/character. A telekinetic character might assist while arms-bound but fail when gagged, for example.

## Primary action economy

**Current intent.** Each player character normally has **one primary action per round**.

Attacking, escaping, assisting another character, and using class abilities compete for that action unless a specific ability says otherwise. There is no assumed universal bonus-action economy.

Secondary resources are **character-specific**. One class may have mana, another swords/ammunition, another Ribbon Power, another cooldowns/charges, and another nothing at all.

### Stand Still

The old Stand Still mechanic remains a strong fit:

- Stand Still consumes the character's primary action.
- The character receives **two Escape/Assist actions**, in any combination.
- Those actions may target different restraints and/or different characters when valid.
- The character becomes easier for enemy attacks to affect through the upcoming enemy phase.
- The character counts as **stationary** for environmental rules.
- Environmental consequences are scenario-specific: standing still may avoid Skunk puddles, while a different scenario could punish stationary characters.
- It is acceptable for Stand Still to have little/no practical downside in a round where visible enemy intents do not threaten that character. Recognizing a safe recovery window is part of the tactical payoff of visible intents.

## Round structure and enemy intents

**Current intent.** Combat uses a shared party phase followed by a shared enemy phase.

The normal round opening is:

1. Start of player phase / round.
2. Tick and expire active timed effects.
3. Activate effects that were deliberately pending until this round.
4. Generate enemy intents from the resulting game state.
5. Reveal those intents.
6. Players act in any order.
7. Enemies execute their locked intents from top to bottom in displayed enemy order.

Enemy order is **scenario-defined**. An encounter may deliberately use a specific order when sequencing is mechanically important. Randomizing an initial order is available as a convenience, but not a rule, and the order does not need to re-randomize every round.

### Intent rules

- Intents show at least the **move/action name and target**.
- Hover/click can explain what the move does; exact numbers do not normally need to be exposed.
- Intents are normally **locked** once revealed.
- If an intent's target becomes invalid before execution, the move normally **fails/fizzles** rather than silently selecting a replacement.
- If the acting enemy becomes unable to perform the declared move, the intent likewise fails.
- Player abilities may explicitly **redirect, modify, or cancel** intents. Taunts are a prime example: they can pull compatible targeting onto the user.
- A move may explicitly define fallback/retarget behavior, but that is an authored exception rather than a hidden engine behavior.
- Precommitted/automatic reactions are welcome; interrupt-prompt spam is not. A player can set up “when X happens, automatically do Y” without being asked to confirm every trigger during the enemy phase.

Visible intents are meant to be interactable information, not merely forecasts.

## Enemy move selection

Conceptually every enemy should expose something equivalent to:

```text
chooseMove(gameState) -> selected move/intent
```

What happens inside that function is **completely arbitrary** and belongs to the enemy/scenario design. It may be deterministic, random, conditional, phase-based, scripted, stateful, Ascension-sensitive, deliberately stupid, or highly coordinated.

Enemy selection may account for other enemies and their already selected/planned intents. The exact mechanism for cross-enemy communication is an **implementation detail**, not a conceptual combat-system requirement.

This also keeps targeting intelligence available as a difficulty/Ascension lever: baseline enemies can avoid excessive accidental dogpiling while harder variants can coordinate and punish vulnerabilities more aggressively.

## Buffs, debuffs, and status timing

**Current intent.** Avoid individual-character duration clocks. Timed effects share a single round clock.

- All ordinary timed effects **tick at the start of the player phase**, before player actions and before new enemy intents are generated.
- A player-applied effect normally becomes active immediately.
- Therefore a player-applied `Defense Up (1)` used during the player phase remains active through the coming enemy phase, then expires at the start of the next player phase.
- Enemy moves may apply effects **immediately** or as **pending** effects that do not activate until the start of the next round.
- At round start, existing active effects tick/expire **before** pending effects activate. This prevents a newly activated duration-1 effect from immediately consuming its only round.
- Intents are chosen only after ticking/expiration and pending activation have completed.
- Delaying enemy-applied vulnerability-style effects gives the player a response window before the next enemy phase. Same-phase enemy combo debuffs are still allowed when explicitly designed that way.
- Stacking, refreshing, intensifying, maximum stacks, replacement behavior, etc. are **properties of the individual status** rather than universal rules.
- Statuses may affect literally any mechanic the content needs: resolution bands, bondage, Defense, resources, targeting, intent behavior, capability requirements, environmental interactions, and so on.
- Statuses can be represented by text, icons, or both; tooltips should make the exact effect/timing clear.

## Unified move resolution bar

**Current direction.** Player and enemy moves use the same **Miss / Graze / Hit / Crit** resolution machinery.

Each move has a base resolution profile. Current game state then modifies that profile according to whatever modifiers the move permits: Defense, restraints, statuses, buffs/debuffs, environmental rules, move-specific conditions, difficulty effects, etc.

Conceptually:

`base move bar -> state modifiers -> final visible bar -> one resolution -> move-defined outcome`

Key properties:

- **Every move can use the bar.** A guaranteed move is simply 100% Hit.
- Any result region may have zero width. A move does not need Graze or Crit just because those concepts exist.
- A truly guaranteed/unmodifiable move can be 100% Hit and explicitly immune to resolution modifiers.
- A move can start at 100% Hit but still become unreliable when impaired.
- Ordinary moves can live in familiar midrange hit probabilities.
- Risky moves can deliberately have large Miss/Graze space in exchange for stronger payoff.
- Large ultimates do not need to risk absurdly tiny successful damage simply because randomness exists; their allowed bands/ranges can ensure that successful outcomes still feel appropriately large.
- For numeric effects, **exact position inside a band may matter continuously**. One roll can therefore determine both quality and magnitude rather than requiring a separate hit roll plus damage roll.
- For discrete effects, the move can define explicit outcomes by band instead.
- A simple Taunt can just be a 100% Hit action with no Graze/Crit behavior at all.
- Player and enemy moves use the same machinery even though their successful effects are highly asymmetric.

Exact percentages, band widths, modifier transforms, and formulas remain intentionally open for prototyping.

## Move definition

A move can define whatever properties it needs, such as:

- name;
- targeting rules;
- capability/other requirements;
- resource/cost;
- base resolution bar;
- which modifier categories may affect that bar;
- Miss/Graze/Hit/Crit outcomes or continuous effect scaling;
- statuses and other state changes;
- timing/persistence;
- intent manipulation;
- arbitrary special rules.

Properties are **optional where sensible**. Omitted properties should use harmless defaults rather than forcing boilerplate. The eventual code/schema is an implementation question.

Targeting is likewise move-defined. A move may target a character, enemy, binding track, intent, battlefield object, multiple things, or a scenario-specific object. The important universal requirement is that the UI makes valid/invalid targets and the committed target obvious.

## Defense and enemy HP

### Defense

Use **one default Defense concept**, understood primarily as **mobility/evasiveness**, not armor thickness.

- Higher Defense makes hostile resolution bars less favorable to the attacker.
- Lower Defense makes clean Hit/Crit outcomes easier.
- Stand Still naturally lowers effective Defense because the character is voluntarily easier to hit.
- Armor, barriers, resistance, damage reduction, etc. can exist as separate mechanics when needed rather than being baked into the meaning of Defense.
- Moves may ignore or interact specially with Defense when authored to do so.

Exact formulas and whether the UI shows Defense as a raw value, percentage, bar, symbols, etc. remain open.

### Enemy HP

Enemies can keep ordinary numeric HP internally, but presentation is primarily a **health bar**.

- Damage numbers can appear as satisfying immediate feedback.
- Exact HP arithmetic does not need to be central to planning.
- Scenario-defined victory means reaching 0 HP does not need to be the engine's universal victory trigger, even though ordinary “kill shit” encounters will usually use it.

## Bondage/action preview UI

Exact bondage numbers do not need to be shown. When an action would change a bondage track, preview the relevant section directly on the bar:

- blink/highlight the portion expected to be removed;
- show a range when the result is uncertain;
- if bondage is redistributed, simultaneously preview what may be added to another track;
- make impending severity-band crossings visually obvious.

The player should be able to understand “this probably frees my arms enough to regain Motion, at the cost of making my torso worse” without doing arithmetic.

## Character dashboard

The dashboard should answer three practical questions: **what can this character do, how compromised are they, and why?** It is character/class-driven rather than a universal RPG stat sheet.

Useful dashboard information includes:

- **ability resources** relevant to the character (mana, swords, Ribbon Power, charges, cooldowns, etc.);
- an at-a-glance **Defense** indicator;
- an at-a-glance summary of relevant **attack/action capabilities**;
- current **bondage tracks and severity bands**;
- current **statuses**;
- which moves are currently **available/disabled**, with clear reasons for disabled moves;
- whether the character has already acted / is Standing Still / has relevant armed reactions or other action-state information.

Do not assume global Physical/Magic/Ranged dashboard categories. Persistent capability indicators should come from the character's actual kit. A class that never cares about Verbal freedom should not waste space showing it.

A useful presentation split is:

- **dashboard:** broad current capabilities and state;
- **move/target preview:** the exact final resolution bar and relevant consequences for the specific action being considered.

---

# Strong Candidates / Current Intent for KCQ

## Bondage-based player pressure; no ordinary player HP

**Current intent.** Do not reintroduce ordinary player HP as a second loss clock.

Adventure allowed players to lose because their HP reached zero even when the thematic point of the encounter was for the enemy to capture/tie them. Quest moved toward a much cleaner asymmetry: enemies use HP, while player danger is expressed through bondage and other scenario state.

KCQ now goes one step more general: **the scenario defines victory and defeat.** Bondage therefore remains the central player-side pressure language without forcing every scenario to use `all party members Captured` as a universal loss condition.

**Historical lesson:** the pressure/loss system should align with what the opposition is actually trying to accomplish. Bondage is not merely a cosmetic debuff layered over a conventional player-health game.

## “You lost. What now?” — defeat as scenario state

**Strong candidate.** If win/loss conditions are expanded, spend design effort on what happens **after capture**, not on restoring HP-based defeat.

A full-party combat loss does not necessarily have to mean `Game Over → New Game`. Capture is unusually easy to continue narratively because the characters are alive and the enemy presumably wanted them for something.

Possible authored aftermaths:

- wake up restrained/in a cell and get a short escape/recovery event;
- lose equipment or accept worse starting bondage for the next section;
- skip a reward or optional objective;
- get moved to a different route/state;
- make the later boss stronger or alter the scenario;
- consume a limited rescue resource;
- eventually reach a true failure state after repeated or late-game defeats.

This does **not** require the full open-ended prisoner simulation of games such as Kinky Dungeon. A relatively small authored continuation branch can make defeat part of the campaign instead of a hard discontinuity.

## Ascension-style difficulty ladder

**Strong candidate.** Separate accessibility from the intentionally punishing top end with an Ascension-like difficulty progression.

- Base difficulty should be approachable enough that new players can learn the systems and see the campaign.
- Higher levels can progressively add harsher enemy behavior, stronger bindings, additional mechanics, reduced recovery, worse event conditions, altered setups, etc.
- Prefer layered modifiers that change decisions over pure numeric multiplication.
- The highest levels can intentionally preserve Quest's reputation/identity as the “Dark Souls of bondage games” without forcing that experience onto baseline players.
- Recreated classic enemies/campaigns can therefore have both an approachable canonical form and deliberately cruel high-Ascension forms.

## Scenario opener / setup event

**Strong candidate.** A route begins with a bespoke event whose outcome determines the state in which the party enters the normal combat sequence.

Useful outputs include:

- starting restraint state;
- alert/stealth state;
- party separation;
- initiative/surprise;
- available equipment;
- enemy reinforcements;
- route-specific control systems;
- optional advantages purchased by accepting a handicap.

A setup event is not merely Random Event #1. It establishes the identity of the route.

Historical examples:

- Factory infiltration: brute force, fence, Rubber Ruse, sewer processing lines.
- Adventure Castle: brute force, intentional arrest/prison escape, noble disguise, maid employment.
- Quest PnP Noble: restrictive noble disguise/bluff setup.
- Quest PnP Maid: starting uniform + obedience collar setup.

## More than a series of fights

**Strong candidate.** Campaigns should have meaningful play between combats without becoming a Slay-the-Spire-style branching node web.

A possible simple shape:

`Setup → Fight → Event → Fight → Event → Boss`

The main campaign can remain authored and fairly linear. The goal is to prevent the campaign from feeling like an enemy selector with cutscenes between fights.

## Lightweight randomized between-fight events

**Strong candidate.** Scenario-specific event pools can create replay variation cheaply.

Preferred event qualities:

- interact with real combat state rather than merely hand out generic rewards;
- offer tradeoffs rather than only bonuses;
- use simple state conditions so nonsensical events do not appear;
- create/remove restraints, change next-fight setup, split/rejoin party members, disable hazards, alter reinforcements, weaken/strengthen bosses, etc.;
- remain themed to the campaign rather than using a universal “mysterious fountain” deck.

Do **not** default to a giant route graph. Small event pools plus a few state flags may be enough.

## Fail-forward scenario state

**Strong candidate.** A failed setup/check/encounter can worsen or reroute the campaign without immediately ending it.

Good forms include:

- start the next fight more restrained;
- alert the area;
- lose equipment;
- temporarily lose a party member;
- create an extra enemy or boss mechanic;
- lose a shortcut;
- preserve a bad condition until the finale.

## Route convergence

**Strong candidate.** Distinct openings/routes can converge later so replayability does not require writing entirely separate campaigns.

Adventure Castle is the clean historical example: very different infiltrations collapse into fewer middle branches and then the same Princess finale while still carrying consequences forward.

## Predictable enemy intents / capture plans

**Strong candidate / preserve principle.** Ordinary enemies should usually have a recognizable procedure rather than arbitrary tactical selection.

The old Adventure strategy pages frequently read like behavior trees already. That maps naturally to visible-intent combat:

- ordinary enemies can be strongly themed and predictable;
- elites can use setup → payoff sequences;
- bosses can be more adaptive;
- deterministic AI can remain the actual balance authority even if an LLM later supplies narration/flavor.

## Recreate classic enemy families more directly than classic player classes

**Preserve target.** Of the old Quest PnP material, enemy identity is currently the strongest candidate for close recreation/analogue.

The exact HP, defense, dice tables, cooldowns, and bondage values are disposable. What matters is the enemy's **capture plan**.

Examples:

- Skunkette: pin/pounce a victim and make that victim easier for the group to overwhelm.
- Latex Skunk: create accumulating battlefield puddles, exploit leg restraint, restore escaped latex, and use a desperation explosion.
- Skunk Queen: spreading/collar pressure, battlefield set pieces, reinforcements/phase escalation.
- Maid: hold/control → tighten uniform/collar → convert a sufficiently compromised victim into “cleaning” instead of fighting.
- Maid Chief: coordinate/control the party and convert compromised victims to Dress Stands.
- Princess: build Ribbon state → exploit/convert it → cage/capture sufficiently compromised players; route can modify part of her kit.

**Design test for KCQ:** if a proposed new combat system cannot express these old capture fantasies cleanly, that may be evidence the system has drifted away from the game's identity.


## Castle resurrection

**Current intent.** Castle remains one of the strongest candidates for a substantial resurrection in a future game.

Keep the historical route counts distinct:

- **Adventure Castle** had four infiltration approaches and is the strongest source for the original scenario fantasies and broad route structure.
- **Quest PnP Castle** partially compressed/reframed those ideas.
- **Quest computer Castle's later remembered/2023 plan** was explicitly **three paths**: **Guard, Noble, Maid**, each ending in a Princess with a route-specific gimmick, followed by combination/final challenge content.
- **Lia's Adventure** remains an optional content mine for rooms, situations, traps, prose ideas, route flavor, etc.; do not treat its noncombat CYOA structure as the default combat blueprint.

The eventual KCQ route count is a design question; do not silently project the computer game's three-path plan backward onto Adventure or forward as a requirement.


---

# Arena v1 Review

## What Arena v1 was trying to do

Original chat PvP bondage combat. Its classes were created largely by brainstorming themed things each class would use and turning those ideas into powers.

## Main problems

**Historical lesson: bespoke theme lists do not automatically produce a coherent combat kit.**

The user remembers four dominant problems:

1. **Duplication / internal tracks.** A class could have several attacks competing for essentially the same target/body niche. Metal Warrior, for example, could have several different arm-focused metal restraints; Dryad effectively contained several different internal themes/tracks.
2. **No meaningful ultimate progression.** There was little reason not to use the biggest/single-use move immediately.
3. **Arbitrary balance.** Individual skills had wildly different floor/ceiling effectiveness.
4. **Abrupt 0→60 capture.** Full-body/single-use effects could nearly decide a match from one lucky roll rather than rewarding buildup.

## Important nuance: bookkeeping was already partially automated

Arena v1 had a substantial Excel calculator that derived statuses/modifiers from selected bindings. Therefore the main failure should **not** be simplified into “the math was too hard for humans.” Much of the state complexity was already hidden by tooling.

The stronger lesson is about **design coherence and progression**, not simply arithmetic burden.

## Other provenance cautions

The Arena v1 wiki was open. PvE-ish pages/Boss Mode/Adventure Map material in that wiki are not automatically user-authored experiments and should not be used as evidence that the user personally moved toward PvE before Adventure unless separately confirmed.

---

# Arena v2 Review

Arena v2 is a mechanical redesign of Arena v1 rather than a change in audience/game mode.

## Standardized attack chassis

**Historical lesson:** standardizing the shape of content can improve both balance and class identity.

Arena v2 uses ten common attack slots/categories across classes (arms, legs, hands, waist, mouth, eyes, ears, neck, harness, ultimate). The basic attack framework is shared; passives/specials provide differentiation.

This directly attacks Arena v1's “brainstorm arbitrary class powers and hope they add up” problem.

## 2d10 and staged effect distribution

The switch from 1d20 to 2d10 changes the game from flat probability to center-weighted outcomes. Common medium results become common; extreme results become rarer, and modifiers behave differently around the center of the distribution.

## Ultimate as horizontal buildup payoff

Arena v2's ultimate requires prior bindings and becomes stronger based on how much of the opponent has already been built up. Casting it early can be a tempo gamble; waiting until a large board state exists makes it far more decisive.

This produces two nested progressions:

- **vertical:** each individual item can strengthen Easy → Medium → Hard → Extreme;
- **horizontal:** more component bindings accumulate until the Ultimate converts breadth into a finishing state.

Useful conceptual shift: Arena v1 attacks often behave like isolated **events**; Arena v2 attacks behave more like **investments in a future board state**.

## Escape/buildup became less all-or-nothing

Escaping is easier than in Arena v1, and the ultimate itself ensures that even initially weak/easy component restraints can become threatening if the opponent allows too many of them to remain.

The important lesson is not necessarily “copy Arena v2's exact ult system.” It is that **buildup can make weak early states strategically meaningful without allowing one lucky hit to jump directly to the ending.**

## Arena v2 → Adventure was not a mechanical failure

The move to Adventure was driven primarily by player incentives: a large majority of the surrounding community preferred being submissive and did not enjoy taking the dominant role, even temporarily in a game. PvP could therefore degenerate into one side intentionally playing poorly or hoping to lose.

**Historical lesson:** game mode must align with what the audience actually wants to do. Adventure's PvE shift solved a social incentive mismatch rather than proving Arena v2 was a bad PvP system.

---

# Adventure Review

## Core medium problem: guided RP made turn length elastic

Adventure was effectively a guided RP session with combat mechanics. Some players would resolve a turn with dice plus a one-line update; others would write large paragraphs for every action.

That makes session/turn length socially elastic and creates severe downtime in a multiplayer turn structure even if the underlying mechanical choice is not complicated.

**Historical lesson:** preserve interesting decisions, but do not force one human player to wait through many other humans' RP/resolution loops before acting again.

## Player HP competed with the capture fantasy

Adventure uses conventional player HP in addition to bondage. The user specifically disliked cases where players lost through HP before the enemy actually completed the capture/tie-up process that made the encounter interesting.

This becomes one of the clearest reasons for Quest PnP's bondage-only player defeat model.

## Adventure scenario priority

Adventure is primarily a **scenario/content mine**, not a system whose feats/classes require exhaustive preservation analysis.

High-value scenario archaeology:

1. Factory
2. Castle
3. Skunk
4. Bandit

Class/feat mechanics are low priority except where they illuminate later Quest systems.

---

# Adventure Scenario Archaeology

## Rubber Factory

**Primary sources:** `Rubber Factory`, `Rubber Factory GM Notes`, `Latex Monster Strategy`.

### Most valuable salvage: infiltration setup

**Scenario salvage / strong candidate.** This is the Factory idea most worth keeping even if the rest of the scenario is discarded.

The four infiltration approaches create different starting game states:

- **Brute Force:** immediate combat / alert state.
- **Over the Fence:** stealth with individual cocoon/capture risk; the party can even abandon a trapped character to preserve stealth.
- **Rubber Ruse:** voluntarily accept severe restraints to improve the disguise, then deal with the restraint afterward.
- **Sewer:** environmental processing can pile on huge restraint states before a conventional fight while preserving stealth.

Key principle: **the route choice determines how you enter the scenario proper.**

### Persistent scenario state

Factory carries multiple variables forward:

- alert state;
- party restraint state;
- captured/separated party members;
- whether optional infrastructure/enemies were destroyed.

Captured allies can later reappear in the finale, and optional actions such as eliminating the Rover can weaken later boss pressure.

### Capture as state, not immediate end

This is especially valuable in a computer-controlled party. In a human multiplayer RP session, removing one player's character from the active party can mean a huge amount of real-world downtime. In a single-player party game, it can instead become an interesting tactical loss: “we are down a character and need to get her back.”

### Enemy strategy is already pseudocode-like

Chaser/Golem/Rover behaviors are described through strong target-selection/response loops. The Rubbermage Overseer is deliberately more intelligent/adaptive.

### Cautions

- too many rolls around decisions that could be resolved more compactly;
- blind risk selection is flavorful but could be partially telegraphed;
- avoid snowball structures where losing a character both weakens the party and excessively strengthens the final boss.

## Castle Assault (Adventure)

**Primary sources:** `Castle Assault`, `Castle Assault GM Notes`, `Castle Assault Strategy`.

Adventure Castle has four infiltrations:

1. Brute force
2. Intentional arrest / prison escape
3. Noble disguise
4. Maid employment

### Setup-event generalization

Castle demonstrates that Factory's infiltration was not merely a one-off gimmick. Each Castle entry route creates a distinct initial condition/fantasy:

- **Brute force:** choose alert state.
- **Prison:** choose to begin captured/without equipment; escape performance determines later alert/state.
- **Noble:** restrictive social disguise; failed bluff becomes a bespoke ballroom Escape Battle that outputs restraint state.
- **Maid:** voluntarily accept an obedience-control system while preserving stealth.

### Between-fight objective play

Castle gives players a small limited-action investigation phase: locate areas, recover equipment, remove route-specific problems, perform maid duties, etc.

This is an early proof that **meaningful between-fight decisions do not require a giant branching map**.

### Route convergence

The four openings collapse into fewer middle branches and then the same Princess finale. This is content-efficient replayability.

### Carrying state into the finale

Route-specific restraint can persist through convergence and be transformed into final-boss-relevant state rather than simply disappearing.

### Enemy encounter identity

Guards/knights and maids use different capture procedures. The Princess is more adaptive and route-sensitive.

### Caution

Adventure resolves too many separate searches/checks/escape attempts/individual turns. Preserve the **choice/state structure**, not necessarily the human procedure.

## Skunk (Adventure)

The scenario is very close to a pure encounter ladder:

`Skunkettes → escape window → Latex Skunks → escape window → Skunk Queen`

There is little meaningful state/route play outside combat. Most identity lives in the enemy mechanics.

**Historical lesson:** the later computerized Skunk campaign's loops/story/Empress structure was a substantial new campaign layer rather than something inherited from Adventure.

## Bandit Hunt (Adventure)

Bandit is only a little more elaborate than Skunk. It includes approach/day-night choices that alter surprise, traps, or the next encounter setup, but largely resets state between fights.

Useful intermediate lesson: **small encounter-setup decisions add flavor cheaply even when they do not create deep persistent state.**

## Adventure scenario structure comparison

| Scenario | Structural complexity | Outside-combat play | Persistent consequences | Main useful lesson |
|---|---|---|---|---|
| Skunk | Low | Ambush + fixed escape windows | Very little | Pure fight ladders need an added campaign layer if they are meant to feel like adventures. |
| Bandit | Low–medium | Approach/day-night choices | Very little | Bespoke next-fight setup adds flavor cheaply. |
| Factory | High | Four infiltrations, environmental processing, detours | Strong | Setup events + persistent fail-forward state. |
| Castle | High | Four infiltrations, limited objective phase, route systems | Strong | Generalize setup events; small between-fight decisions + converging routes. |

---

# Quest PnP Review

Quest PnP is the first point where the system clearly becomes recognizably **Quest** rather than Adventure with another combat revision.

## Core combat simplification

### Shorter turn procedure

Quest PnP reduces the formal turn to:

`trap roll (if relevant) → action`

Movement is mostly assumed. Standing Still remains as the meaningful exception: lower defense, no trap roll, and two struggle attempts.

### Enemy initiative grouped

Players keep individual initiative. Enemies roll initiative but are averaged into a single enemy-side position so the GM runs them together.

**Historical lesson:** grouping opponent resolution is an explicit attack on human GM/turn overhead.

## Bondage becomes the player's distributed defeat track

Quest PnP keeps enemy HP but removes ordinary player HP as the standard defeat condition.

A fight ends when:

- enemies reach 0 HP; or
- all players reach a full set of Impossible bindings; or
- a scenario/enemy-specific capture condition is satisfied.

The 1–10 binding model therefore functions much more like a **distributed player health/capture system** than a collection of side debuffs.

## Progressive status severity

Statuses such as Gagged, Bound, Hobbled, Breathless, etc. progress through several severity steps instead of existing only as on/off penalties.

Typical shape:

- early bondage inconveniences;
- stronger bondage seriously hurts efficiency;
- high bondage removes capabilities;
- final bondage pushes directly toward capture.

This reinforces bondage as the central pressure system.

## Escape is less punitive than Adventure

Quest PnP's normal escape table primarily produces failure or progress; it removes Adventure-style standard escape backfires that could tighten bondage merely because the player tried to struggle.

**Historical lesson:** attempting to escape already has an opportunity cost because it consumes the player's action. It does not also need a large generic chance to make the situation worse.

## Final-capture brake

Bindings progress through Easy/Medium/Hard/Extreme/Impossible, with a special rule preventing a huge single jump through the last part of the track. Once a binding reaches level 8, additional progress above 8 is capped to one level at a time; the rules explicitly prohibit jumping directly from 6 to 10.

This is another anti-0→60 mechanism: getting into danger can be quick, but finishing a capture requires continued pressure.

## Bookkeeping remains nontrivial

Same type/location bindings stack; different binding types can coexist and need separate removal; status severity depends on current bondage; excess can spill to another area.

Conceptually the system is cleaner than Adventure, but it still has substantial state. This is exactly the kind of complexity that can be acceptable if the computer handles it while the player's actual decision remains simple.

---

# Quest PnP Classes

## Roster / role structure

The intended eight-class roster is:

### Damage
- Elementalist
- Ninja
- Sniper
- Valkyrie

### Tank
- Knight
- Magical Girl

### Support
- Dominatrix
- Shrine Maiden

The support pages exist in the original Quest wiki export even though one cleaned project-source copy omitted them.

## MMO influence / turn engines

The important historical lesson is **not** the exact eight classes. The user has no attachment to keeping any of them.

What matters is the two-axis design:

1. **party role:** tank / damage / support;
2. **turn engine:** builder-spender, cooldown/reactive, proc/ramp, DoT/timer, etc.

Representative engines:

| Class | Role | Main engine |
|---|---|---|
| Elementalist | Damage | Pure builder/spender: basic attacks generate Power Marks; specials cash them out. |
| Ninja | Damage | DoT/conditional: maintain Poisoned Blades, use short cooldowns, exploit Sneak Attack conditions. |
| Sniper | Damage | Ramp/proc: repeatedly attack one target to widen critical range until the payoff crit. |
| Valkyrie | Damage | Weapon-resource/cooldown management: rotate/exhaust/break three weapons, eventually cash out with Ragnarok. |
| Knight | Tank | Reactive/cooldown tank: intercept, block/counter, retaliate after being hit, taunt. |
| Magical Girl | Tank | Builder/spender tank: incoming attacks generate Justice Power; taunting deliberately feeds the resource. |
| Dominatrix | Support | Dual-resource/risk support: Terror on enemies + Submission on allies; spend/convert both for buffs/control/debuffs. |
| Shrine Maiden | Support | Reactive builder/spender: struggling/assisting/sacrificing builds Purification Marks used for freeing/protection/offensive seals. |

### Useful class-design lesson

A small kit can still feel strongly different if the **engine** differs.

Resources are especially clean when the builder rewards behavior the role should already want to perform:

- tank gains resource by being attacked;
- support gains resource by assisting/escaping;
- damage dealer gains resource by continuing offensive behavior.

### Preservation status

**No class is currently a preserve target.** All eight can be deleted/replaced without concern. Keep only the design lessons that remain useful when building the actual KCQ characters.

---

# Quest PnP Enemies

## Enemy redesign was evolutionary rather than revolutionary

Many Quest PnP enemies are close descendants of Adventure enemies. The major improvement comes from the surrounding player system: with player HP gone, the enemy's bondage/capture plan no longer competes against a generic damage clock.

## Capture-plan grammar

Many enemies follow a useful pattern:

`apply setup bondage/control → exploit the compromised state → convert sufficiently compromised player into themed capture`

Examples:

- Maid: uniform/collar/control → cleaning defeat state.
- Maid Chief: dress/control setup → Dress Stand.
- Princess: ribbon buildup → Cage Enemy.
- Skunk family: spreading latex / puddles / regeneration → progressively overwhelmed/captured state.

## Boss design

Bosses are allowed more elaborate phase/set-piece behavior:

- Skunk Queen creates Rain Makers and gets reinforcements as HP falls.
- Princess has a core kit plus route-specific mechanics.

This is useful content-efficiency: one boss can remain recognizable while route/difficulty modifies one axis of the fight.

## Preserve status

**Preserve target:** old enemy families and their capture fantasies are currently much more valuable than old classes. Reimplement them in whatever KCQ combat system wins rather than porting their old numbers literally.

---

# Quest PnP Castle

The campaign material is incomplete and apparently received little/no real play. Treat it as design evidence, not a polished final campaign.

## What actually exists

The Quest PnP campaign index contains only:

- Maid Quest Outline
- Noble Quest Outline

The enemy roster similarly focuses on the maid/tailor side of Castle. The Princess still contains route-specific moves for Maid, Noble, Prison, and Brute Force, suggesting remnants/plans of the broader four-route Castle even though only Maid/Noble have campaign outlines.

## Maid route

The Maid outline is visibly unfinished.

### Setup

Characters begin by becoming maids and receive starting obedience-collar + uniform bondage. This is a direct continuation of the setup-event pattern.

### Middle structure

The route is mostly a limited search/objective-management phase:

- locate the Princess;
- recover weapons;
- change/remove uniform problems;
- perform maid work to reduce collar strength;
- decide whether to assist another party member;
- manage obedience checks and increasing curfew pressure.

Failures during the noncombat phase can add Maids to the next hallway fight.

### Archaeological interpretation

This still feels relatively close to Adventure's procedural scenario style: lots of individual searches/checks and roleplay-resolution opportunities. The surviving outline stops before a fully written route finale.

## Noble route

Noble is much closer to a compact Quest-style campaign.

### Shape

`Noble disguise setup → Tailor fight → partial recovery → Magic Battle → Royal Dressmaker fight → partial recovery/state conversion → Princess`

### Setup

The party starts in restrictive noble disguises and can acquire additional problems while bluffing the guards. The concept is strong; in a future version, a purely random setup table could become a more informed risk/reward choice.

### Partial recovery rather than full reset

After major fights, bindings are reduced rather than fully cleared, preserving attrition while avoiding one early disaster automatically deciding the whole route.

### Magic Battle

**Scenario salvage / strong candidate.** This is one of the strongest Quest PnP set pieces.

Players advance Doorway → Hallway → Alcove while the Royal Dressmaker casts down the hall. Existing leg bondage makes progress harder; incoming Dress bondage can make later progress still harder. Once someone interrupts the spell, the normal fight begins immediately from the resulting positions/initiative order.

This is a very clean example of:

**bespoke event → outputs combat starting state → immediately becomes the fight**

rather than an unrelated minigame.

### Finale inheritance

Remaining Dress bondage is converted into Ribbon bondage when the Princess fight begins. The final boss therefore inherits the history of the route rather than starting from an abstract clean slate.

### Historical interpretation

Noble looks much more like the intended Quest campaign direction than Maid:

- fewer low-information search loops;
- authored setup;
- combat;
- partial recovery;
- bespoke set piece;
- combat;
- boss;
- state carried between stages.

This is one of the strongest direct pre-computer ancestors for the KCQ campaign shape currently being discussed.

---

# Preservation / Interest Hierarchy at the Pre-Computer Checkpoint

## Highest preservation interest

1. **Classic enemy families / capture plans** — close analogues/recreations are desirable.
2. **Scenario setup events** — Factory and Castle demonstrate a reusable pattern.
3. **Campaigns as more than fight ladders** — small between-fight decisions/events, not a giant node web.
4. **Bondage-only player defeat** — do not restore ordinary player HP.
5. **Fail-forward/capture aftermath** — investigate what happens after losing instead of requiring immediate restart.
6. **Ascension-style top-end difficulty** — approachable base game, brutal optional high end.

## Preserve principles, not old implementation

- visible/predictable enemy plans;
- role + distinct turn-engine class design;
- gradual capture buildup / brakes against one-roll endings;
- state carried between encounters;
- route convergence to control content cost;
- partial recovery rather than mandatory full reset;
- bespoke event/set-piece mechanics that feed directly into combat.

## Low preservation interest

- the eight Quest PnP player classes themselves;
- exact d20 tables;
- exact HP/Defense/bondage values;
- Adventure feats/class balancing;
- long human-GM search/check procedures;
- arbitrary blind setup rolls when an informed risk/reward choice would be better.

---


---

# Quest (Computer) Review

Quest is not merely Quest PnP with a GM replaced by JavaScript. Computerization changes what complexity is practical, rewrites the playable class roster, turns enemy strategy notes into executable behavior, adds substantial campaign/story structure to Skunk, and experiments with defeat/retry systems that were not obvious from the PnP material.

## Computerization validates hidden state complexity

The underlying 1–10 bondage system remains recognizable, including the brake that prevents the final Impossible levels from being jumped through too quickly. The important change is that the computer owns the bookkeeping:

- current binding levels and historical maxima;
- derived statuses/penalties;
- buffs/debuff durations;
- escape legality/results;
- traps;
- enemy target selection;
- class resources;
- encounter initialization and recovery.

**Historical lesson:** substantial underlying state can be acceptable when the player's actual decision is readable and the computer handles the bookkeeping. Do not simplify merely for the sake of making the internals tiny; simplify where complexity creates bad decisions or bad presentation.

## Computerized playable roster is already a departure from Quest PnP

The eight-class PnP roster is not sacred even within the historical lineage. The computer game uses a fixed three-character party (Lia, Reika, Erin) with Magical Girl, Elementalist, and Valkyrie, and those classes are substantially rewritten for the computerized game.

The computer versions lean harder into distinctive turn engines/resources:

- Elementalist becomes a clearer mana-style builder/spender.
- Magical Girl gains a stronger transformation/ribbon-resource cycle.
- Valkyrie turns the three weapons into concrete rechargeable/breakable resources.

**Historical lesson:** fixed authored characters can have combat systems designed around their individual identity rather than preserving old generic classes.

**Preservation status:** still no attachment to the old class roster itself.

## State carries between fights

Quest does not necessarily wipe the party clean when a fight ends. Encounter rewards can remove a controlled amount of existing bondage while leaving the remainder in place.

The completed Skunk sequence commonly uses partial recovery rather than a total reset.

**Preserve principle / strong candidate:** controlled recovery is a useful middle ground between full reset and brutal permanent attrition.

---

# Quest Skunk Enemy Family

**Preserve target.** The computerized Skunk family is currently one of the strongest direct candidates for recreation/close analogues in KCQ.

The exact old numbers are disposable. The family-wide system and enemy behavior are the valuable part.

## Shared Skunk-bondage ecosystem

Skunk bondage is not merely a skin on generic restraints. It is a shared escalating system:

1. latex initially behaves like ordinary bondage;
2. stronger latex makes failed escapes increasingly dangerous because it can spread/grow;
3. at very high levels, normal escape stops being viable;
4. when a character is sufficiently covered in all relevant locations, she becomes **Fully Skunked**;
5. a Fully Skunked player converts into a hostile Skunkette version of herself;
6. allies can defeat that converted form to restore the character, still partially compromised.

This produces a complete family arc:

`nuisance → dangerous escape pressure → inescapability → conversion → temporary enemy → rescue`

**Strong preserve target:** individual capture should be able to change party state rather than merely mark the character “dead.”

## Latex Skunkette — control/setup enemy

Core identity:

`Pounce/control a victim → repeatedly Spray the pinned victim → party must decide whether/how to rescue`

Useful computerized refinements:

- AI prefers an active character who is not already pounced, spreading control pressure across the party rather than trivially dogpiling one person.
- Once attached, the Skunkette has a simple, legible procedure rather than arbitrary skill choice.
- Victim can spend actions trying to throw the Skunkette off.
- Allies can attack the Skunkette to weaken/break the hold.
- Latex Mist creates party-wide windows where escaping becomes more dangerous.
- Low-HP Victim Resistance naturally weakens the Skunkette as the controlled victim fights the suit.

**Preserve target:** very close conceptual recreation is desirable.

## Latex Skunk — battlefield-state enemy

Core identity:

`Create shared puddle hazard → apply latex / exploit deteriorating state → regenerate escaped progress → desperation explosion`

Especially successful details:

- puddles are a shared battlefield resource, not a permanent generic debuff;
- falling into puddles consumes some of the accumulated puddle state;
- AI becomes less likely to create more puddles as enough already exist;
- Regeneration becomes more likely when the party has made substantial progress removing latex;
- low-HP Explosion targets the already-most-compromised active character, attempting to convert a bad state into capture.

One Adventure-era behavior may be worth restoring: intentionally attacking legs to synergize with puddles. The computer version's ordinary Spray targeting is less purposeful than the older strategy note.

**Preserve target:** close analogue strongly desirable.

## Skunk Queen — boss / family amplifier

The Queen is a genuine boss rather than simply a stronger Skunk.

Core systems:

- **Skunk Collar:** targets a major threat and continually adds Skunk bondage until removed.
- **Latex Rain Maker:** spawns a persistent battlefield object that creates a temporary priority target.
- **HP-threshold reinforcements:** damage to the Queen changes encounter state; reinforcements become more severe as the fight advances.
- **periodic party pressure:** Perfume / general Skunk Gun behavior between larger mechanics.
- existing Skunk-family state makes all of these mechanics interact rather than live in isolation.

**Preserve target:** Queen should remain a family amplifier / escalation boss.

### Implementation cautions

- Some old behavior is random where a future visible-intent system could make it more tactically coherent.
- The Perfume healing path appears to contain an old indexing bug and should not be treated as intentional balance evidence.
- Adventure's strategy note for collar targeting used damage since the prior collar; the computer version appears to use cumulative encounter damage. Either can work, but the former lets threat naturally move between characters.

## Empress / Goddess

In the old computer game, Empress/Goddess mostly reuse the Queen chassis with large bonuses/empowered allies rather than becoming entirely new boss designs.

**Future opportunity:** if these narrative tiers return, give them genuinely new mechanics/phase identity rather than relying primarily on enormous stat inflation. Ascension levels can carry more of the “absurdly unfair” numerical challenge burden.

---

# Why the Skunks Work So Well

The user considers the Skunk encounters **very close to the desired difficulty target**: good strategy gives a real fighting chance, but victory does not feel automatic.

The likely systemic reason is not merely numerical tuning.

## Family-wide compounding pressure

Different Skunk enemies all feed the same ecosystem:

- puddles create environmental danger;
- leg bondage can make that danger worse;
- failed escapes can grow/spread latex;
- Skunks can regenerate escaped progress;
- Skunkettes physically remove/occupy characters and intensify their bondage;
- low-HP Skunks attempt to finish compromised targets;
- Queen mechanics add collars, persistent Rain Makers, and reinforcements;
- Fully Skunked conversion turns individual failure into an additional enemy/problem.

A fight can therefore accelerate from “fine” to “multiple interacting emergencies” without any one attack needing to be absurd.

**Key lesson:** the family has a strong answer to **“why should I become more frightened the longer this fight continues?”**

## Emergent cooperation

Skunk enemies cooperate even when the code does not explicitly coordinate every action. Any source of Skunk bondage advances the same family-wide threat state.

This makes mixed groups feel coherent rather than like unrelated enemies sharing a theme.

**Strong design target for future enemy families:** build a shared family pressure system, then let different enemy types attack that system from different angles.

---

# Quest Skunk Campaign

The internal code uses identifiers such as `normal_*`, `hard_*`, `extreme`, and `impossible`. **These are developer/internal labels, not player-facing difficulty-mode names.** Do not describe the original release as visibly offering “Normal / Hard / Extreme / Impossible” modes unless separate evidence supports that.

From the player's perspective, the Skunk material is an escalating story/campaign followed by optional brutal postgame content.

## Opening Skunk sequence

The original Adventure Skunk scenario is expanded into an actual story act:

- starts with two party members;
- rescuing a specific Skunkette introduces Erin and changes party composition;
- sequence escalates Skunkettes → mixed Skunks/Skunkettes → Queen;
- early victories provide partial bondage recovery rather than full resets.

**Historical lesson:** when the human GM/RP connective tissue disappeared, the computer game had to invent campaign structure around what was formerly almost just an encounter selector.

## Next forest/story sequence

The next internal section is a genuine sequel/escalation rather than simply the same encounters with larger numbers:

- persistent Slave Collar condition;
- opening ambush;
- larger/mixed enemy packs;
- substantial starting puddle state;
- enhanced Queen confrontation;
- story consequences from the prior act.

This is good difficulty escalation because **circumstances and mechanics change**, not merely enemy coefficients.

## Defeat is already partially fail-forward

Quest already experiments with the question “You lost; what now?”

### Individual defeat

Fully Skunked characters can become enemy Skunkettes and later be rescued in the same encounter.

### Opening-sequence full-party defeat

Narratively, capture is explained and the party eventually escapes/returns rather than being treated as dead. Mechanically, this still mostly restarts the sequence.

### Forest-sequence defeat

Losing unlocks an authored aftermath and a **choice**:

- retry without assistance; or
- accept special assistance/outfits that give persistent combat bonuses on the next attempt.

Defeat therefore changes a later attempt rather than simply showing a generic Game Over.

### Final-story boss defeat

The Goddess offers optional assistance. If accepted, repeated failures progressively alter the rematch:

- player Hit/Defense/Escape rise;
- starting collars weaken;
- Empress bonuses diminish;
- Skunkette Queen bonuses diminish.

The player may refuse this help and continue retrying the original challenge unchanged.

**Strong historical lesson:** Quest already separated “I want to clear/see the story” from “I want to beat this exact brutal version.” This is conceptually compatible with a future accessible baseline + optional high-end Ascension structure.

## Optional postgame challenge

After the actual story ending, the code contains intentionally cruel optional challenge content, including a group superboss and a Lia solo challenge, without the adaptive help of the story rematch.

**Preserve principle:** an optional postgame space can be unapologetically cruel because the main story is already complete.

## Future separation: campaign progression vs difficulty

A cleaner modern structure would distinguish:

- **campaign progression:** what story/encounters are currently being played;
- **Ascension:** how demanding those same encounters are.

Do not repeat the old internal terminology as if it were the visible difficulty UI.

---

# Quest Computer Castle

The computerized Castle material is best understood as a **combat-content workbench**, not an assembled campaign.

## Development intent / workflow

The absence of campaign shell was intentional at that stage: the plan was to create the enemy/combat content first, then build story/UI/apparatus after the enemy roster existed.

Development stalled before that second phase.

This matters because the empty campaign wrapper is **not evidence that Castle's scenario design was rejected**.

## What is visibly implemented

The file exposes a simple encounter selector for material such as:

- Noble/Tailor content;
- Royal Dressmaker;
- Princess (Noble-flavored test);
- Guards;
- Guard Captain.

Much of the surrounding story/location text is placeholder material. The valuable artifact is the combat implementation.

## Tailor

Core procedure:

`Measure victim → exploit measurement with Dress attacks → immobilize opportunistically with Anchor Needle → put sufficiently compromised victim on Dress Stand`

Useful mechanics:

- measurements are setup state consumed/exploited by Tailor/Dressmaker attacks;
- Anchor Needle creates a temporary escape/removal task;
- Dress Stand is a themed alternate capture state;
- if everyone is on Dress Stands, the party loses.

**Preserve candidate:** Tailor/Dressmaker family is strong direct resurrection material.

## Royal Dressmaker

Boss extension of the Tailor concept:

- stronger/persistent measurements;
- party-wide Binding Magic;
- Perfect Fitting phase at lower HP;
- Dress Stand capture payoff.

Core boss grammar:

`mark particular victim → exploit tailored weakness → global dress escalation → low-HP finishing phase`

**Preserve candidate:** strong direct combat ancestor.

## Guards

The collaborator's partial Guard route introduces two especially useful subsystems:

### Locks

Locks are separate restraint layers attached over leather restraints. The underlying restraint cannot be escaped below the current lock level until the locks themselves are dealt with.

This changes how escape works without replacing the core bondage system.

### Leashes

Guards can attach escalating leashes and later Yank them for strong temporary penalties/control. Impossible leashes can form a themed full-party loss state.

### Guard procedure

`Apply leather → leash compromised targets → Yank when useful → lock meaningful restraint progress → continue securing capture`

**Preserve candidate:** Guards have a clear procedural identity even if the old numbers change.

## Guard Captain

The Captain turns “secure the prisoners” into a boss plan:

- Perfect Binding attacks weak points / lowest leather areas instead of wasting progress on already-high locations;
- Lock Whirlwind adds party-wide lock pressure;
- leash/locking behavior reinforces the ordinary Guards.

**Preserve candidate:** strong direct ancestor.

## Princess

The computerized Princess has a substantial core chassis:

- Ribbon buildup;
- Ribbon Storm;
- battlefield Ribbon Web pressure;
- Cage as a themed capture payoff;
- route-specific mechanics, especially a functioning Noble-route Ribbon Dress module.

A partially implemented Seal Ribbons mechanic exists but is not fully integrated into the AI/route shell.

**Preserve principle:** one shared final boss can have a core identity plus route-specific mechanic modules.

## Four-route resurrection sources

For a future full Castle:

- use computerized Tailor/Dressmaker/Guard/Captain/Princess as primary combat ancestors where available;
- use Adventure and Quest PnP for the missing campaign/setup/route structure;
- develop missing Maid and other route combat families/mechanics as needed;
- use Lia's Adventure only as optional content inspiration.

---

# Why Castle Never Felt as Dangerous as Skunk

The user remembers Castle as difficult to tune: it never felt dangerous/menacing in the way Skunk did, and at the time it was unclear how to diagnose why.

A likely systemic diagnosis emerges from the code comparison.

## Castle enemies often spend turns on setup that delays immediate pressure

Examples:

- Tailor takes measurements before exploiting them;
- Guards spend actions locking existing restraint progress;
- enemies may need a separate action to place a sufficiently compromised player onto a Dress Stand/Cage.

These mechanics are flavorful, but if the party is ahead, setup turns can effectively give the player extra time to kill the enemy.

## Castle often preserves bad state rather than accelerating it

Skunks frequently behave like:

> “Your state is bad; therefore the family becomes increasingly capable of making it worse.”

Castle often behaves more like:

> “Your state is bad; therefore I make it harder to undo later.”

The latter creates attrition/control but not necessarily immediate menace.

## Castle families are more siloed

Skunkette, Skunk, Queen, puddles, conversion, regeneration, etc. all feed one shared Skunk-bondage ecosystem.

Castle subsystems are clever but less unified:

- Tailors care about measurements/dress;
- Guards care about leather/locks/leashes;
- Princess cares about ribbons/cages.

They share theme but do not always make one another more dangerous through a common family state.

**Key lesson:** Castle may have been suffering from a system-level enemy-family problem rather than merely bad numerical tuning.

Tweaking HP/Defense/effect values cannot fully fix a family that lacks an accelerating shared pressure engine.

**KCQ target:** ask of each enemy family both:

1. “What interesting thing does this enemy do?”
2. **“Why should the player become more frightened the longer this family remains in control of the fight?”**

---

# External Feedback / Reception Review

The recovered player comments are valuable, but they must be weighted by **when they occurred**.

## Separate 2016 development evidence from later reception

Quest development effectively stopped in 2016. Later DeviantArt comments from 2018–2025 show that the game had a long tail, repeat players, and continuing demand for more content, but they **did not participate in the original decision to stop development**.

Use two evidence buckets:

- **Contemporaneous development evidence (especially 2016):** explains what the project felt like while it was active.
- **Later reception evidence:** tells us what survived, what confused later players, and what had long-term appeal.

Do not retroactively imply that later praise should have caused a revival.

## Strong positive reception existed

Across the main release and “Skunk Attacks!” threads, players repeatedly called the game fun, awesome, brilliant, or superb; asked for more scenarios; asked about spiders/Ribbon Princess/other Adventure scenarios; and sometimes kept returning to the game for years.

Multiple players also asked for an editable/downloadable engine or toolkit for making their own scenarios.

**Historical lesson:** Quest's core idea did have an audience. The project did not die because nobody wanted the concept.

## But the feedback reaching the developer felt much more negative

The developer's own later recollection remained that “no one really liked the game other than me,” even though the archive now shows enthusiastic fans.

This is not a contradiction to resolve by saying the recollection was wrong.

The actionable feedback visible during development was disproportionately:

- “this is impossible”;
- “I don't understand the game”;
- UI complaints;
- requests for help;
- insufficient sustained Castle playtesting.

Some of the people who liked the design most either commented much later, said little, or discussed their own derivative projects elsewhere.

**Historical lesson:** objective audience interest and the developer's experienced feedback environment can be very different. Motivation depends on the latter.

---

# What Player Feedback Says About Skunk

## Strategic depth was real

Players independently discovered or were taught strategies that match the intended Skunk design:

- focus fire rather than spreading damage;
- reduce incoming enemy actions by killing weak enemies first;
- keep bondage low before it snowballs;
- use assisted escape because it is significantly stronger than self-escape;
- damage Pouncing Skunkettes to break/lessen the hold;
- kill Rain Makers immediately;
- do not leave Queen collars active;
- control Queen damage pacing so multiple HP-threshold reinforcements/Rain Makers do not stack at once;
- save emergency/“unleash” style tools for a rescue or finishing window.

A knowledgeable player even independently recommended stabilizing/buffing before damaging the Queen and respecting her threshold mechanics.

**External validation:** the Queen's phase/threshold design successfully created a real strategy of **damage pacing**, not merely DPS racing.

## “Mostly about avoiding a snowball”

The 2023 replay/strategy notes state the core design explicitly:

> Quest is mostly about avoiding a snowball.

The feedback/code support that reading:

- bondage worsens capabilities;
- worsened Defense increases incoming hits;
- higher bindings are much harder to escape;
- family mechanics regenerate/spread/compound progress;
- losing one party member increases incoming pressure on the survivors.

**Preserve target:** Skunk remains the benchmark for the desired feeling of escalating danger that good play can stabilize without making victory automatic.

## The major accessibility failure was opacity, not lack of a manual

The developer did create a tutorial/manual in response to confusion.

The problem was that many players either did not read it, did not retain it, or still could not see critical tactical information **at the moment of decision**.

Examples from comments:

- players thought most of Reika's actions simply did not work;
- one player went from “zero balance / cannot win” to repeatedly beating the game after discovering that specific bindings could be selected for removal;
- players did not know attacking a Skunkette could reduce Pounce;
- players asked what the stats and dice meant;
- players asked for walkthroughs;
- players did not always understand quickstart/resume behavior.

**Historical lesson:** documentation cannot substitute for an interface that exposes important affordances in context.

**KCQ requirement direction:** critical tactical rules should be visible where they matter:
- why an action is disabled;
- what assisting changes;
- what breaking Pounce requires;
- what enemy mechanic is generating a recurring effect;
- which threshold/state transition is approaching.

## Combat causality was hard to follow

A detailed 2016 comment notes that many enemy/status events happened effectively at once. The player often saw the resulting numbers, then had to read the log backward to answer “What was that?”

The contemporaneous 2016 playtest discussion made similar UI complaints:
- Rolls occupied prime screen space;
- allies/enemies were hard to parse quickly;
- repeated action→target clicking was cumbersome;
- status/binding changes needed longer highlighting;
- accidentally dismissible story windows were dangerous;
- important information was split across too many panels.

**KCQ requirement direction:** present important combat events as readable cause→effect sequences, updating/highlighting the affected state as the event resolves. A forensic log can exist, but should not be the primary way to understand the last enemy turn.

## RNG swing was a genuine issue

The old game combines:
- a high-variance d20-style resolution;
- many **binary outcomes** where a roll gives full effect or zero;
- a snowball system where a failed escape/action allows enemies to keep advancing.

The developer explicitly acknowledged that sometimes a run simply lost to a long string of bad rolls, while another run melted enemies through repeated crits.

Players independently reported:
- six or seven failed Pounce escapes in succession;
- Queen crit streaks;
- runs that felt completely hopeless despite apparently reasonable play.

**Key diagnosis:** the problem is not only “d20 is random.” It is **high variance × binary outcomes × compounding pressure**.

**KCQ candidate:** preserve uncertainty while allowing more graded outcomes/progress, so a mediocre roll often means reduced effectiveness rather than “nothing happened.”

## Mastery should matter; hidden affordances should not

Player knowledge dramatically changed effective difficulty. This is partly desirable.

Good mastery:
> “I understand why focus fire, threshold pacing, or assisting is better here.”

Bad opacity:
> “I did not know the interface allowed me to choose which binding to remove.”

**Design target:** losses should teach strategy, not merely reveal undocumented controls.

## Loss itself had entertainment value

One player who had not cleared the Queen described the defeats as “many, varied, and interesting.” Another explicitly wanted a Skunk-transformation loss ending.

This supports the emerging “You lost. What now?” direction from the original audience itself.

**Historical lesson:** defeat/capture content is part of the product, not just a punishment for failing to reach the product.

Do not use that as an excuse for unfair encounters; use it as a reason to make losses interesting.

## End-of-fight cleanup was optimal-but-boring

Players discovered that when an encounter was effectively won, optimal play could be to leave one enemy alive while:
- removing bindings;
- spending Valkyrie escape tools;
- building class resources;
- otherwise preparing for the next fight.

This is externally confirmed, not merely theoretical.

**Probably avoid:** gameplay where the strategically correct action is to refuse to finish an already-decided fight and farm cleanup.

**Preserve the useful part:** controlled state persistence/partial recovery between fights.

**KCQ direction:** once the tactical contest is functionally over, end the fight and let explicit recovery/carryover rules determine the next state.

## Party asymmetry was noticeable

Players noticed that Lia was unusually difficult to capture while Reika was comparatively vulnerable and tried to interpret that mechanically/narratively.

**Historical lesson:** a small fixed party with substantially different defensive/offensive/recovery profiles can create recognizable character identity even in a text-heavy presentation.

---

# Chat-Era Social Design Problem

Later Discord discussion about the old chat games confirms the social incentive mismatch that drove the lineage.

A substantial portion of the fetish-RP audience wanted personalized fetish writing more than tactical play. Even when players claimed they would take the game seriously, groups could drift toward deliberately running into the fetish/capture content as quickly as possible.

This creates a fundamental conflict:

> the nominal game objective is to avoid capture;
> the experiential reason many players joined is to experience capture.

## Arena

In PvP, this could directly invert competition: one side might intentionally play badly because losing faster produced the desired submissive outcome.

## Adventure

PvE removed the requirement that one player dominate another, but not the deeper mismatch. Players could still cooperate with the enemies, and freeform RP meant that a single action could be a one-line dice declaration or a huge personalized paragraph.

For many participants, the RP was the product and the combat mechanics were scaffolding.

## Quest PnP / Quest

Quest's increasingly self-contained actions and eventual computerization remove much of the human social/tempo problem, but the **mechanical form of the same design problem remains**:

> how do you make avoiding bondage strategically meaningful when bondage is also content the player came to experience?

This is a central lineage-wide problem, not an incidental balance issue.

---

# Persistent Combat Philosophy Recovered from Later Discussions

Several later discussions about unrelated bondage games show which BQuest principles the developer still considered successful years later.

## Bondage should matter before defeat

If bondage can only occur at very low HP or functions only as a “kill animation,” then it is mechanically just another death state.

**Preserve principle:** restraint should affect ordinary combat while the outcome is still undecided.

## Loss should have a visible runway

A later description of BQuest emphasized:

> no one gets blindsided by a loss; you can usually see it coming from far away as things slip out of control.

This is a strong preservation criterion.

Avoid:
- binary “enemy used Subdue; you suddenly lost” states;
- loss conditions that fire while characters still feel mechanically capable;
- purely cosmetic bondage that matters only when HP reaches zero.

Prefer:
- progressive restriction;
- visible thresholds;
- declining but still meaningful action space;
- a long enough warning horizon for rescue/stabilization decisions.

## Progressive capability loss is better than generic incapacitation

BQuest's staged statuses worked because bindings could disable or penalize **specific kinds of actions** rather than immediately removing the entire character.

Possible future extension:
- skills can have differing restraint tolerances rather than one broad on/off status;
- heavy restraint changes which actions remain practical rather than simply “skip turn.”

This is an idea, not a committed system.

## Rescue needs opportunity cost

A later discussion identifies a weakness of original Quest: helping another party member is almost always correct unless the party can end the fight immediately.

The party format creates the potential for rich rescue decisions, but the decision is only interesting if the answer can change.

**KCQ target:** make “Do I rescue her now?” compete meaningfully with:
- killing a priority enemy;
- healing/buffing someone else;
- controlling a boss phase;
- spending a limited resource;
- risking contamination/reaction;
- accepting short-term bondage for a larger tactical gain.

## Some restraint could be tactically useful

A later brainstorm suggested making moderate restraint provide resources/benefits while excessive restraint approaches capture.

Possible examples:
- build a resource while bound;
- certain characters recover MP or gain offensive potential from danger;
- rotate which party member is allowed to become the “damsel” rather than always keeping everyone perfectly clean.

**Interesting candidate, not a decision.**

Caution: avoid turning this into a solved equilibrium such as “always stay at exactly bondage 5.”

---

# 2016 Contemporary Playtest / UI Evidence

One recovered Discord thread begins with an explicit request for playthroughs/comments on:
- the tutorial;
- Skunk (basically done);
- Castle (alpha/testing).

There was one substantial burst of feedback on the first day and no sustained testing conversation afterward.

This is strong primary evidence for the Castle testing problem.

## What feedback actually arrived

The detailed feedback focused overwhelmingly on UI rather than repeated Castle balance iteration.

Critiques included:
- Rolls panel consuming too much central space;
- weak visual separation between allies/enemies;
- excessive cursor travel/repeated targeting clicks;
- story popups that could be dismissed accidentally;
- binding/status changes not highlighted long enough;
- fragmented Status/Binding presentation;
- a suggested three-column layout.

The developer agreed with some problems but immediately ran into layout constraints.

## Legacy-engine architecture was already fighting Quest

A key explanation from the time:

> Quest was a modified version of the earlier **You Did It** engine, with a hard structural break between the top and bottom halves of the screen.

The UI was therefore not designed fresh around Quest's combat-information needs.

Suggested rearrangements often produced several screens of scrolling, while the developer strongly wanted to minimize scrolling.

**Historical lesson:** by 2016, meaningful UI improvement increasingly implied architectural work, not cosmetic CSS changes.

## Detailed combat prose was intentional content

When simplification was suggested, the developer resisted removing the descriptive action text because:

> “it's the only ‘content’ this game has.”

This is important. Text verbosity was not merely accidental clutter; without art/animation, the descriptions were the experiential presentation.

**KCQ UI problem:** separate **mechanical readability** from **descriptive content** instead of solving density by simply deleting the prose.

## The playtest request did not become a testing process

The conversation rapidly moved from BQuest critique into unrelated discussion and another participant asking for the old engine to make their own text adventure.

This illustrates the actual problem: the developer could get occasional reactions, but not a reliable cycle of:
`play Castle → report encounter behavior → tune → retest`.

---

# Quest Development Postmortem — 2016

Quest did not stall because Castle was rejected as a bad scenario.

Several pressures compounded.

## UI/CSS implementation friction

New mechanics generated presentation work that was much less enjoyable than designing enemies.

## Mobile requests raised the scope

Players were already asking for mobile/tablet use. The fixed desktop layout was not designed responsively, and supporting mobile increasingly looked like a substantial UI redesign.

## Legacy architecture limited reactive presentation

The inherited You Did It structure and hardcoded DOM/UI assumptions made it difficult to:
- reorganize information;
- show new kinds of state elegantly;
- communicate changing state reactively;
- support substantially different screen layouts.

## Weak sustained playtesting

There were players, but not a reliable Castle testing group. The developer's explicit request for playthroughs generated a short burst of feedback rather than sustained iteration.

## Castle balance felt wrong and was hard to diagnose

Skunk felt threatening and strategically manageable.

Castle often did not feel dangerous, but it was unclear whether the problem was:
- numbers;
- AI;
- enemy mechanics;
- family-level pressure;
- UI opacity;
- RNG;
- or some combination.

## Reception did not reward the effort enough

Contemporaneous criticism and confusion were more salient than the enthusiasm that is easier to see retrospectively in ten years of archived comments.

## Combined 2016 failure mode

**UI/CSS friction + looming mobile redesign + legacy-engine limits + weak iterative playtesting + unresolved Castle balance + discouraging feedback environment → frustration → loss of momentum.**

This is the main explanation for the original stop.

---

# 2020 Castle Recollection

A 2020 Discord mention briefly considers finishing the half-made second Quest/Castle.

This is **not evidence of an active revival**; it is a short-lived “maybe I should finally finish this” thought four years after development had already stopped.

The important recovered design information is the remembered computer-Castle plan:

## Three paths

- **Maid**
- **Noble**
- **Guards**

Each route would give the Princess a different gimmick.

## Bonus combination fights

After learning individual route gimmicks, bonus content could combine routes and culminate in a **Super Princess with all three gimmicks**.

**Strong design idea:** harder/postgame content can be produced by composing mechanics the player has already learned rather than relying primarily on massive stat inflation.

---

# 2023 Attempted Castle Revival

The 2023 thread is the richest post-release primary source because the developer actually replayed the old game, wrote a strategy guide, diagnosed Castle enemy behavior, proposed redesigns, and then investigated the old engine.

This is a **second historical event**, not a continuation of 2016 development.

## Why the project was reopened

The intent was deliberately small:

> finish something / break an “I can't get anything done” mental block, then return to Lia's game.

The goal was **not** “rewrite BQuest from scratch.”

That scope matters when judging why the revival stopped.

---

# 2023 Skunk Strategy Notes

The 2023 guide confirms the intended practical strategy.

## Core rule: prevent the snowball

The guide explicitly says to keep bondage minimal because:
- stats remain stronger;
- low-level bindings are much easier to escape than high-level bindings;
- once Defense falls, incoming bindings can outpace recovery.

It even notes that “only attack when nobody has bindings” is not a terrible default strategy.

## Assistance is dominant

Helping another character gives a large bonus, so immediate double-struggling/assisting after a hit is often optimal.

This validates the rescue system but also exposes a possible dominant defensive pattern.

**KCQ opportunity:** retain the pressure-management benchmark while creating more situations where tolerating some bondage or taking an offensive action is rational.

## Enemy-specific priorities

- **Skunkette:** Pounce is dangerous, but any damage can reduce/break it; multi-hit attacks are valuable.
- **Skunk:** often less immediately dangerous than Skunkette, but puddles and low-HP Explosion punish neglect; burst through low HP to avoid Explosion windows.
- **Queen:** stability first. Cross one threshold, handle the spawned problem, restabilize, then continue.
- **Rain Maker:** immediate priority target.
- **Round 2:** same language, worse starting state/ambush/puddles.
- **Round 3:** deliberately oppressive first attempt, then diminishing enemy buffs.
- **Round 4:** bonus challenge intended to be practically unwinnable.

The strategy guide is strong primary evidence that the Skunk family works because its pressure can be **managed intelligently**, not because the player is expected to race the enemy.

---

# 2023 Castle Diagnosis

The revival notes are blunt enough that we no longer need to infer what felt wrong.

## Tailor

“Probably OK” as a minion.

## Royal Dressmaker

“Probably OK” as a miniboss, but possibly insufficiently threatening.

## Guards

Interesting in theory but in practice **barely did anything**. Basic attacks could defeat the entire group while the party accumulated little meaningful bondage.

## Guard Captain

Also interesting in theory but not scary. The developer beat the group without ever escaping and never came close to defeat.

Possible contemporary fix considered:
- let Guards make a basic attack **and** a special action when the special is available, rather than spending pressure turns on setup.

## Princess

The central problem:

> the player can spam basic attacks with essentially zero strategy and ignore everything she does.

This is the clearest contemporary diagnosis of Castle's failure.

**Skunk asks the player to respect enemy state. Castle often lets the player ignore enemy state and race HP.**

## Leash loss condition felt fictionally/mechanically wrong

A party could lose because all three characters had level-8 neck leashes while otherwise remaining mobile and dangerous.

By contrast, Skunk capture required severe bindings across the body, so characters felt thoroughly compromised before defeat.

**Preserve principle:** defeat-state fiction and mechanical capability should agree. Do not fire a “captured” loss condition while the party still feels mostly combat-capable.

---

# 2023 Proposed Princess Redesign

The revival had already begun moving Princess toward the family/system-level structure we later diagnosed as missing.

## Ribbon Dress becomes core Princess kit

Instead of being Noble-only, Ribbon Dress would become part of the shared Princess chassis.

## Soul of the Noble

Proposed replacement gimmick:

> player attacks generate Ribbon adds based on incoming damage.

Small hits create weaker ribbon entities; heavy hits create stronger ones.

This directly attacks the “burst the boss before she does anything” strategy:

`more offense → more enemy-board pressure`

**Strong salvage candidate:** route gimmicks should alter how the player interacts with the boss's core loop, not merely add an occasional special move.

## Soul of the Guard

Instead of spending a turn on a separate Seal Ribbons attack, a proposed direction was for Princess Ribbon damage to arrive **already sealed**, effectively making restraints require multiple layers of escape.

This would integrate the route mechanic into the entire core kit rather than letting the boss waste turns setting up.

## Soul of the Maid

Still needed to be designed/adapted from wiki material.

---

# Recovered 2023 Computer-Castle Campaign Plan

The intended flow was explicitly written down.

## Any-order route phase

### Guard route — “bust in the front”
`Guards → Guard Captain → Princess (Guard)`

### Noble route — infiltrate as nobles
`Tailor → Royal Dressmaker → Princess (Noble)`

### Maid route — infiltrate as maids
`Maid → Maid Chief → Princess (Maid)`

Players could complete the three routes in any order.

## Final route

Unknown whether a new miniboss would precede the finale.

Final boss:
> **Princess with all three route powers.**

### Recovered first-attempt idea

After each earlier Princess victory, save the party's remaining bondage.

On the **first** final-Princess encounter, restore those old bindings—potentially causing an immediate catastrophic state.

Then:
- later attempt starts on even footing;
- boss may still be intentionally overwhelming;
- subsequent losses could unlock/scaling assistance similar to Skunk's final story boss.

This is a distinctive lost idea and should be preserved for later evaluation, not automatically implemented.

## Bonus route

A Goddess/Super Princess style encounter intentionally tuned as a near-unwinnable fetish challenge for players who want that experience.

---

# 2023 Technical Postmortem

The attempted revival quickly revealed that the old architecture made even apparently small mechanics expensive.

## The Locks example

Semantically, a Lock belongs **on a particular restraint**.

The old engine/UI represented each binding as a standalone DOM item. To display Locks sensibly, the revival ran into requirements such as:
- move the Lock entry next to its parent restraint;
- hide the Lock's ordinary meter;
- draw lock icons on the parent meter;
- maintain display ordering;
- work around `addItem()` deleting/recreating entries at the bottom;
- distinguish “item exists, set it” from “item absent, add it” throughout old code.

A collaborator eventually hacked in sorting based on binding-definition order.

**Major architecture lesson:**

> **Model game-state semantics first; let the presentation decide how to render them.**

If a Lock is an attribute/layer of a restraint, the game model should say so. It should not masquerade as an unrelated binding merely because that is the only widget the UI knows how to display.

## Hardcoded content made new mechanics costly

The revival notes repeatedly complain that:
- everything was highly hardcoded;
- different attacks/items checked existence in different ways;
- basic set/add/update operations were inconsistent;
- collaborator additions from 2017 were implemented in ways that made extension awkward.

A small cleanup was possible, but many desired improvements pushed toward engine redesign.

## Reaction hook idea

A collaborator implemented a Latex Orb reaction that could respond to a player spell with Latex Spray and interrupt it.

The proposed proper engine abstraction was:
- give enemies a reaction hook;
- call it during the relevant player action;
- return whether the player action is interrupted.

**Interesting candidate:** visible/telegraphed reactions can make enemies active during the player's turn without relying on opaque random counterattacks.

Example:
`Latex Orb — Reaction: spell detected → spray caster; sufficient effect interrupts.`

---

# The Binary Resolution Problem

The 2023 revival explicitly identifies dissatisfaction with the old resolution model:

> “you either get 14 damage or you get 0”  
> “you either escape or you get nothing”  
> “everything is binary hit or miss”

This helps explain why balance could feel simultaneously trivial and impossible.

If every player attack hits:
> enemy pressure evaporates.

If several actions miss:
> enemy snowball advances while the party makes zero progress.

## Contemporary redesign ideas

One idea:
- missing the accuracy target reduces **effect** instead of automatically producing zero;
- e.g. miss the target number by 5 → substantial penalty / several effect tiers lower;
- optionally retain true failure only at very low results.

A collaborator suggested a flat base + smaller die + modifiers so even bad turns often accomplish something.

**Open design direction:** use graded outcomes/progress rather than making every action full-success/zero-success.

Caution:
- complete failures can still be exciting in moderation;
- do not make outcomes so deterministic that tension disappears;
- tuning graded systems can also be difficult.

## “Waiting for the dice” is not a decision

A collaborator summarizes another failure mode: once heavily restrained, the player can reach a point where the only plausible action is Escape, so gameplay becomes repeatedly clicking the same action until RNG permits progress.

**Probably avoid:** states where the player's remaining “choice” is merely waiting for a successful roll.

---

# 2023 Tester Disagreement Reinforces the Balance Problem

One tester reported that Princess's Ribbon Bow pressure made the fight effectively unwinnable: escape progress could not keep up with incoming bindings.

The developer, playing the same fight, reported usually killing the Princess without struggling at all.

Possible causes include:
- strategy/knowledge gap (especially the +4 assisted escape);
- failure to recognize and remove the source of recurring Ribbon pressure;
- RNG;
- genuine encounter variance.

**Historical lesson:** Castle's balancing problem was real partly because the same encounter could produce wildly different subjective difficulty, making raw number tuning hard to diagnose.

This further supports:
- clearer source/cause presentation;
- less binary resolution;
- visible enemy intent/mechanics;
- better diagnostics/testing tools.

---

# Why the 2023 Revival Stopped

The revival did **not** end because the developer concluded BQuest was bad.

The scope expanded:

`clean up Castle → fix UI ordering → rethink state model → maybe redesign UI → maybe use Vue → maybe change core hit/escape resolution → maybe rewrite engine`

But the project had been reopened specifically as a **small** task to regain momentum before returning to Lia's game.

The developer explicitly recognized that if the job became “redesign the entire game from scratch,” it defeated the purpose of reopening it.

The decision was therefore to push ahead with the existing version where possible and avoid spending weeks on a rewrite.

There was some useful collaborative work:
- display sorting;
- cleaner item-state helpers;
- reaction experiments;
- GitHub repository creation.

Then momentum was lost to unrelated interests/work, rather than one single new technical blocker.

**Historical lesson:** 2016 and 2023 are different failures:
- **2016:** active project collapses under UI/testing/balance/frustration.
- **2023:** scoped revival reveals that the desired fixes imply a rewrite larger than the revival's purpose; limited patching occurs, then momentum dissipates.

---

# Scope / Vertical-Slice Lesson

In later discussion of another unfinished game, the developer repeatedly criticizes throwing away half-finished games to rebuild them and says:

> do not make 12 characters until 2–3 work.

That is directly relevant project-management advice for KCQ.

**Strong development principle:** do not begin by designing the ultimate engine, huge roster, three full campaigns, creator toolkit, and every route.

A sensible future vertical slice is deliberately small:

> **small party + Skunkette + Latex Skunk + Skunk Queen + one short campaign loop**

The goal would be to prove that the new system:
- preserves Skunk's strategic snowball pressure;
- communicates cause/effect clearly;
- supports responsive/mobile presentation;
- avoids boring cleanup exploits;
- reduces binary/RNG helplessness;
- makes rescue decisions interesting.

Only then multiply content.

---

# Updated Preservation / Interest Hierarchy After Feedback + 2023 Archaeology

## Highest preservation interest

1. **Classic enemy families and their capture procedures**, especially the Skunks.
2. **Shared enemy-family pressure ecosystems.**
3. **Visible deterioration / long runway to capture.**
4. **Bondage as active combat state and the player defeat system, not a low-HP kill animation.**
5. **Castle resurrection**, informed by Adventure/PnP structure and the computer game's three-path / route-modular Princess ideas.
6. **Defeat aftermath / fail-forward capture content.**
7. **Approachable baseline + optional Ascension/postgame cruelty.**
8. **First-class support for scenario-defined persistent state between encounters, without requiring end-of-fight farming.**
9. **Small, strongly asymmetric fixed-party combat identities.**
10. **Scenario setup events and bespoke pre-combat/set-piece events.**

## Preserve principles, not exact old implementations

- visible/predictable enemy intents;
- readable cause→effect combat presentation;
- route-sensitive boss modules;
- individual capture that changes the fight rather than simply deleting a character;
- shared family mechanics that create emergent cooperation;
- boss thresholds that add tactical state;
- authored campaign progression separated from difficulty;
- rescue actions with real opportunity cost;
- state semantics independent from UI representation;
- data-driven/extensible content definitions where practical;
- first-class combat sandbox/test tools;
- responsive/mobile-friendly presentation from the beginning;
- descriptive text as content, while mechanical state remains concise and legible;
- graded resolution worth exploring instead of universal full-hit/zero-hit outcomes.

## Interesting but uncommitted ideas

- moderate bondage generates resources/benefits while excessive bondage approaches capture;
- individual skills have different restraint tolerances;
- enemy reaction hooks;
- final Castle boss restores consequences from earlier route victories;
- Super Princess combines all learned route mechanics;
- community/custom scenarios later if the core architecture naturally supports them.

## Low preservation interest / probably avoid

- the old generic eight-class roster as an obligation;
- exact Quest player-class implementations;
- exact d20/HP/Defense/effect values;
- the old fixed desktop layout;
- architecture where game-state objects exist primarily because of how HTML happens to display them;
- hiding key tactical affordances in a manual;
- instant bulk enemy resolution that requires log archaeology;
- repeated “click Escape until RNG permits play again” states;
- optimal end-of-fight stalling/resource farming;
- giant stat inflation as the main source of challenge;
- a community toolkit before the core game itself works;
- rewriting/rebuilding for its own sake before a small vertical slice is proven.

---

# Current Open Questions After v5 Combat Pass

The following remain deliberately unresolved. Many are best answered by a small prototype rather than more abstract discussion.

- **Exact resolution-bar numbers/formulas.** What baseline Miss/Graze/Hit/Crit distributions feel good, how exact position within each band scales numeric effects, and how Defense/restraints/statuses reshape the bar.
- **Deterministic comparison prototype.** The stochastic bar is currently the favored/elegant direction, but the earlier idea of testing a fully deterministic version against the same encounter remains useful if implementation cost is low enough.
- **Exact Defense representation.** Underlying scale/formula and whether the dashboard should show a bar, percentage, raw number, compact symbols, or something else.
- **Exact bondage thresholds.** Fine internal range, band widths, and per-binding consequences need real content to tune them.
- **General escape profile.** The Skunk redistribution concept is promising, but ordinary/non-Skunk escape mechanics still need concrete moves and numbers.
- **Playable character kits.** Which characters belong in the first prototype, what their fixed authored toolboxes contain, which resources/capabilities matter to each, and whether any pre-fight loadout choice is useful at all.
- **First enemy vertical slice.** Skunkette / Latex Skunk / Queen remains the obvious historical candidate, but the exact smallest useful slice should be chosen before implementation sprawls.
- **Intent UI details.** How action name, target, tooltip, resolution preview, execution order, pending statuses, and intent manipulation are staged visually without clutter.
- **Dashboard layout.** The information requirements are now known, but the actual responsive/mobile presentation is not.
- **Cross-enemy intent coordination implementation.** Conceptually allowed; concrete API/data flow deliberately postponed.
- **Ascension behavior.** Smarter/focus-fire targeting is a promising difficulty lever, but exact difficulty layers remain content work.
- **Castle family mechanics.** Guard/Noble/Maid shared pressure ecosystems and the eventual Castle route count remain open.
- **Moderate bondage as a tactical resource.** Still an optional idea rather than a requirement; do not add it unless concrete kits/enemies benefit.
- **Aftermath/fail-forward content.** Supported and historically interesting, but entirely scenario-authored rather than a universal combat rule.
- **Final title.** `KCQ` remains a working name.

---

# Immediate Next Design Step

The abstract combat contract is now developed far enough that further progress should increasingly come from **concrete content** rather than additional universal rules. The next productive discussion is likely the structure of the first playable character kits and/or a deliberately tiny Skunk-family encounter used to test:

- the shared player/enemy phase loop;
- intent readability and manipulation;
- Motion/Verbal capability loss and recovery;
- Stand Still;
- bondage-bar previews and band crossings;
- the Miss/Graze/Hit/Crit resolution bar;
- scenario-state persistence only where the test scenario actually needs it.

The scope lesson from the older projects still applies: prove a few characters and a few enemies before designing a large roster or campaign shell.
