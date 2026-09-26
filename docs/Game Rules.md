# KCQ Game Rules

This document describes the stable mechanical rules of **Ko-chan's Quest (KCQ)**.

The current repository and its tests are authoritative. This document is a human-readable description of those rules and should be updated when the intended game rules change, not merely when implementation details are refactored.

Source baseline: `Aelie1/KCQ`, `master`, commit `f30b6c0` (2026-09-24).

---

## 1. Battle Structure

Battles alternate between two phases:

1. **Player Phase**
2. **Enemy Phase**

A battle begins on **Round 1, Step 1, Player Phase**.

During the player phase, the player may act with characters in any order and may end the phase whenever desired. Characters do not all need to act before `End Turn` is selected.

Ending the player phase performs the following sequence:

1. Binding end-of-turn effects tick.
2. Phase changes to Enemy.
3. Enemies execute their committed intentions.
4. Cooldowns tick.
5. Buff durations tick.
6. Player action states and stances reset.
7. Enemies generate intentions for the next round.
8. Phase changes back to Player.
9. Step resets to 1.
10. Round increases by 1.

### Battle outcomes

A battle is a **Victory** when no enemies remain.

A battle is a **Defeat** when every player character is Incapacitated.

Otherwise the battle is **Ongoing**.

If both conditions would simultaneously be true, Victory takes precedence because enemy elimination is checked first.

The engine reports the battle outcome but does not itself use the outcome as a global lock preventing further actions. The UI is responsible for handling the end of battle appropriately.

---

## 2. Player Action Economy

A character normally receives **one primary action per player phase**.

Primary actions include:

* using a move;
* escaping a binding;
* assisting another character's escape.

After the primary action is consumed, that character normally cannot perform another move, escape, or stance change during the phase.

There are exceptions created by specific mechanics, such as bonus escapes, action refreshes, and moves explicitly marked as free.

### Stance changes

Changing stance does **not** consume the character's primary action.

However, stance may only be changed while the character still has their normal action available.

Thus:

* Standing → Attack is legal.
* Standing → Escape is legal.
* Attack → change stance is not legal.
* Escape → change stance is not legal unless some effect has refreshed the character's action state.

### Free-on-hit moves

Some moves are explicitly `freeOnHit`.

Such a move does not consume the normal action if at least one of its attacks successfully connects.

If every attempted hit misses, the normal action is consumed.

### Action refresh

Effects may explicitly refresh a character who has already acted, allowing that character to take another normal action.

---

## 3. Moving and Standing

Every normally mobile character begins an encounter in the **Moving** stance.

A character can freely toggle between Moving and Standing before using their normal action.

### Moving

Moving is the normal stance.

While Moving:

* actions that involve movement may trigger encounter traps;
* the character does not receive the Standing defense penalty;
* the character does not receive Standing's bonus-escape benefit.

### Standing

Standing represents deliberately remaining in place.

While Standing:

* movement traps are not checked when the character attacks or escapes;
* the character receives **Defense −2**;
* after using their normal action to escape, they may receive one additional escape.

Each point of the Defense modifier represents 10 points of accuracy adjustment, so Standing's Defense −2 produces a 20-point shift in favor of normal attacks against that character.

Standing is therefore a tradeoff:

**avoid movement hazards and gain better escape action economy, but become substantially easier to hit.**

### Returning to Moving

At the beginning of the next player phase, characters automatically return to Moving if they are capable of movement.

If a character is currently prevented from moving, they remain Standing instead.

A character who is prevented from moving cannot voluntarily change from Standing back to Moving.

### Movement exceptions

Statuses and passives may alter these rules.

For example, an effect may:

* prevent movement;
* allow the character to ignore traps entirely.

Such exceptions are content rules layered on top of the normal stance system.

---

## 4. Traps

Encounters may contain one or more trap meters.

Each trap has an amount between **0 and 100**.

For a normal character in Moving stance, each trap is checked before an attack or escape is performed.

