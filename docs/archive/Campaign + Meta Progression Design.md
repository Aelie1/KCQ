# Campaign + Meta Progression Design

**Status:** Deferred design / future campaign layer  
**Implementation priority:** Much later  
**Scope:** Optional campaign perks, pre-campaign customization, unlocks, and horizontal meta progression. These systems are intentionally separate from the current core combat-kit work.

---

## 1. Purpose

KCQ's core characters should function as complete, authored combatants without relying on progression systems to make their kits work.

This document collects ideas for a later **campaign preparation / meta-progression layer** that can give the player more ways to customize a run without introducing conventional RPG power growth.

The intended progression model is primarily **horizontal**:

- unlock new options rather than stronger ranks of old options;
- create new build possibilities rather than permanent stat inflation;
- let campaign completion expand the player's toolbox;
- avoid requiring later campaigns to assume higher character levels or upgraded base stats.

These bonuses should not be needed to design or balance the initial core combat system.

---

## 2. Current Direction

Each major character may eventually contribute a distinct kind of **pre-campaign perk system**.

The current working split is:

| Character | Campaign contribution | Core idea |
|---|---|---|
| **Ko-chan** | **Why Not?** | Changes some rule or property of a selected character. |
| **Matsuko** | **Training Program** | Improves or alters one specific move belonging to a selected character. |
| **Naruyo** | **Battle Outfit** | Grants a temporary performance bonus at the start of each battle until the outfit is damaged/broken. |
| **Sakari** | **Distortion / Sabotage** | Applies a penalty, malfunction, or rule disruption to the enemy side. |
| **Hinari** | **Inventory** | Brings a limited selection of tactical items into the campaign for later use. |

This symmetry is a **design direction, not a requirement**. If one character's contribution does not produce good gameplay, the system should not be forced merely to fill a slot.

---

## 3. Ko-chan — Why Not?

### Identity

Ko-chan's campaign perk changes a normal rule or limitation affecting a character.

The key idea is not a numeric buff. It is:

> **"Why does that restriction have to work that way?"**

A Why Not? option can alter some aspect of the target character for the duration of the campaign.

### Example shape

- remove or bypass a character-specific limitation;
- change how one resource or capability behaves;
- allow a character mechanic to function under circumstances where it normally would not;
- modify a rule that is normally fixed for that character.

Existing example:

- **Hinari:** Inventory clutter no longer prevents her from using Space abilities.

### Progression

New Why Not? options may be unlocked over time.

They should generally be **new rule-breaking choices**, not upgraded versions such as:

`Why Not? I -> Why Not? II -> Why Not? III`

---

## 4. Matsuko — Training Programs

### Identity

Matsuko creates specialized training programs for individual characters.

Her campaign contribution should therefore improve or alter **one specific move** belonging to the selected target.

This is narrower than Ko-chan's rule changes and more personal than a generic stat increase.

### Example shape

A training program might:

- improve a specific move's Hit;
- improve a specific move's Potency;
- change one move's secondary effect;
- reduce or remove a move-specific drawback;
- improve a character-specific interaction tied to that move;
- teach an alternate version of a move.

The intended fantasy is:

> Matsuko identifies one weakness or technique and puts the character through a tailored training regimen until that particular technique improves.

### Progression

New training programs can be unlocked over time.

Prefer additional specialized programs over generic permanent upgrades.

Open question for later:

- Does Matsuko choose **one trainee / one trained move** for the campaign?
- Or can each party member receive one training program?

Do not decide this until the size and complexity of the eventual pre-campaign system is clearer.

---

## 5. Naruyo — Battle Outfits

### Identity

Naruyo prepares specialized battle clothing or equipment before the campaign.

A Battle Outfit provides a temporary performance bonus at the start of each encounter.

The current preferred direction is that the outfit remains effective until it has absorbed enough punishment, at which point its bonus is lost for the remainder of that battle.

### Example shape

Possible outfit bonuses include:

- increased Hit while intact;
- increased Potency while intact;
- increased Defense while intact;
- a smaller bonus with a larger break threshold;
- a specialized bonus tied to one character mechanic.

### Damage / break model

The exact break condition is intentionally undecided.

Possible implementation concept:

> The outfit tracks accumulated hostile effect or incoming damage. Once a threshold is reached, the outfit is considered damaged/broken and its benefit ends for the encounter.

The outfit should normally refresh at the start of the next battle rather than permanently deteriorating across the campaign.

