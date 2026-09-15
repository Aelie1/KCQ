# Ko-chan — Character Design Spec v2

**Status:** Working character design
**Role:** Resilient magical attacker / party combo enabler
**Core identity:** Ko remains offensively functional even while heavily restrained. She is unusually difficult for bondage to shut down, but she cannot free herself and depends on her teammates for recovery. Her Fairy Transformation also acts as one of the party’s major combo engines.

---

## 1. Core Gameplay Identity

Ko should feel like a character who continues operating when another character would be badly compromised.

Her bondage still matters:

* it continues accumulating normally;
* it still contributes toward capture and other scenario effects;
* she still suffers any consequences that do not specifically prevent her from using restrained capabilities;
* she cannot Escape herself.

However, Ko's Thousand Restraints Body allows her to continue using abilities that would ordinarily be disabled by Arms, Legs, or Mouth bondage.

This makes Ko unusually reliable offensively, but creates an important weakness:

> **Ko can keep fighting while restrained, but she needs the rest of the party to actually get her free.**

Ko should also be one of the primary sources of explicit **character-to-character interaction** in KCQ. Fairy Transformation can empower other party members and unlock Fairy versions of their moves.

---

## 2. Thousand Restraints Body

### Passive

Ko ignores ordinary Arms, Legs, and Mouth capability restrictions when determining whether she can use her character abilities.

She does **not** ignore the bondage itself.

Bondage:

* still increases normally;
* still changes severity bands normally;
* still counts toward capture;
* may still affect Defense, Hit, or other statistics where appropriate;
* may still interact with enemy or scenario mechanics.

### Escape restriction

Ko cannot use ordinary self-Escape.

She may still Assist another character if the action otherwise permits it.

Other party members may Assist Ko normally.

This creates a deliberate asymmetry: Ko is difficult to shut down, but poor at recovering without help.

---

## 3. Telekinesis

**Type:** Attack
**Role:** Reliable direct offense

Ko attacks one enemy using telekinesis.

Telekinesis should be one of Ko's dependable default actions when no special tactical response is required.

### Current intent

* Single-target.
* Reliable resolution profile.
* Straightforward damage.
* No complicated setup requirement.
* Exact damage and resolution numbers TBD.

### Fairy version

**Fairy Telekinesis** is an empowered variant unlocked while Ko has Fairy Empowerment.

Current candidate:

* becomes an AoE attack affecting all valid enemies;
* otherwise preserves Telekinesis's identity as straightforward magical damage.

Exact implementation and numbers TBD.

---

## 4. Starlight Bindings

**Type:** Control / Support
**Role:** Suppress one enemy while making it easier for the party to exploit

Ko wraps an enemy in black starlight bindings.

The primary mechanical effect is to reduce both:

* **Hit** — the enemy becomes less effective offensively;
* **Defense** — the enemy becomes easier for the party to affect cleanly.

This makes Starlight Bindings both defensive and offensive support.

The intended tactical question is:

> **Do I use Ko's action for immediate Telekinesis damage, or compromise this enemy so the entire party can exploit it?**

Unlike an effect that reduces both outgoing and incoming damage, Starlight Bindings should encourage the party to attack the affected enemy.

### Still open

* Whether Starlight Bindings also deals direct damage.
* Exact Hit penalty.
* Exact Defense penalty.
* Duration.
* Whether it stacks, refreshes, or merely replaces itself.

### Fairy version

**Fairy Starlight Bindings** is an empowered variant unlocked while Ko has Fairy Empowerment.

Current candidate:

* applies Starlight Bindings to multiple/all enemies.

This would give Ko a powerful party-wide setup/stabilization option after spending time transforming.

Exact behavior TBD.

---

## 5. Reflect

**Type:** Reaction / Support
**Role:** Reactive defense

Ko prepares a reflection effect against an incoming hostile move.

Original concept:

* the next compatible attack against Ko is negated or substantially reduced;
* the attacker takes reflected counter-damage;
* some boss, scripted, or special effects may only be partially reflectable.

Reflect remains part of Ko's intended kit, but its detailed mechanics are not yet settled.

### Still open

* What counts as a compatible attack.
* Whether Reflect fully negates or reduces the triggering effect.
* Counter-damage strength.
* Duration.
* Interaction with multihit attacks.
* Interaction with AoE.
* Interaction with enemy threshold/scripted actions.
* Whether Reflect receives a Fairy variant.

---

## 6. Fairy Transformation

**Type:** Self Buff / Combo Setup
**Role:** Defensive setup and access to empowered moves

Fairy Transformation is Ko's central setup mechanic.

Using Fairy Transformation:

1. consumes Ko's normal action;
2. increases Ko's Defense;
3. grants **Fairy Empowerment**.

The Defense bonus gives Ko immediate value on the setup turn and helps compensate for spending an action without directly attacking.

Exact Defense bonus and duration remain TBD.

---

## 7. Fairy Empowerment

Fairy Empowerment changes the moves currently available to the affected character.

Rather than requiring every normal move to dynamically rewrite itself, a character may expose explicitly authored **Fairy move variants** while empowered.

Conceptually:

> normal character state → normal move set
> Fairy Empowerment → one or more Fairy moves become available

The character's move set should therefore be derived dynamically from current character/game state.

### Ko

Ko is expected to have multiple Fairy interactions because Fairy Transformation is her personal mechanic.

Current candidates include:

