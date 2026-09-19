# Matsuko — Character Sheet v2

**Status:** Working character specification  
**Scope:** Core combat kit only. Supers / Limit Breaks, Double / Triple Techs, and Campaign / Meta Progression perks are intentionally deferred.

## Role

**Reliable front-line attacker / tactical commander**

## Identity

Matsuko is the party member who is hardest to make useless.

Her normal offense is split across independent **Arms** and **Legs** channels, so losing one capability still leaves her with a strong attack. Her white-flame techniques are significantly stronger than her mundane martial arts, but she can deliberately burn that advantage away with **Immolation** for a major burst of AoE damage.

After Immolation, Matsuko does not become helpless. Her flame-enhanced attacks disappear and are dynamically replaced by weaker physical fallback attacks on the same Arms / Legs channels.

Her **Mouth** is reserved for **Compulsion**. Losing Mouth does not remove her ordinary offense; it removes her ability to control the shape of the round.

Matsuko should therefore degrade in layers rather than shut down all at once:

- lose **Arms** -> lose the Arms attack channel;
- lose **Legs** -> lose the Legs attack channel;
- lose **Mouth** -> lose Compulsion;
- use **Immolation** -> voluntarily lose the premium flame versions of her attacks for the rest of the encounter;
- lose both Arms and Legs after Immolation -> ordinary offense is finally in serious trouble.

---

# Core Offensive Kit

## White Flame

**Type:** Attack  
**Requirement:** Arms  
**State:** Flame active

Matsuko attacks with white flame through her upper-body / arm channel.

- Strong single-target damage.
- Current rough rider: **+2 Hit**.
- Exact damage and Hit value are balance targets for the harness, not fixed design numbers.

White Flame should be significantly stronger than post-Immolation **Punch**.

## Phoenix Kick

**Type:** Attack  
**Requirement:** Legs  
**State:** Flame active

Matsuko delivers a flame-enhanced kick.

- Strong single-target damage.
- Current rough rider: **+2 Potency**.
- Exact damage and Potency value are balance targets for the harness.

Phoenix Kick should be significantly stronger than post-Immolation **Kick**.

### White Flame vs. Phoenix Kick

The two attacks are parallel high-quality options on different capability channels.

- **White Flame** favors reliability / landing the attack.
- **Phoenix Kick** favors effect strength when it lands well.

Neither should simply obsolete the other when both are available.

---

# Fairy Empowerment

Ko-chan's Fairy Empowerment upgrades Matsuko's two flame-enhanced single-target attacks.

Unlike characters whose Fairy move substantially changes targeting or move behavior, Matsuko's Fairy variants improve the complementary weakness of each premium attack.

## Fairy White Flame

**Type:** Fairy Attack
**Requirement:** Arms
**State:** Flame active + Fairy Empowerment

Fairy White Flame retains White Flame's normal strengths and adds the offensive property associated with Phoenix Kick.

* Same base role and damage as White Flame.
* Retains White Flame's **Hit bonus**.
* Also gains a **Potency bonus**.
* Current implementation: **+2 Hit, +2 Potency**.
* Consumes Fairy Empowerment when used.

Normal White Flame favors reliability. Fairy White Flame temporarily removes that tradeoff by making the attack both reliable and potent.

## Fairy Phoenix Kick

**Type:** Fairy Attack
**Requirement:** Legs
**State:** Flame active + Fairy Empowerment

Fairy Phoenix Kick retains Phoenix Kick's normal strengths and adds the offensive property associated with White Flame.

* Same base role and damage as Phoenix Kick.
* Retains Phoenix Kick's **Potency bonus**.
* Also gains a **Hit bonus**.
* Current implementation: **+2 Hit, +2 Potency**.
* Consumes Fairy Empowerment when used.

Normal Phoenix Kick favors stronger successful results. Fairy Phoenix Kick temporarily removes its corresponding reliability tradeoff.

## Design Purpose

White Flame and Phoenix Kick normally divide Matsuko's premium offense across two slightly different profiles:

* **White Flame:** higher reliability.
* **Phoenix Kick:** higher effectiveness.

Fairy Empowerment temporarily completes either attack by giving it the other move's advantage.

This preserves the identity of the underlying move rather than replacing it with an unrelated special attack.

The choice of Fairy attack therefore still depends on Matsuko's available capability channel:

> **Arms available → Fairy White Flame**
> **Legs available → Fairy Phoenix Kick**

