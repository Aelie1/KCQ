# Hinari — Character Design Spec v2

**Status:** 0.3 working character design
**Role:** Spatial support / bondage redistribution / multihit attacker
**Core identity:** Hinari manipulates space to move restraints away from allies and into her Subspace Inventory. The fuller her Inventory becomes, the weaker her offense becomes and the fewer defensive options she retains. She must continually decide whether to absorb more problems, tolerate congestion, or dump stored material back onto the battlefield.

Hinari does **not** destroy bondage.

Her central rule is:

> **Hinari can move problems around. She cannot make them disappear for free.**

---

## 1. Core Gameplay Loop

Hinari's gameplay revolves around **Subspace Load**, ranging from **0–100**.

She can increase Subspace Load by:

* using **Store** to remove bondage from an ally;
* using **Brace** to absorb incoming bondage that would otherwise affect her.

A fuller Subspace directly interferes with her offensive ability.

Hinari reduces Subspace by actively using **Release** to move stored material somewhere else.

There is **no passive Subspace recovery**.

This creates a repeating loop:

> **Rescue / absorb → become congested → lose offensive efficiency → Release → recover capacity**

Subspace is therefore both:

* a defensive resource she wants available;
* and a burden she does not want to fill unnecessarily.

Every point Hinari stores eventually has to be dealt with deliberately.

---

## 2. Subspace Inventory

Hinari begins combat with:

**Subspace: 0 / 100**

Stored bondage occupies Subspace capacity.

Subspace is not intended to behave like a conventional mana bar. Low Subspace is good: it represents free room for Hinari's spatial abilities.

### Congestion

As Subspace fills, Hinari becomes progressively worse at using Inventory-based attacks.

At maximum Subspace:

* **Rockfall** is unavailable;
* **Brace** is unavailable because there is no remaining capacity to absorb anything.

This gives Hinari a natural failure state short of capture:

> **Her Inventory is completely clogged.**

Subspace does not clear automatically. Once Hinari accepts pressure into her Inventory, spending an action on Release is the normal way to regain that capacity.

---

## 3. Store

**Type:** Support
**Requirement:** Arms
**Target:** One ally
**Role:** Rescue / transfer existing bondage

Hinari moves existing bondage from an ally into her Subspace Inventory.

### Current behavior

* Targets one allied character.
* Selects that character's highest existing binding.
* Removes up to **25 bondage** from that binding.
* Available Subspace capacity absorbs as much of the transferred bondage as possible.
* If Hinari does not have enough free capacity, the excess bondage is transferred onto **Hinari herself** rather than being destroyed.

Example:

> Ally has 25 bondage removed.
> Hinari has only 10 free Subspace.
> 10 enters Subspace and the remaining 15 is applied to Hinari.

This preserves the central rule that Hinari can relocate bondage but cannot simply erase it.

### Tactical purpose

Store lets Hinari rapidly rescue a character who is approaching an important threshold, but doing so makes Hinari's own kit progressively worse.

This creates the decision:

> **Is freeing this ally worth clogging Hinari's Inventory?**

Because Subspace does not drain naturally, Store also creates a future action obligation: eventually Hinari must decide how to Release what she stored.

---

## 4. Brace

**Type:** Reaction / Defense
**Requirement:** None
**Target:** Self / no target
**Role:** Convert incoming bondage into Subspace Load

Hinari prepares herself to spatially absorb an incoming hostile binding effect.

Brace behaves similarly to a precommitted reaction.

### Current behavior

* Hinari prepares Brace using her action.
* The next compatible incoming enemy binding effect against Hinari triggers it.
* As much of the incoming bondage as possible is moved into free Subspace capacity.
* Any amount that cannot fit still resolves normally onto Hinari.
* Brace is then consumed.

Brace does **not** require enough capacity for the entire attack.

For example:

> Hinari has 15 free Subspace.
> An attack would apply 25 bondage.
> 15 enters Subspace and Hinari receives the remaining 10.

Brace becomes unavailable when Subspace is completely full.

### Tactical purpose

Brace allows Hinari to voluntarily use her Inventory as a defensive buffer.

