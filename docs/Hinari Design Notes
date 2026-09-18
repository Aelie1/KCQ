# Hinari — Character Design Spec v1

**Status:** Early working character design
**Role:** Spatial controller / defensive resource manager
**Core identity:** Hinari uses her subspace inventory to remove pressure from allies, siphon power out of incoming enemy attacks, and absorb attacks aimed at herself. Everything she stores clogs the same inventory she relies on for offense and defense, gradually reducing her options until she releases the accumulated contents.

The central tension is:

> **The more Hinari protects the party, the less functional her own inventory becomes.**

Unlike a traditional charge meter, **Subspace Load is primarily congestion, not power**. High Load should be useful in some ways, but remaining full should be a meaningful disadvantage rather than the obvious optimal state.

---

## 1. Subspace Load

Hinari has a **Subspace Load** ranging from `0` to a tentative maximum of `100`.

Load represents bindings, attacks, debris, and other material currently obstructing her subspace inventory.

Several parts of Hinari's kit depend directly on Load:

* **Store** adds Load.
* **Brace** adds Load when it absorbs an attack.
* **Rockfall** becomes progressively weaker as Load rises.
* **Brace** becomes less effective as free capacity disappears.
* **Release** empties the inventory.
* Some effects may become stronger at high Load, but Release should **not** become a huge damage nuke.

The intended shape is:

```text
Low Load
= maximum flexibility
= strongest Rockfall
= maximum Brace capacity
= plenty of room for Store

High Load
= weaker inventory attacks
= less defensive capacity
= increased danger of overflow
= more useful Release riders

Full
= inventory essentially clogged shut
```

### Overflow

Store is not simply disabled when Hinari reaches capacity.

If Hinari attempts to store more than her remaining capacity:

```text
free space = max load - current load
stored = min(amount, free space)
overflow = amount - stored
```

The excess **spills onto Hinari as binding pressure** rather than disappearing.

This allows Hinari to continue protecting someone even while nearly full, but forces her to personally absorb the consequences.

Exact overflow binding rules are still TBD.

---

## 2. Store

**Type:** Support / Control
**Role:** Proactive pressure transfer
**Target:** Ally or enemy

Store is Hinari's central mechanic.

Hinari takes part of a problem that currently exists elsewhere and places it into subspace.

### Store — ally

When used on an ally:

* find that ally's highest binding;
* remove some amount of that binding;
* add the removed amount to Hinari's Subspace Load;
* if Hinari does not have enough free capacity, the excess spills onto Hinari.

Conceptually:

```text
Ko:
Latex Arms 45

Hinari uses Store for 20.

Ko:
Latex Arms 25

Hinari:
Subspace Load +20
```

Store is therefore not a generic heal. Hinari is **physically relocating the restraint**.

### Store — enemy

When used on an enemy with a compatible offensive intention, Hinari siphons part of the impending attack into subspace.

Current direction:

1. Evaluate the enemy's locked intention using its current adjusted accuracy profile.
2. Determine the intention's current result band.
3. Lower the locked roll to the **bottom of that same band**.
4. Re-evaluate the resulting effect.
5. The removed portion becomes Subspace Load.

For example:

```text
Current adjusted profile:
Miss   0–19
Graze 20–44
Hit   45–91
Crit  92–99

Locked roll: 73
Result: Hit

Store:
73 -> 45

The attack remains a Hit,
but all excess effectiveness within Hit is removed.
```

This deliberately differs from Matsuko's **Stop!**

**Stop!** may immediately knock an attack into a lower band.

**Store** strips the attack down to the weakest possible version of its **current** band.

That creates a useful interaction with later defensive effects. After Hinari reduces an attack to the bottom of Hit, a Defense increase may shift the accuracy profile enough that the same locked roll now becomes a Graze.

### Open questions

