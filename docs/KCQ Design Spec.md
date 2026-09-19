# KCQ Design Spec — v2

**Status:** Working specification  
**Scope:** Concrete decisions for KCQ only. Historical research, archaeology, old-game analysis, and rationale belong in the separate *BQuest 2 Design Notes* document.

---

## 1. Core Combat Model

- Players primarily defeat enemies through **HP damage**.
- Enemies primarily threaten players through **bondage and other scenario-defined effects**.
- Player and enemy mechanics are intentionally asymmetric even when they share common resolution machinery.
- The combat engine should provide flexible primitives rather than impose unnecessary genre rules.

### Scenario authority

A scenario defines its own:

- victory conditions;
- defeat conditions;
- capture conditions and the meaning of `Captured`;
- bondage tracks;
- between-fight recovery;
- state persistence;
- encounter-specific exceptions and special rules.

There is **no universal victory or defeat condition** imposed by the core system.

In most ordinary battles, victory will likely be “reduce the required enemies to 0 HP,” but this is a scenario convention rather than a core requirement.

`Captured` is a scenario-defined state. It does **not** universally imply incapacitation, removal from combat, inability to act, or defeat.

---

## 2. Round Structure

The default round flow is:

1. **Start of player phase**
   - Tick and expire active timed effects.
   - Activate pending effects that begin this round.
2. **Generate enemy intents**
   - Each enemy selects its move and target from the current game state.
   - Any ordinary random resolution value used by that intent is rolled now.
   - The resulting **base roll is committed** to the intent.
3. **Reveal enemy intents**
   - Show the selected move, target, and current predicted resolution/effect.
   - The player may inspect the committed base roll and the modifiers producing the current result.
4. **Player phase**
   - Party members act in any order.
   - Player actions may change modifiers, Defense, targets, intents, or even the committed rolls when an ability explicitly manipulates randomness.
   - Intent previews update immediately as the state changes.
5. **Enemy phase**
   - Enemies execute their revealed intents from top to bottom in displayed enemy order.
   - They use the committed base roll with the game state/modifiers that apply at execution time.
6. Begin the next round.

Enemy intent generation occurs **after** start-of-round effects have ticked, expired, or activated. Randomness therefore creates the tactical problem **before** the player commits actions to solving it.

---

## 3. Player Action Economy

- Each character normally has **one primary action per round**.
- Attacking, escaping, assisting another character, and class abilities normally compete for that action.
- Party members may act in any order during the player phase.
- Additional resources, cooldowns, charges, ammunition, mana, swords, Ribbon Power, or similar systems are **character-specific**, not universal.

### Stand Still

`Stand Still` is a baseline tactical option.

- It is free to toggle any time you have not acted.
- It grants **two Escape/Assist actions**.
- The bonus action may not be granted if certain bindings are present.
- Those two actions may be any combination of self-escape and helping others.
- They may affect different bindings or different characters.
- Until the next player phase, the character is easier for hostile effects to hit cleanly.
- The character counts as **stationary** for environmental rules.

It is acceptable for Stand Still to have little or no practical downside during a round in which no visible enemy intent or environmental rule punishes remaining stationary. Identifying such safe windows is part of tactical play.

---

## 4. Enemy Intents

Enemy actions are announced through visible intents. Enemy randomness is normally resolved **when the intent is generated**, before the player phase.

An intent normally shows:

- the **move/action name**;
- the **target**;
- its current **Miss / Graze / Hit / Crit** result when applicable;
- its current predicted numerical or discrete effect when that information is tactically useful;
- a tooltip or expanded description explaining what the move does and how the current result was produced.

A weak or missed enemy intent is legitimate information. If an enemy has currently rolled a Miss, the player may choose to ignore it. If later player actions make the target easier to hit, the same committed roll may become a Graze or Hit and the preview updates accordingly.

### Committed base rolls

For ordinary rolled enemy moves, the intent stores a **base roll** generated during intent creation.

- The base roll is normally immutable for the rest of the round.
- Relevant modifiers are **not baked permanently into that number**. They are derived from current game state.
- The current total, outcome band, and effect are recalculated when relevant state changes.
- A tooltip should be able to expose the calculation, for example:

```text
Base roll:             17
Power of the Goddess:  +4
Enemy Effect:          +2
                       --
Current total:         23
Outcome:               Crit
```