At zero modifiers, a trap with an amount of 40 behaves approximately like a **40% trigger chance**.

The trap check is:

`roll + (Trap modifier × 5) < trap amount`

Positive Trap modifiers therefore improve the character's ability to avoid traps. Negative Trap modifiers make traps more dangerous.

Standing characters do not make these movement trap checks.

Characters with a `skipsTraps` effect also ignore them.

### Multiple traps

Multiple traps are checked independently and in encounter order.

More than one trap can therefore trigger during the same attempted action.

### Trap interruption

Traps resolve **before** the intended attack or escape.

After all triggered trap effects have resolved, the engine checks whether the intended action is still legal.

A trap can therefore bind, stun, immobilize, or otherwise hinder the character enough to interrupt the action they were attempting.

If this occurs:

* the trap effects remain committed;
* the intended move or escape does not occur;
* an `actionInterrupted` event is generated;
* the character's normal action is consumed.

An invalid command detected before trap resolution does not trigger traps or alter state.

---

## 5. Moves

Moves have:

* a move type;
* a target side;
* a target count;
* optional accuracy;
* optional damage or other effects;
* optional special validation rules.

### Move types

The standard move types are:

* **Arms**
* **Mouth**
* **Legs**
* **None**

Bindings and statuses may penalize or completely block individual move types.

A move of type `None` is not associated with a body-part restriction.

Some effects explicitly allow a move type. An explicit allowance overrides ordinary blocking of that move type.

### Target sides

Moves may target:

* players;
* enemies;
* either side;
* nobody.

Moves may require a fixed number of unique targets or automatically affect **all** valid targets.

Incapacitated player characters are not valid move targets.

Individual moves may impose additional target restrictions.

---

## 6. Accuracy and Effectiveness

The standard player accuracy profile is:

| Result   | Base chance |
| -------- | ----------: |
| Miss     |         10% |
| Graze    |         15% |
| Hit      |         65% |
| Critical |         10% |

Moves may define different profiles or omit accuracy entirely.

### Accuracy modifiers

Normal accuracy considers:

* generic Hit modifiers;
* the appropriate Arms/Mouth/Legs hit modifier;
* move-specific modifiers;
* target Defense.

Each normal Hit or Defense modifier point represents a **10-point accuracy shift**.

Enemy definitions may also have intrinsic Defense.

### Willpower checks

Some moves use **Willpower** instead of normal accuracy.

These compare the attacker's Willpower against the target's Willpower and ignore ordinary Defense and body-part accuracy modifiers.

### How accuracy reshapes the result bands

Accuracy does not simply add the same percentage to every successful result.

Broadly:

* the Hit/Crit region receives the full accuracy adjustment;
* total contact chance receives half of the adjustment;
* player Critical chance changes slowly, at one tenth of the overall accuracy adjustment;
* enemy Critical chance can be reduced by penalties but is not increased above its authored value by generic positive accuracy;
* result bands omitted by the move are not invented by generic accuracy changes.

### Effectiveness

A successful roll has an effectiveness based on where it lands within its result band:

| Result   | Effectiveness |
| -------- | ------------: |
| Miss     |            0% |
| Graze    |        20–50% |
| Hit      |       80–100% |
| Critical |      150–200% |

Damage and similar effects scale from this effectiveness.

**Potency** on the attacker and **Vulnerability** on the target each modify effectiveness by 12.5% per point. Their multipliers are applied separately.

---

## 7. Bindings

Bindings are numeric meters attached to individual characters.

The standard thresholds are:

|  Value | Binding level |
| -----: | ------------- |
|    0–9 | None          |
|  10–19 | Easy          |
|  20–29 | Medium        |
|  30–49 | Hard          |
|  50–79 | Extreme       |
| 80–100 | Impossible    |

The maximum binding value is **100**.

`Max` represents the numeric cap; values of 80 through 100 are mechanically classified as Impossible.

When a binding reaches zero, it is removed from the character.

### Resistance above Impossible

Binding accumulates normally up to 80.