Unlike Store, which fixes an existing problem on another character, Brace spends Hinari's action in advance to prevent a future problem from fully materializing.

The prevented bondage is not gone, however. It becomes another Subspace problem Hinari will eventually have to Release.

---

## 5. Rockfall

**Type:** Attack
**Requirement:** Arms
**Target:** One enemy
**Role:** Variable multihit offense

Hinari opens her Inventory and drops stored objects onto an enemy.

Rockfall's effectiveness depends directly on how much free room remains in Subspace.

### Current hit progression

| Subspace |        Hits |
| -------- | ----------: |
| 0–24     |           4 |
| 25–49    |           3 |
| 50–74    |           2 |
| 75–99    |           1 |
| 100      | Unavailable |

Rockfall therefore gives Hinari a direct offensive reason to keep her Inventory clean.

The punishment for storing bondage is not merely an abstract stat penalty. The move visibly deteriorates:

> **4 hits → 3 → 2 → 1 → disabled**

### Multihit behavior

Rockfall is a true multihit move rather than one large attack represented cosmetically as several impacts.

Individual hits should use the normal resolution machinery independently where appropriate.

Exact per-hit damage and resolution values remain balance parameters.

---

## 6. Fairy Rockfall

**Type:** Fairy Attack
**Requirement:** Arms
**Target:** One enemy
**Role:** Empowered multihit payoff

While Hinari has Fairy Empowerment, Rockfall becomes **Fairy Rockfall**.

Current implementation direction uses a smoother and stronger congestion curve:

| Subspace |        Hits |
| -------- | ----------: |
| 0–16     |           6 |
| 17–33    |           5 |
| 34–49    |           4 |
| 50–66    |           3 |
| 67–83    |           2 |
| 84–99    |           1 |
| 100      | Unavailable |

Fairy Rockfall therefore improves Hinari most strongly when she has successfully managed her Inventory.

It does **not** bypass the Subspace system.

Even empowered Hinari still loses offensive capability as congestion rises.

This preserves the character's core resource loop rather than allowing Fairy Empowerment to erase it.

Exact Fairy consumption behavior follows the party-wide Fairy Empowerment rules.

---

## 7. Release

**Type:** Attack / Support
**Requirement:** Arms
**Target:** One ally or one enemy
**Role:** Actively clear Subspace by relocating its contents

Release lets Hinari force stored material back out of her Inventory.

Because Subspace does not recover naturally, Release is Hinari's primary means of restoring capacity.

It is deliberately asymmetric depending on the target.

### Enemy Release

* Target one enemy.
* Remove **25 Subspace Load**.
* Deal damage to the enemy.

This is the slower, safer disposal option.

It converts congestion back into offense without inflicting additional bondage on the party.

Exact damage remains a balance value.

### Ally Release

* Target one ally.
* Remove **50 Subspace Load**.
* Apply **20 bondage** to the target using the appropriate stored binding context.

This clears Hinari's Inventory much faster, but it does so by putting some of the problem back onto the party.

The resulting bondage is less than the amount of Subspace cleared, representing the efficiency of deliberately transferring stored material rather than merely reversing Store one-for-one.

### Tactical purpose

Release creates the central disposal choice:

> **Clear Subspace slowly and safely through an enemy, or clear it rapidly by accepting a new party problem.**

Because Hinari cannot simply wait for Subspace to recover, congestion creates real action pressure.

Release is especially important because Arms bondage can disable it.

A badly restrained Hinari can therefore become trapped with a completely clogged Inventory.

---

## 8. Spatial Movement

**Type:** Passive

Hinari does not need to physically walk across the battlefield when she can manipulate space.

Current intent:

* **Hobbled does not interfere with Hinari's movement.**
* Hinari avoids ordinary **movement-triggered traps** by teleporting rather than crossing the affected space normally.
* **Immobilized still works.**

Spatial Movement should bypass consequences specifically caused by conventional locomotion rather than becoming a generic immunity to every movement restriction.

---

## 9. Restraint Profile

Hinari's active kit is strongly dependent on her Arms.

### Arms-dependent