The exact arithmetic and modifier categories remain open, but the distinction between **committed random base value** and **live derived modifiers** is intentional.

### Intent rules

- Once revealed, an intent's move, target, and committed base roll are normally **locked**.
- Enemies do not silently choose a new target because circumstances changed.
- If the target becomes invalid, the intent normally **fails/fizzles**.
- If the enemy becomes unable to perform the declared move, the intent normally **fails/fizzles**.
- A move may explicitly define a fallback or exception.
- Player abilities may explicitly **redirect, cancel, alter, or otherwise manipulate** intents.
- Player abilities may explicitly manipulate committed randomness, including effects such as **rerolling, modifying, replacing, swapping, or otherwise transforming base rolls**.
- Taunts and similar effects may deliberately pull compatible enemy targeting onto a chosen character.
- Precommitted reactions are preferred over interrupt/confirmation prompts.

### Enemy order

Enemy execution order is **scenario-defined**.

- Encounters may deliberately use a specific order when sequencing matters.
- A scenario may use a randomized initial order when desired.
- Once established, the order will normally remain fixed for the encounter unless a mechanic explicitly changes it.

---

## 5. Enemy Move Selection

Conceptually, every enemy has logic equivalent to:

```text
chooseMove(gameState) -> selected move / intent
```

What happens inside that selection logic is completely arbitrary and enemy-specific.

An enemy may use:

- deterministic scripting;
- conditional priorities;
- weighted randomness;
- HP or phase thresholds;
- target-state checks;
- encounter-state checks;
- difficulty/Ascension-specific behavior;
- coordination with other enemies;
- awareness of already-selected intents;
- any other scenario-specific logic.

The engine does not prescribe a universal AI style.

Cross-enemy communication and the implementation mechanism for coordinated intent selection are implementation details, but the design must permit such coordination.

### Randomness as interactable state

The engine must support player abilities that manipulate the committed random values attached to enemy intents. Possible authored effects include rerolling a base roll, forcing a worse/better reroll rule, adding or subtracting from it, swapping rolls between intents, or transforming a roll in another defined way.

This capability is expected to be especially relevant to **Sakari's chaos-themed kit**, although her exact abilities remain open.

---

## 6. Moves

A move is an authored package of whatever properties it needs.

Possible properties include:

- name;
- target rules;
- capability requirements;
- resource costs;
- base resolution profile;
- allowed modifiers;
- effects/outcomes;
- status application;
- timing;
- persistence;
- special rules.

These properties are **optional where appropriate**. A move should not require meaningless boilerplate simply because the engine supports a property.

### Targeting

Each move defines its own valid targets.

Targets may include, as appropriate:

- self;
- allies;
- enemies;
- binding tracks;
- enemy intents;
- battlefield objects;
- multiple entities;
- scenario-specific targets.

The UI must make valid and invalid targets clear before commitment.

---

## 7. Resolution Bar

Player and enemy moves use the same core resolution machinery.

A move has an outcome profile built from some combination of:

- **Miss**
- **Graze**
- **Hit**
- **Crit**

Any of these bands may have zero width. Enemies are not exempt from Miss: an enemy may simply roll poorly and reveal an intent that currently misses.

Examples of valid move profiles include:

- a genuinely guaranteed move with **100% Hit**;
- a move that starts at 100% Hit but can become unreliable when impaired;
- an ordinary move with meaningful Miss/Graze/Hit/Crit regions;
- a deliberately risky move;
- a move with no Graze;
- a move with no Crit;
- a binary Miss/Hit move.

A move that must be completely reliable may explicitly prevent relevant state from modifying its resolution.

### Shared resolution process

Conceptually, rolled moves use the following pipeline:

1. The move supplies its **resolution profile** and effect rules.
2. A **base roll** is generated.
3. Relevant game state contributes named modifiers to produce the current resolved value.
4. That value is interpreted through the move's Miss/Graze/Hit/Crit profile.
5. The move translates the resulting band and, when useful, exact position/value into its effect.

Potential modifiers include:

- target Defense;
- restraints;
- buffs and debuffs;
- environmental state;
- move-specific rules;
- enemy traits;
- scenario rules;
- difficulty/Ascension rules.

The exact numeric scale, dice/range, ordering, and transformation formulas are not yet defined. A d20-style base roll remains possible but is not committed.

### Player versus enemy roll timing

The same resolution machinery is used on both sides, but the timing differs:

- **Player rolled actions:** generate their base roll when the player executes the action.
- **Enemy rolled actions:** generate their base roll when the enemy intent is created, before the player phase, and reveal the current outcome in advance.

This preserves randomness while avoiding blind punishment after the player has already committed to a plan. Enemy randomness generates the problem; the player gets informed tactical agency in responding to it.

### Live reinterpretation

An enemy's committed base roll normally remains fixed, but its current result is live. If Defense, statuses, vulnerabilities, or other relevant modifiers change during the player phase, the same base roll may move between Miss, Graze, Hit, and Crit or change its numerical effect.

For example, an intent that currently Misses may become a Graze if its target uses **Stand Still** and becomes easier to hit. Conversely, a defensive buff may turn a Hit into a Graze without rerolling the enemy's base value.

### Continuous effectiveness

For numerical effects, the exact roll position within a successful band may determine effectiveness.

This allows a single roll to represent both quality of contact and magnitude of effect, avoiding a separate hit roll followed by an unrelated damage roll.

For example, ordinary damage can vary continuously inside Graze, Hit, or Crit without making a powerful move produce absurdly tiny damage simply because a second damage roll was unlucky.

Not every move needs meaningful Graze or Crit behavior. A move such as Taunt may simply be a 100% Hit action.

---

## 8. Defense

There is one default **Defense** concept.

Defense represents **mobility/evasiveness**: how difficult the target is to affect cleanly.

It is not primarily a representation of thick armor or damage absorption.

Higher Defense makes hostile resolution less favorable to the attacker, tending toward weaker outcomes such as Graze or Miss. Lower Defense makes clean Hits or Crits easier.

Moves may explicitly ignore or interact differently with Defense when appropriate.

The final player-facing label and exact numerical representation of Defense remain open.

---

## 9. Bondage Model

### Independent tracks

Bondage is divided into **independent tracks** defined by the scenario.

A track represents one logically distinct restraint or affected body area. Separate restraints should not be forced into the same track merely because they occupy similar space.

For example, if a scenario contains both handcuffs and mittens and they are mechanically distinct, they may use separate tracks.

A Skunk-style scenario might use tracks such as:

- Head
- Torso
- Arms
- Legs
- Collar

Other scenarios may define entirely different sets.

### Severity bands

Bondage progresses through named severity bands:

- **Easy**
- **Medium**
- **Hard**
- **Extreme**
- **Impossible**

Tracks may use different thresholds and different effects for these bands.

The current general prototype candidate uses a fine **0–100+** scale with severity thresholds at approximately:

- **Easy:** 10
- **Medium:** 20
- **Hard:** 30
- **Extreme:** 50
- **Impossible:** 80

These values are intentionally provisional and may change with encounter testing. `Impossible` does not imply a hard numeric cap; tracks may continue above the threshold when overbinding is useful.

### Immediate threshold effects

Band effects update **immediately** when bondage crosses a threshold in either direction.

If an escape lowers Arms bondage enough to restore a required capability, that capability returns immediately during the current player phase.

If bondage increases enough to disable a capability, the restriction applies immediately.

---

## 10. Capabilities and Restraint Requirements

Moves may depend on character capabilities rather than on broad RPG categories such as “physical” or “magic.”

At minimum, useful capability concepts include:

- **Motion** — actions requiring sufficient freedom of the arms/body to perform them.
- **Verbal** — actions requiring sufficient mouth/speech freedom.

A move defines which capabilities it requires.

Different characters/classes may care about different capability sets.

The dashboard should show only capabilities that are relevant to that character. For example, a Valkyrie whose kit never cares about mouth freedom does not need a permanent Verbal indicator.

Additional capability types may be introduced only when actual mechanics require them.

---

## 11. Escape and Assistance

- Escape is a normal action competing with offense and other abilities.
- Assisting another character with escape is normally better than self-escape when the fiction/mechanics support it.
- Whether a character can self-escape or assist is determined by their current capabilities and the move’s requirements, not by a universal “high bondage forbids escape” rule.
- A character may be unable to self-escape while still being able to receive assistance.

Character-specific abilities may bypass normal physical assumptions. For example, a telekinetic character might assist while their arms are bound but lose that ability if a different required capability is disabled.

Ordinary Escape/Assist effects are **deterministic by default**. Their resulting bondage changes should be fully previewable before commitment. Scenario-specific mechanics may introduce uncertain escape outcomes explicitly.