Additional bondage above the Impossible threshold receives only **10% effectiveness**.

If an incoming effect crosses 80, the portion needed to reach 80 applies normally and only the overflow is reduced.

Example:

* Current binding: 75
* Incoming binding: 20
* First 5 points reach Impossible normally.
* Remaining 15 points are reduced to 10%.
* The final increase rounds upward, producing a value of 82.

No binding can exceed 100.

### Binding-specific behavior

Individual binding definitions may add:

* statuses at particular binding levels;
* effects when bondage is added;
* effects when escaping;
* end-of-turn effects;
* internal state specific to that binding.

These are content rules rather than universal properties of all bindings.

---

## 8. Escaping and Assisting

Escaping is deterministic: there is no separate success/failure roll.

An escape removes a calculated amount from a selected binding.

### Base escape strength

Escape potency begins at **20**.

Increasing bondage reduces the amount removed according to:

`20 − 15 × (min(binding / 80, 1))²`

Therefore escape progress becomes progressively worse as the binding approaches Impossible.

Once the binding reaches 80, additional binding strength does not further reduce the underlying base escape potency.

### Escape modifiers

The escaping character's Escape modifier alters the result by **10% per point**.

### Assistance

Escaping somebody else's binding is an **assist**.

Assistance receives a **1.5× potency multiplier**.

The final amount is rounded upward and cannot remove more bondage than currently exists.

### Action cost

The first escape normally consumes the character's primary action.

### Standing bonus escape

If the character is Standing when performing their normal escape, they receive exactly **one bonus escape** when:

* bonus escapes are not blocked; and
* at least one legal follow-up escape remains somewhere in the party.

The bonus escape may be:

* another self-escape; or
* an assist on another character.

Once used, the bonus escape is gone.

If the first escape removes the last binding that the character could legally work on, no unnecessary bonus escape is created.

Some statuses, such as Vibrating, explicitly prevent the Standing bonus escape.

### Escape versus Assist restrictions

A status may separately:

* prevent all escaping;
* prevent assisting other characters.

A character blocked from assisting may still work on their own bindings unless escaping itself is also blocked.

---

## 9. Status System

Bindings, buffs, and passive abilities can produce statuses.

Statuses may provide:

* numeric modifiers;
* blocked move types;
* explicitly allowed move types;
* action restrictions and special flags.

### Combining statuses

If multiple sources apply the **same status**, their values do not add together.

Only the **strongest value of that status** is used.

Different statuses and ordinary buff modifiers can contribute modifiers simultaneously.

### Immunities

Passive abilities may make an entity immune to particular statuses.

An immune status is removed from the effective status set before its restrictions and modifiers are calculated.

### Standard status flags

The engine currently supports flags that can:

* block attacks;
* block escapes;
* block assisting;
* block Standing bonus escapes;
* block movement;
* ignore traps;
* skip the character's turn;
* mark the character as Incapacitated.

---

## 10. Standard Status Effects

The following are the engine's current general-purpose statuses. Their numeric values are **status intensity**, not binding level; individual bindings decide which intensity they apply at each binding threshold.

### Bound

| Intensity | Effect                                                        |
| --------: | ------------------------------------------------------------- |
|         1 | Arms Hit −2                                                   |
|         2 | Arms Hit −4                                                   |
|         3 | Arms Hit −6; Arms moves blocked; assisting blocked            |
|         4 | Arms Hit −8; Escape −1; Arms moves blocked; assisting blocked |

### Gagged

| Intensity | Effect                                       |
| --------: | -------------------------------------------- |
|         1 | Mouth Hit −2                                 |
|         2 | Mouth Hit −4                                 |
|         3 | Mouth Hit −6; Mouth moves blocked            |
|         4 | Mouth Hit −8; Escape −1; Mouth moves blocked |

### Hobbled