* Fairy Telekinesis;
* Fairy Starlight Bindings;
* possibly a Fairy interaction with another move later.

Using an empowered Fairy move should normally consume Fairy Empowerment.

Exact consumption rules remain TBD.

---

## 8. Spreading Fairy Empowerment

If Ko uses Fairy Transformation while already empowered, she may be able to escalate the transformation into a party-support effect.

### Current direction

A second use of Fairy Transformation can spread Fairy Empowerment to the other party members.

This costs Ko two actions across two turns:

1. Ko transforms and empowers herself.
2. Ko uses Fairy Transformation again to empower the party.

The payoff is that other characters gain access to their own authored Fairy moves.

This creates a deliberate tempo gamble:

> **Take Ko's personal payoff now, or spend another Ko action preparing a much stronger party combo.**

Exact rules remain open, including:

* whether Ko's own Fairy Empowerment is consumed when she spreads it;
* whether Ko also receives/retains empowerment afterward;
* duration of party Fairy Empowerment;
* whether all allies receive it or only selected allies.

---

## 9. Fairy Moves Across the Party

### Tentative KCQ-wide rule

Each playable character should have **at least one move that becomes a Fairy move while that character has Fairy Empowerment**.

Fairy moves are individually authored.

They do **not** need to follow one universal transformation rule.

Examples may include:

* changing a single-target move into AoE;
* increasing potency;
* gaining a powerful secondary effect;
* interacting with another character's resource or status;
* breaking one of the normal limitations of that character's kit.

Ko's Fairy Transformation therefore acts as a party combo engine rather than merely a personal numerical buff.

---

## 10. Character Interaction Principle

### Tentative KCQ-wide design goal

Each playable character should possess at least one mechanic that:

* interacts meaningfully with another character;
* enables another character;
* creates a combo another character can exploit;
* or changes another character's available tactical options.

Characters do not need bespoke interactions with every other party member.

The goal is to avoid the BQuest 1 pattern where character kits largely function independently beside one another.

Ko's primary contribution to this principle is currently **Fairy Empowerment**.

---

## 11. Spirit Bond

**Type:** Double Tech — Ko + Matsuko
**Role:** Major cooperative offensive payoff

Ko and Matsuko combine black starlight and white flame into a powerful single-target attack.

### Current concept

* Requires both Ko and Matsuko.
* Consumes both characters' actions.
* Deals extremely high single-target damage.

Exact damage, availability requirements, targeting, and interaction with Fairy Empowerment remain TBD.

Spirit Bond should remain an explicit example of character-to-character cooperation rather than merely being two ordinary attacks added together.

---

## 12. Power of Denial

**Type:** Super / Limit ability
**Role:** Delete a major problem

Fantasy concept:

Ko declares that something should not exist, and reality changes accordingly.

Possible eligible targets might eventually include:

* a restraint;
* a hostile battlefield object;
* a dangerous status/effect;
* a normal enemy;
* another scenario-defined problem.

This ability is **not yet implementation-ready**.

The fantasy is preserved, but its actual mechanical limits should be designed only after Ko's ordinary combat kit is working.

Major questions include:

* resource/cost;
* what categories of state may be deleted;
* boss restrictions;
* encounter-object restrictions;
* whether it can target party problems;
* whether it interacts with Fairy Transformation.

---

## 13. Why Not?

**Type:** Pre-campaign character modification

Existing concept:

Before a campaign, choose one unlocked character-specific **Why Not?** modification that breaks one normal limitation for that character during the run.

Ko's specific Why Not? option has not yet been designed.

This system is not required for Ko's initial playable implementation.

---

## 14. Current Core Turn Choices

Once the basic kit exists, Ko should commonly face decisions resembling:

### Immediate offense

Use **Telekinesis**.

### Party setup / enemy suppression

Use **Starlight Bindings**.

### Reactive protection

Prepare **Reflect**.

### Invest in future power

Use **Fairy Transformation**.

### Cash out Fairy Empowerment

Use an empowered Fairy move.

### Double down on setup

Use Fairy Transformation again and attempt to enable a party-wide Fairy combo.

The intent is for Ko's turns to alternate between reliable action now and increasingly powerful setup/payoff sequences.

---

## 15. Initial Implementation Priority

The first playable Ko does not require every idea in this document.

Recommended first implementation slice:

1. Thousand Restraints Body.
2. Telekinesis.
3. Starlight Bindings.
4. Fairy Transformation.
5. Fairy Empowerment.
6. Fairy Telekinesis.
7. Fairy Starlight Bindings.
8. Reflect once its trigger behavior is finalized.

Later:

* party-spread Fairy Empowerment;
* Fairy moves for the rest of the party;
* Spirit Bond;
* Power of Denial;
* Why Not? modifications.

---

## 16. Major Open Balance Questions

Still intentionally undefined:

* Telekinesis damage and resolution profile.
* Starlight Bindings Hit penalty.
* Starlight Bindings Defense penalty.
* Starlight Bindings duration.
* Whether Starlight Bindings deals damage.
* Reflect behavior and counter strength.
* Fairy Transformation Defense bonus.
* Fairy Transformation Defense duration.
* Fairy Empowerment duration.
* Fairy Empowerment consumption rules.
* Exact Fairy versions of Ko's moves.
* Party-spread Fairy rules.
* Spirit Bond damage/cost.
* Power of Denial restrictions and cost.

These should be treated as prototype values rather than solved in advance.