* Exact amount/conversion of prevented enemy effect into Subspace Load.
* How damage and binding effects map onto the same 0–100 Load scale.
* Behavior for intentions containing multiple effect types.
* Which intentions are compatible with Store.
* Exact overflow behavior when Store is used against an enemy attack.

---

## 3. Brace

**Type:** Reaction / Defense
**Role:** Convert free inventory space into personal protection
**Target:** Self / zero-target setup

Brace works similarly to Ko's Reflect structurally: Hinari prepares a reaction rather than selecting an enemy intention directly.

Hinari opens her subspace defensively.

The next compatible attack against Hinari is partially or completely absorbed into her inventory.

### Current behavior

When Brace triggers:

```text
incoming effect = X
free inventory capacity = Y

absorbed = min(X, Y)
remaining effect = X - absorbed

Subspace Load += absorbed
Hinari receives the remainder normally
```

Example:

```text
Hinari Load: 60 / 100
Incoming binding: 55

40 -> subspace
15 -> Hinari

Final Load: 100
```

Brace therefore becomes naturally weaker as Hinari fills up.

At empty Load, Hinari has enormous defensive capacity.

At full Load, Brace has nothing to work with and should probably be unavailable.

### Design distinction

**Store**

* proactive;
* works on allies or enemies;
* deliberately chooses where to siphon pressure from.

**Brace**

* reactive;
* protects Hinari;
* consumes whatever free subspace capacity remains.

### Still open

* Which attack/effect types Brace can absorb.
* Whether Brace reacts once or lasts until triggered.
* Interaction with multihit attacks.
* Interaction with AoE.
* Whether one Brace can absorb multiple effects belonging to a single triggering move.

---

## 4. Rockfall

**Type:** Multihit Attack
**Role:** Primary sustained offense / visible cost of inventory congestion

Hinari retrieves rocks from subspace and summons them directly over an enemy.

This is intended to be her straightforward offensive move and her primary multihit attack.

The number of hits depends on how much of the inventory remains accessible.

### Current Load scaling

```text
Subspace Load    Rockfall
0–24             4 hits
25–49            3 hits
50–74            2 hits
75–99            1 hit
100               unavailable
```

Conceptually, stored material is physically covering the rocks deeper inside her inventory.

This directly adapts the novel's inventory limitation: useful objects can still be inside subspace but inaccessible because too much junk is piled in front of them.

Rockfall should probably be reasonably accurate, reflecting Hinari's ability to summon objects directly into useful positions.

Exact damage per hit and resolution profile are TBD.

### Design purpose

Rockfall makes filling the inventory immediately costly.

Hinari does not merely suffer an abstract penalty at high Load. The player can watch one of her core attacks deteriorate:

```text
4 hits -> 3 -> 2 -> 1 -> inaccessible
```

This also gives KCQ an early dedicated multihit character.

---

## 5. Release

**Type:** Attack / Debuff / Resource Reset
**Role:** Clear Subspace Load and restore Hinari's full kit

Hinari opens her subspace and dumps its accumulated contents onto one enemy.

Release consumes the stored Load and returns Hinari toward an empty inventory.

### Important design rule

Release should **not** be an enormous damage payoff.

If damage scales too aggressively with Load, Hinari's obvious optimal loop becomes:

```text
0 -> fill to 100 -> Release -> 0 -> fill to 100 -> Release
```

That is not the intended character.

The primary reward for Release is:

* restoring Rockfall hits;
* restoring Brace capacity;
* creating room for Store;
* escaping dangerous overflow territory.

The attack/debuff is compensation for dumping the inventory, not the reason the entire mechanic exists.

### Current direction

Release deals modest damage and gains additional riders at Load breakpoints.

Tentative shape:

```text
Low Load:
modest damage

Moderate Load:
damage + Defense penalty

High Load:
damage + stronger Defense penalty

Very High Load:
possibly an additional Vulnerability/control rider
```