* Store
* Rockfall
* Release
* Fairy Rockfall

### No capability requirement

* Brace

This creates a deliberate vulnerability.

As Hinari loses use of her Arms:

1. she loses Rockfall;
2. she loses Release;
3. she loses Store;
4. Brace remains available while Subspace has room;
5. once Subspace reaches maximum, even Brace disappears.

Hinari can therefore enter a genuine **resource shutdown** state:

> **Arms disabled + full Subspace = her spatial toolkit has effectively seized up.**

Because Subspace has no passive drain, this state cannot fix itself merely by waiting.

This is intentional rather than something the engine should automatically rescue her from.

---

## 10. Party Role

Hinari is not primarily a conventional healer or tank.

She is a **pressure redistributor**.

She can:

* pull an ally away from an important bondage threshold with Store;
* preemptively soften an incoming attack with Brace;
* retain respectable offense while her Inventory is clean;
* trade stored pressure for damage through enemy Release;
* deliberately put some pressure back onto the party to recover capacity quickly.

Unlike a conventional cleansing character, Hinari does not make accumulated enemy progress vanish.

This should make rescue decisions more interesting because helping someone now creates a problem that still has to be dealt with later.

---

## 11. Character Interaction

Hinari's strongest party interaction is inherent in **Store** and **Release**.

She can rescue another character immediately, but the party as a whole has not escaped the underlying pressure.

This allows other characters to exploit the temporary breathing room Hinari creates.

Examples:

* rescue a character before they lose access to an important move;
* move pressure away from the character currently being focused by enemy intents;
* accept bondage on a safer character through Release;
* preserve an ally's action economy at the cost of Hinari's future offensive power.

Fairy Rockfall also gives Ko's Fairy Empowerment a direct offensive payoff for Hinari.

---

## 12. Why the Current Design Changed

Hinari originally leaned much harder into arbitrary spatial manipulation:

* redirecting targets;
* swapping characters;
* teleporting allies out of effects;
* invalidating enemy intents;
* temporarily removing entities from combat.

That version required extensive special-case interaction with targeting, intents, immobilization, and encounter mechanics.

The current design expresses the same underlying fantasy through mechanics the engine already supports cleanly:

* **space as storage;**
* **space as relocation;**
* **space as defensive interception;**
* **space as movement;**
* **space as an offensive Inventory.**

The architectural constraint ultimately produced a more unified character.

Nearly every active Hinari decision now asks the same question:

> **What should I do with the limited space I have left?**

---

## 13. Current Turn Choices

A typical Hinari turn should present choices resembling:

### Immediate offense

Use **Rockfall** while Subspace is relatively empty.

### Rescue an ally

Use **Store**, sacrificing future Inventory capacity.

### Prepare for incoming pressure

Use **Brace**.

### Recover capacity safely

Use **Release** on an enemy.

### Recover capacity quickly

Use **Release** on an ally and accept the resulting bondage.

### Cash out Fairy Empowerment

Use **Fairy Rockfall**, ideally while Subspace is still clean.

The goal is that Hinari's resource management emerges naturally from normal tactical decisions rather than requiring a separate builder/spender minigame.

---

## 14. Current Core Kit

Hinari currently has **four active moves**:

1. **Store**
2. **Brace**
3. **Rockfall**
4. **Release**

There is no need to add a fifth move merely because another character has more buttons.

A new move should only be introduced if playtesting reveals a tactical hole that the existing four cannot address.

---

## 15. Major Open Balance Questions

Still intentionally unresolved:

* Store's final transfer amount.
* Rockfall damage per hit.
* Rockfall resolution profile.
* Fairy Rockfall final hit progression.
* Fairy Rockfall damage per hit.
* Enemy Release damage.
* Ally Release bondage amount.
* Exact rules for retaining/storing binding identity inside Subspace.
* Which incoming effects qualify for Brace.
* Brace interaction with multihit binding attacks.
* Interaction between Subspace and unusual scenario-specific restraints.
* Whether any later Double/Triple Tech uses Subspace.

These should be tuned through playtesting rather than solved architecturally in advance.