| Intensity | Effect                                                          |
| --------: | --------------------------------------------------------------- |
|         1 | Defense −1; Trap −1; Legs Hit −2                                |
|         2 | Defense −2; Trap −2; Legs Hit −4                                |
|         3 | Defense −3; Trap −3; Legs Hit −6; Legs moves blocked            |
|         4 | Defense −4; Trap −4; Legs Hit −8; Escape −1; Legs moves blocked |

### Vibrating

| Intensity | Effect                          |
| --------: | ------------------------------- |
|         1 | Escape −1; bonus escape blocked |
|         2 | Escape −2; bonus escape blocked |
|         3 | Escape −3; bonus escape blocked |
|         4 | Escape −4; bonus escape blocked |

### Submissive

| Intensity | Effect                         |
| --------: | ------------------------------ |
|         1 | Willpower −1; Vulnerability +1 |
|         2 | Willpower −2; Vulnerability +2 |
|         3 | Willpower −3; Vulnerability +3 |
|         4 | Willpower −4; Vulnerability +4 |

### Breathless

Defense is reduced by the status intensity:

* 1 → Defense −1
* 2 → Defense −2
* 3 → Defense −3
* 4 → Defense −4

### Blinded

| Intensity | Effect             |
| --------: | ------------------ |
|         1 | Hit −1             |
|         2 | Hit −2             |
|         3 | Hit −3; Defense −1 |
|         4 | Hit −4; Defense −2 |

### Immobilized

Prevents returning to the Moving stance.

It does not by itself prevent attacks or escapes.

### Helpless

Skips the character's turn entirely.

### Stunned

Blocks:

* attacking;
* escaping;
* movement.

It does not itself count as Incapacitated.

### Incapacitated

* skips the character's turn;
* marks the character Incapacitated for targeting and battle-outcome purposes.

### Servitude

Blocks escaping.

---

## 11. Buff Timing

Buffs may have finite or indefinite duration.

Finite active buffs tick when the enemy phase finishes and the game transitions back to the player phase.

This means a duration-1 buff applied during the player phase normally remains active through the upcoming enemy phase and expires before the next player phase.

The engine also supports pending/inactive buffs. On their first round transition they become active without losing duration. This allows effects that intentionally begin on the following round.

Buffs may also:

* provide modifiers;
* provide statuses;
* add moves;
* alter incoming damage;
* alter incoming bondage;
* link themselves to another entity.

---

## 12. Enemy Intentions

Enemies plan actions ahead of the enemy phase.

Their intentions are generated:

* when an encounter begins;
* again at the beginning of each new player round.

An intention contains its move, targets, and committed random rolls.

This allows the UI to preview what enemies currently intend to do.

### Committed rolls, live conditions

The random roll behind an intention is committed when the intention is created.

However, its result is recalculated against the **current game state**.

Therefore the player can alter the outcome of an already-visible intention by changing things such as:

* Defense;
* statuses;
* buffs;
* targeting.

The enemy keeps the same underlying random roll, but that roll may move from Hit to Miss or vice versa as modifiers change.

If an intended target disappears before resolution, the target is dropped rather than automatically replaced unless a specific effect retargets the intention.

An enemy unable to attack or whose turn is skipped does not execute its committed intention.

---

## 13. Rule Layers

When interpreting KCQ, distinguish between three kinds of rules.

### Core engine rules

These belong in this document.

Examples:

* action economy;
* Moving versus Standing;
* accuracy;
* binding thresholds;
* escape calculations;
* traps;
* status aggregation;
* battle phases.

### Content rules

These belong with characters, enemies, encounters, or separate content documentation.

Examples:

* what a particular Latex binding does;
* Ko-chan's Thousand Restraints Body;
* Hinari ignoring traps;
* Matsuko's Compulsions;
* Queen wave thresholds;
* individual enemy attacks.

### Implementation details

These should generally **not** be copied here unless they define observable game behavior.

Function names, internal interfaces, file structure, serialization classes, and other implementation architecture belong to the repository itself.

The purpose of `GAME_RULES.md` is to preserve the stable rules of the game even while the implementation is refactored.