### Escape scaling direction

The current prototype direction is that ordinary self-escape becomes less effective as the targeted bondage amount increases. The degradation should be **continuous and accelerating toward high bondage**, rather than logarithmic or linearly collapsing. A convex/power-style curve is the current candidate shape.

Design goals:

- low bondage remains relatively easy to clean up;
- moderate bondage begins to consume meaningful actions;
- high bondage becomes increasingly inefficient to solve alone;
- ordinary assistance remains substantially stronger than self-escape;
- the system retains a meaningful recovery floor rather than making late escape mathematically impossible by default.

The base escape curve should normally remain **smooth across severity thresholds**. Crossing from, for example, 79 to 81 may trigger new `Impossible` band consequences, but the universal escape formula should not also impose an arbitrary step penalty unless that binding/scenario explicitly defines one.

### Skunk-style redistribution

A Skunk scenario may use escape behavior in which heavy latex/bondage increasingly causes **redistribution** rather than simple removal.

For example, at high bondage an escape from Arms might remove a chunk from Arms while adding bondage elsewhere.

This is a scenario-specific mechanic, not a universal escape rule.

---

## 12. Statuses, Buffs, and Debuffs

Statuses may affect **anything** the designer wants, including:

- resolution bands;
- Defense;
- bondage application;
- escape behavior;
- targeting;
- intents;
- resources;
- action permissions;
- environmental interactions;
- scenario-specific mechanics.

Stacking, refreshing, intensifying, replacement, and maximum-stack behavior are properties of the **individual effect**, not universal rules.

Statuses may be represented with text, icons, or both. Tooltips should explain their exact behavior.

### Universal timing clock

All ordinary timed effects share a common round clock:

- They tick at the **start of the player phase**, before player actions.
- An effect with duration 1 applied during the player phase remains active through the coming enemy phase and expires at the start of the next player phase.

### Immediate and pending activation

Effects may activate either immediately or later.

Typical player-applied buffs become active immediately.

Enemy effects that should give the player a response window may be applied as **pending**.

At the start of the next round:

1. existing active effects tick/expire;
2. pending effects activate;
3. enemy intents are chosen from the resulting state.

This allows an enemy to apply something like Vulnerable without automatically letting the rest of the current enemy phase exploit it, unless that same-phase combo is explicitly part of the move’s design.

Immediate enemy-applied effects remain available for encounters that intentionally want same-phase combinations.

---

## 13. Persistence and Character Progression

KCQ has **no default character-power progression system**.

Characters do not normally gain:

- XP;
- levels;
- permanent stat growth;
- progressively stronger generic equipment.

A character’s baseline kit is part of that character.

However, **game state may persist between encounters whenever the scenario says it does**.

Persistent state may include:

- bondage;
- buffs/debuffs;
- restraints;
- temporary assistance effects;
- scenario items;
- curses;
- story conditions;
- other authored state.

Persistence is not the same thing as character advancement.

There are no universal between-fight recovery rules. The scenario decides what survives, what is removed, and what changes after an encounter.

---

## 14. Character Dashboard and Action UI

The character interface should answer three questions quickly:

1. **What can this character do right now?**
2. **How compromised are they?**
3. **Why?**

Useful dashboard/action information includes:

### Character-specific resources

Examples:

- mana;
- swords/ammunition;
- Ribbon Power;
- charges;
- cooldown states;
- any other class-specific resource.

Only relevant resources should be displayed.

### Defense

Show a compact indication of current Defense/evasiveness.

The final representation may be a bar, percentage, raw value, symbolic rating, or another readable form. Exact presentation is open.

When Defense changes during the player phase, any affected visible enemy intents should update immediately so the player can see whether a committed enemy roll has changed from Miss → Graze → Hit → Crit or vice versa.

### Attacking/action capabilities

Show only capability summaries that matter to that character, such as Motion or Verbal.

Do not fill the dashboard with irrelevant universal categories.

### Binding levels

Each active binding track should be clearly visible with:

- current filled amount;
- severity band;
- relevant threshold information.

Exact underlying bondage numbers do **not** need to be shown.

### Statuses

Show active/pending statuses with readable text and/or icons.

### Available moves

The action panel should make currently usable moves obvious.

Unavailable moves should be visibly disabled, with the reason accessible to the player.

### Action state