If both are available, their current numerical profiles become equivalent unless later balancing gives them additional distinctions.

## Interaction with Immolation

Fairy Empowerment does not currently modify Immolation.

While Matsuko has Fairy Empowerment and her flame is active, her offensive move set becomes:

* Fairy White Flame
* Fairy Phoenix Kick
* Immolation

Using Immolation still causes normal Flame Burnout.

After Flame Burnout:

* Fairy White Flame disappears;
* Fairy Phoenix Kick disappears;
* Punch and Kick replace the flame attacks as normal.

Burnout therefore takes precedence over Fairy Empowerment. Fairy Empowerment does not restore Matsuko's burned-out flame techniques.

## Interaction with Compulsion

Fairy Empowerment does not modify Compulsion.

Available Compulsion commands continue to be added according to the normal shared-cooldown rules regardless of whether Matsuko is Fairy Empowered.

---

# Immolation / Flame Burnout

## Immolation

**Type:** AoE Attack / Overdrive  
**Requirement:** TBD  
**State:** Flame active only

Matsuko releases an enormous burst of white flame against the enemy side.

- Very large AoE payoff.
- Intended to be substantially stronger than an ordinary primary action.
- **After use, Matsuko's flame-enhanced attack state is burned out for the rest of the encounter.**
- White Flame and Phoenix Kick disappear from her available move list.
- Punch and Kick appear in their place.
- Immolation itself also disappears after use.

Immolation is not an ordinary cooldown attack. It is a deliberate trade:

> **Take a major immediate burst now in exchange for permanently reducing Matsuko's offense for the rest of this encounter.**

The player should want to make the use count: secure multiple kills, break an emergency state, push through a critical encounter phase, or otherwise gain enough immediate value to justify losing Matsuko's best attacks.

The harness should tune Immolation by comparing its immediate value against the expected future offense lost by burning out White Flame / Phoenix Kick.

---

# Post-Immolation Martial Arts

Punch and Kick are **not shown while Matsuko's flame state is active**. They are fallback moves dynamically added to her move list only after Immolation burns out her flame techniques.

## Punch

**Type:** Attack  
**Requirement:** Arms  
**State:** Flame burned out

- Reliable single-target physical damage.
- Lower performance than White Flame.
- No Hit / Potency rider.

## Kick

**Type:** Attack  
**Requirement:** Legs  
**State:** Flame burned out

- Reliable single-target physical damage.
- Lower performance than Phoenix Kick.
- No Hit / Potency rider.

Punch and Kick do not need elaborate secondary identities. Their main purpose is **reliability through independent capability channels** after Matsuko has voluntarily spent her premium offense.

---

# Compulsion

**Type:** Control / Support  
**Requirement:** Mouth  
**Action Cost:** Free action  
**Cooldown:** Shared Compulsion cooldown; command used determines lockout length

Compulsion is Matsuko's tactical-command subsystem.

She may use a Compulsion command **for free before her normal primary action**, provided her Mouth capability is available and Compulsion is not on cooldown.

All Compulsion commands share the same cooldown state. Matsuko therefore chooses what form her authority will take over the next several rounds rather than using multiple commands independently.

Compulsion cannot be used on consecutive rounds.

## Attack Me!

**Target:** Compatible revealed enemy intents  
**Shared Cooldown:** 2 rounds

Retarget compatible enemy intents to Matsuko for the current round.

- Intended as the most frequently available Compulsion option.
- Primarily redistributes danger rather than deleting enemy output.
- Any temporary Defense rider remains TBD and should be harness-tuned.
- Incompatible or explicitly fixed-target intents are not affected.

**Tactical identity:** Stabilization / tanking.

Matsuko accepts danger herself so the rest of the party can operate safely.

## Stop!

**Target:** One compatible revealed enemy intent  
**Shared Cooldown:** 3 rounds

Against an ordinary enemy, the declared intent is canceled.

Against a boss / major enemy, Stop does **not** rewrite the move's resolution profile. Instead, Matsuko directly lowers the eventual resolution roll before the move is interpreted.

- Current rough example: **-0.25 to the roll**.
- Exact penalty is a harness-tuned value.
- The result is clamped normally at the bottom of the roll range.
- A Crit may become a Hit; a Hit may become a Graze; a Graze may become a Miss; a result may also remain in the same band but become weaker within that band.

**Tactical identity:** Emergency reserve.

Because using any Compulsion starts the shared lockout, using Attack Me! or Obey! means Matsuko may not have Stop available when a catastrophic enemy intent appears.