### Progression

New outfit designs can be unlocked over time.

Prefer horizontally different outfits over direct tiers such as:

`+1 Hit outfit -> +2 Hit outfit -> +3 Hit outfit`

---

## 6. Sakari — Distortion / Sabotage

### Identity

Sakari's Chaos/Distortion power causes things to break down, malfunction, or fail.

Her campaign contribution should therefore operate primarily on the **enemy side**.

Where Ko-chan changes a rule affecting the party, Sakari makes some part of the opposition work incorrectly.

### Example shape

Potential distortions include:

- reduce the effectiveness of a category of enemy bondage application;
- cause spawned enemy objects to begin partially damaged;
- weaken the first use of a selected enemy move type each encounter;
- interfere with enemy coordination;
- make a specific enemy mechanic less reliable;
- apply a conditional penalty when enemies attempt a particular behavior.

The important distinction is that Sakari should not simply provide another generic party buff.

### Progression

New distortion/sabotage options can be unlocked over time.

These should ideally become **stranger or more situational**, rather than simply numerically larger.

---

## 7. Hinari — Inventory

### Identity

Hinari uses her Inventory/Space abilities to bring useful tools into the campaign.

Her campaign contribution should provide **limited-use tactical items** rather than passive bonuses.

### Example shape

Potential items include:

- emergency escape/restraint-removal tools;
- barriers or defensive consumables;
- throwable offensive items;
- status-cleansing items;
- battlefield-object removal tools;
- campaign-specific artifacts;
- specialized utility items that create unusual tactical lines.

### Inventory structure

A likely direction is a limited number of **Inventory slots** selected before the campaign.

For example:

`[Item A] [Item B] [Item C]`

Once an item is consumed, it remains spent until the campaign's recovery rules say otherwise.

Exact slot counts, stacking rules, and recovery are intentionally undecided.

### Progression

New items can be unlocked over time.

The goal is to expand the set of tools the player can bring, not simply replace early items with strictly stronger versions.

---

## 8. Shared Progression Philosophy

All five systems should follow the same broad meta-progression principle:

> **Progression unlocks new choices, not mandatory permanent power.**

Examples:

- Ko unlocks new Why Not? rule modifications.
- Matsuko unlocks new training programs.
- Naruyo unlocks new Battle Outfits.
- Sakari unlocks new distortions/sabotage options.
- Hinari unlocks new Inventory items.

This preserves the current design goal that characters do not require XP, levels, or permanent stat growth to remain viable.

A later campaign can therefore offer additional build variety without making an earlier campaign's unmodified characters obsolete.

---

## 9. Relationship to Core Character Kits

These systems are **not part of the current core-kit design pass**.

For now:

- core moves should be designed without assuming any campaign perk;
- encounter balance should not depend on unlocked meta options;
- supers / limit breaks can be designed separately;
- dual techniques can be designed separately;
- campaign perks should not be used to patch weaknesses in an unfinished base kit.

The immediate goal remains proving that each character is interesting and functional using only their normal combat kit.

---

## 10. Implementation Boundary

Do **not** implement these systems during the current combat-engine / character-kit milestone.

They should remain design-only until the game has, at minimum:

- stable core character kits;
- stable enemy mechanics;
- working campaign structure;
- enough harness data to understand baseline character and encounter balance.

Only then should campaign/meta perks be evaluated as an additional layer.

---

## 11. Open Questions for Much Later

- Does every character ultimately receive exactly one campaign contribution system?
- How many perks/options may be selected before a campaign?
- Are selections party-wide, character-specific, or both?
- How are new options unlocked?
- Are unlocks tied to campaign completion, challenges, discoveries, achievements, or something else?
- Can multiple characters' campaign perks target the same party member?
- Should some campaigns restrict or replace these systems?
- How much of the eventual campaign difficulty should assume access to unlocked options?
- How are these choices presented without making pre-campaign setup cumbersome?

No answers are required during the current design phase.

---

## 12. Current Summary

The current conceptual split is:

- **Ko-chan changes rules.**
- **Matsuko improves moves.**
- **Naruyo supplies renewable encounter-start equipment buffs.**
- **Sakari disrupts the enemy side.**
- **Hinari supplies consumable tactical tools.**

Together, these could eventually form a horizontal meta-progression system that expands campaign build options without turning KCQ into a level/stat-grind RPG.

For now, preserve the ideas and leave them unimplemented.