The interface should make it clear whether the character has already acted this round and whether special states such as Stand Still or prearmed reactions are active.

---

## 15. Visual Preview of Bondage and Intent Changes

Bondage should be communicated primarily through **bars and visual previews**, not arithmetic.

When selecting or hovering an action that will remove bondage:

- visually blink/highlight the portion of the bar expected to be removed;
- if the result is uncertain, show the relevant possible range;
- if the action redistributes bondage, preview the destination increase as well.

The goal is for the player to understand outcomes such as:

> “This should free enough of my Arms to cross back into Medium, but it will push more restraint onto Torso.”

without needing to read or calculate exact `-X / +Y` values.

### Intent calculation preview

Enemy intent numbers should show the **current answer first** and make the underlying equation available on hover/click. A useful presentation is:

```text
Skunk Gun → Ko
CRIT — +46 Arms

Base roll:             17
Power of the Goddess:  +4
Enemy Effect:          +2
Current total:         23
```

The exact labels and layout are open, but the player should be able to answer both:

- **What is about to happen right now?**
- **Why is that the current result?**

If a player action changes the calculation, the visible intent and its detailed breakdown should update immediately before commitment where practical.

---

## 16. Enemy HP and Damage Display

Enemies have numeric HP internally.

Player-facing HP information is primarily a **health bar** showing how much of the enemy remains.

Exact current/max HP values do not need to be prominent.

Damage numbers may be displayed as satisfying moment-to-moment feedback, but they are not intended to be a major planning interface.

Reaching 0 HP has no universal scenario-level victory meaning; the scenario decides what an enemy reaching 0 does and how victory is determined.

---

## 17. Readability Principles

- Important combat state should be understandable at a glance.
- Bars answer **“how close am I to a worse/better state?”**
- Statuses answer **“what condition is affecting me?”**
- Capability/dashboard indicators answer **“what can I currently do?”**
- Move tooltips answer **“what will this action do, and what can affect it?”**
- Enemy intents answer **“what is about to happen?”**
- Enemy intent details answer **“what was rolled, what modified it, and why does that produce this outcome?”**
- A currently missed enemy attack should be visibly recognizable as a Miss before the player acts.
- When player actions change the predicted result of an enemy intent, that change should be visible immediately.
- Exact numbers should be shown where they improve tactical understanding, but arithmetic should be layered behind the clear current result rather than becoming mandatory reading.
- Fine underlying numerical state is acceptable if the player-facing consequences remain discrete and readable.

---

## 18. Explicitly Open Decisions

The following are intentionally **not yet specified**:

- final bondage numeric scale and whether 100 has any universal special meaning;
- final severity thresholds for any binding type; the current general prototype candidate is 10 / 20 / 30 / 50 / 80;
- exact band effects for any binding type;
- exact base-roll range/die and Miss/Graze/Hit/Crit thresholds for moves;
- exact within-band effectiveness ranges;
- exact formulas and modifier ordering used by Defense, restraints, statuses, enemy power, and scenario effects to transform a base roll into its current resolved value;
- exact self-Escape and Assist curves, coefficients, minimum floors, and character-specific modifiers;
- final visual representation and name of the Defense stat;
- exact visual layout of the dashboard and intent breakdown;
- final character roster;
- final character/class kits;
- exact randomness-manipulation kit for Sakari or any other character;
- whether any character has pre-battle loadout choices;
- exact scenario/campaign structure;
- exact difficulty/Ascension rules;
- implementation architecture and data schemas;
- implementation details for cross-enemy coordination.

These should remain open until concrete content or prototyping gives a reason to decide them.

---

## 19. Current Design Philosophy

KCQ should favor:

- **scenario-authored mechanics over unnecessary universal restrictions;**
- **visible tactical information over hidden equation soup;**
- **randomness that creates visible tactical problems before the player commits actions;**
- **fixed enemy intents with committed base rolls that players can interact with;**
- **the same Miss/Graze/Hit/Crit resolution language for ordinary player and enemy attacks;**
- **deterministic, previewable player recovery as a counterpoint to random enemy pressure;**
- **meaningful bondage state over conventional player HP;**
- **character-specific tools/resources over generic RPG systems;**
- **simple core rules with room for highly bespoke moves, enemies, and scenarios;**
- **combat decisions over grinding or stat progression;**
- **UI that communicates consequences without demanding arithmetic, while making the underlying calculation inspectable when desired.**