The fiction is simple: the enemy is now buried under restraints, rocks, stolen attacks, and assorted garbage that Hinari has been stuffing into subspace.

A Defense penalty is therefore a particularly natural rider.

### Still open

* Exact damage.
* Exact Load breakpoints.
* Defense penalty values.
* Whether the highest breakpoint adds Vulnerability or another effect.
* Whether Release always empties all Load or may eventually have a partial-release variant.

---

## 6. Spatial Movement

**Type:** Passive
**Role:** Mobility specialization

Hinari does not need to walk normally in order to move around the battlefield. She can relocate herself spatially.

### Current candidate effects

Hinari may:

* be immune to **Hobbled**;
* avoid movement-triggered traps because she can warp across the affected space instead of physically crossing it.

She is **not** necessarily immune to Immobilized.

The intended distinction is:

> **Restricting Hinari's legs is ineffective. Completely preventing her from acting or repositioning is not.**

This keeps Spatial Movement useful without making Hinari generically immune to severe restraint.

Exact trap interaction remains TBD.

---

## 7. Intended Resource Loop

Hinari's kit should create a continuous tension rather than a simple build-and-spend meter.

```text
            STORE
       ally / enemy pressure
              |
              v
        Subspace Load
              |
      +-------+-------+
      |               |
      v               v
Rockfall weakens   Brace weakens
      |               |
      +-------+-------+
              |
              v
           RELEASE
              |
              v
       inventory clears
              |
              v
   Rockfall + Brace recover
```

The important strategic question is not:

> **How quickly can I reach 100?**

It is:

> **How much congestion am I willing to accept in exchange for protecting the party right now?**

---

## 8. Party Interaction

Hinari should naturally participate in KCQ's character-combo philosophy without requiring bespoke combo buttons.

### Defense manipulation

Because Store reduces an enemy intention to the bottom of its current result band, subsequent Defense manipulation can push that locked roll into a lower band.

Example:

```text
Enemy has a Hit.

Hinari Store:
Hit -> weakest possible Hit.

Ally applies +Defense.

The adjusted profile shifts.
The same locked roll may now become a Graze.
```

The order of actions therefore matters.

### Matsuko

Matsuko's **Obey!** can be especially useful when Hinari has spent her action on Store or when she urgently needs to Release and reopen her inventory.

This gives Matsuko a natural way to accelerate Hinari's resource cycle without adding a special-case combo rule.

### Ko

A Fairy interaction for Hinari has not yet been designed.

Potential directions should interact with the Subspace system rather than merely adding generic damage.

---

## 9. Current Move Set

| Move                 | Role                    | Load Interaction                                      |
| -------------------- | ----------------------- | ----------------------------------------------------- |
| **Store**            | Support / Control       | Adds Load by siphoning bindings or enemy attack power |
| **Brace**            | Reaction / Defense      | Converts free capacity into protection; adds Load     |
| **Rockfall**         | Multihit Attack         | Loses hits as Load rises                              |
| **Release**          | Attack / Debuff / Reset | Clears Load and restores inventory access             |
| **Spatial Movement** | Passive                 | Tentative Hobbled / trap resistance                   |

Four active moves are considered sufficient for the first implementation. A fifth move should only be added if playtesting reveals an actual tactical hole rather than to meet an arbitrary move count.

---

## 10. Design Goals

Hinari should feel fundamentally different at different inventory states.

At low Load:

> **“I have room. I can intercept almost anything and my whole arsenal is accessible.”**

At medium Load:

> **“I can keep protecting people, but I'm starting to lose tools.”**

At high Load:

> **“I can still save somebody, but I'm running out of space and Rockfall is barely functional.”**

At full Load:

> **“My inventory is completely stuffed. I need to dump this somewhere.”**

The defining fantasy is not that Hinari has a resource she wants to maximize.

It is that **she possesses an incredibly useful spatial inventory and keeps filling it with everyone else's problems until she can no longer find her own stuff.**