## Obey!

**Target:** One ally who is not currently under Servitude  
**Shared Cooldown:** 3 rounds

Matsuko commands an ally to exceed their normal action economy.

- The ally immediately performs one eligible action, even if they have already acted this round.
- The extra action should feel approximately like creating one additional ordinary move's worth of tactical value.
- After Obey!, the target gains **Servitude**.
- An ally under Servitude cannot be targeted by Obey! again.
- Servitude duration and exact penalties remain TBD.

**Tactical identity:** Aggressive tempo / combo enablement.

Obey! can be used to confirm a kill, solve a dangerous board state immediately, or enable character-specific combinations. Its opportunity cost is that Matsuko gives up access to Stop! and Attack Me! during the shared cooldown window.

---

# Compulsion Balance Target

Use **Move Equivalent (ME)** as an internal harness concept rather than a player-facing number.

- **1.0 ME:** rough tactical value of one ordinary primary action under neutral conditions.
- **ME / use:** how much value a button produces when activated.
- **ME / round:** its amortized contribution after cooldown / resource restrictions.

Current rough target:

- **Obey!** -> about 1.0 ME per use / roughly 0.33 ME per round at cooldown 3.
- **Stop!** -> roughly similar long-run contribution, though actual value depends heavily on which intent the player chooses to block.
- **Attack Me!** -> lower value per activation but available more frequently, with a rough long-run contribution in the same neighborhood.

These are **balance targets, not guarantees**.

A skilled player should be able to extract more value by timing Compulsion intelligently. Blocking a catastrophic Latex Explosion is intentionally worth much more than stopping a minor single-target Spray. Likewise, Obey! may be worth far more than one immediate action when the extra move confirms a kill and removes future enemy actions.

The shared cooldown creates the central Compulsion decision:

> **Spend authority now for immediate tempo, or preserve Stop! for an emergency that may happen later.**

The harness should test Compulsion policies, not only isolated button values.

---

# Dynamic Move Presentation

Matsuko's visible move list should reflect her current combat state rather than showing every theoretical move at once.

### Flame active

- White Flame
- Phoenix Kick
- Immolation
- available Compulsion commands
- other future core actions, if any

### Flame active + Fairy Empowerment

- Fairy White Flame
- Fairy Phoenix Kick
- Immolation
- available Compulsion commands
- other future core actions, if any

### Flame burned out

- Punch
- Kick
- available Compulsion commands
- other future core actions, if any

The UI should not show Punch / Kick as knowingly inferior alternatives while the flame-enhanced versions are still available.

---

# Restraint / Capability Profile

## Arms

Currently affects:

- White Flame while flame is active.
- Punch after flame burnout.

## Legs

Currently affects:

- Phoenix Kick while flame is active.
- Kick after flame burnout.

## Mouth

Currently affects:

- All Compulsion commands.

No other current core Matsuko move should use Mouth.

This preserves Matsuko's intended flexibility: compromising any single capability removes an important part of her kit, but does not normally remove her ability to contribute.

---

# Deferred Systems — Not Part of v2 Core Kit

The following are intentionally excluded from this sheet until their shared systems are designed later:

## Super / Limit Break

**Slave Brand** remains a thematic candidate, but its use condition, resource model, and exact effect are deferred to the future **Super Skills / Limit Breaks** system.

## Double / Triple Techs

**Spirit Bond** remains a thematic Ko-chan + Matsuko candidate, but its cost, action handling, unlock rules, and exact effect are deferred to the future **Double / Triple Techs** system.

## Campaign / Meta Progression

Matsuko's possible campaign-level contribution is **Training Programs**: improving or altering a specific move belonging to a chosen character.

This belongs to the deferred **Campaign + Meta Progression / Ascension perks** system and is not part of Matsuko's baseline combat kit.

---

# Still Open

- Exact White Flame damage / Hit rider.
- Exact Phoenix Kick damage / Potency rider.
- Exact Punch and Kick baseline damage.
- Immolation damage, target rules, and capability requirement.
- Whether Attack Me! grants a Defense bonus and, if so, how much.
- Exact boss Stop! roll penalty.
- Exact Servitude duration and penalties.
- Exact Compulsion cooldown counting implementation.
- Interaction of Compulsion with unusual / scripted intents.
- Any additional core move Matsuko may need after real encounter testing.
- All numerical tuning, to be determined through the combat harness.
