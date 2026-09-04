# KCQ Design Spec — v1

**Status:** Working specification  
**Scope:** Concrete decisions for the new game only. Historical research, archaeology, old-game analysis, and rationale belong in the separate *KCQ Design Notes* document.

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
2. **Choose enemy intents**
   - Each enemy selects its move from the current game state.
3. **Reveal enemy intents**
   - Show the selected move and target.
4. **Player phase**
   - Party members act in any order.
5. **Enemy phase**
   - Enemies execute their revealed intents from top to bottom in displayed enemy order.
6. Begin the next round.

Enemy intent selection occurs **after** start-of-round effects have ticked, expired, or activated.

---

## 3. Player Action Economy

- Each character normally has **one primary action per round**.
- Attacking, escaping, assisting another character, and class abilities normally compete for that action.
- Party members may act in any order during the player phase.
- Additional resources, cooldowns, charges, ammunition, mana, swords, Ribbon Power, or similar systems are **character-specific**, not universal.

### Stand Still

`Stand Still` is a baseline tactical option.

- It consumes the character’s primary action.
- It grants **two Escape/Assist actions**.
- Those two actions may be any combination of self-escape and helping others.
- They may affect different bindings or different characters.
- Until the next player phase, the character is easier for hostile effects to hit cleanly.
- The character counts as **stationary** for environmental rules.

It is acceptable for Stand Still to have little or no practical downside during a round in which no visible enemy intent or environmental rule punishes remaining stationary. Identifying such safe windows is part of tactical play.

---

## 4. Enemy Intents

Enemy actions are announced through visible intents.

An intent normally shows:

- the **move/action name**;
- the **target**;
- a tooltip or expanded description explaining what the move does.

Exact numerical outcomes do not need to be shown as part of the basic intent display.

### Intent rules

- Once revealed, an intent is normally **locked**.
- Enemies do not silently choose a new target because circumstances changed.
- If the target becomes invalid, the intent normally **fails/fizzles**.
- If the enemy becomes unable to perform the declared move, the intent normally **fails/fizzles**.
- A move may explicitly define a fallback or exception.
- Player abilities may explicitly **redirect, cancel, alter, or otherwise manipulate** intents.
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

A move has a base outcome profile built from some combination of:

- **Miss**
- **Graze**
- **Hit**
- **Crit**

Any of these bands may have zero width.

Examples of valid move profiles include:

- a genuinely guaranteed move with **100% Hit**;
- a move that starts at 100% Hit but can become unreliable when impaired;
- an ordinary move with meaningful Miss/Graze/Hit/Crit regions;
- a deliberately risky move;
- a move with no Graze;
- a move with no Crit;
- a binary Miss/Hit move.

A move that must be completely reliable may explicitly prevent relevant state from modifying its resolution profile.

### Resolution process

1. The move supplies its **base resolution profile**.
2. Relevant game state modifies that profile.
3. A roll selects a position on the final bar.
4. The move translates that result into its effect.

Potential modifiers include:

- target Defense;
- restraints;
- buffs and debuffs;
- environmental state;
- move-specific rules;
- enemy traits;
- scenario rules;
- difficulty/Ascension rules.

The exact transformation formulas are not yet defined.

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

The precise underlying numeric scale, thresholds, and upper limits remain open.

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

Ordinary Escape/Assist effects are deterministic by default. Their resulting bondage changes should be fully previewable before commitment. Scenario-specific mechanics may introduce uncertain escape outcomes explicitly.

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

## 15. Visual Preview of Bondage Changes

Bondage should be communicated primarily through **bars and visual previews**, not arithmetic.

When selecting or hovering an action that will remove bondage:

- visually blink/highlight the portion of the bar expected to be removed;
- if the result is uncertain, show the relevant possible range;
- if the action redistributes bondage, preview the destination increase as well.

The goal is for the player to understand outcomes such as:

> “This should free enough of my Arms to cross back into Medium, but it will push more restraint onto Torso.”

without needing to read or calculate exact `-X / +Y` values.

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
- Exact numbers should be shown only where they improve understanding.
- Fine underlying numerical state is acceptable if the player-facing consequences remain discrete and readable.

---

## 18. Explicitly Open Decisions

The following are intentionally **not yet specified**:

- exact bondage numeric scale;
- exact severity thresholds for any binding type;
- exact band effects for any binding type;
- exact Miss/Graze/Hit/Crit percentages for moves;
- exact within-band effectiveness ranges;
- exact formulas used by Defense, restraints, and statuses to reshape resolution bars;
- final visual representation and name of the Defense stat;
- exact visual layout of the dashboard;
- final character roster;
- final character/class kits;
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
- **fixed enemy intents that players can interact with;**
- **meaningful bondage state over conventional player HP;**
- **character-specific tools/resources over generic RPG systems;**
- **simple core rules with room for highly bespoke moves, enemies, and scenarios;**
- **combat decisions over grinding or stat progression;**
- **UI that communicates consequences without demanding arithmetic.**
