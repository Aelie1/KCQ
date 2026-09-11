import { BINDING_MODIFIER, DEFENSE_MODIFIER, EFFECT_MODIFIER, effectivenessRange, HIT_MODIFIER, thresholds } from "./constants";
import { GameEffects } from "./effects";
import { getIEntitySide, isCharacter, isEnemy } from "./helpers";
import { iBinding, iCharacter, iEffect, iEnemy, iEntity, iGameState, iMove, iTargetInfo, MoveDef } from "./itypes";
import { canMove, getModifier } from "./status";
import { AccuracyProfile, AccuracyResult, StanceId } from "./types";


export function setStance(target: iCharacter, stance: StanceId): GameEffects {
    const result = new GameEffects();
    switch (stance) {
        case "standing":
            if (!target.standing) {
                result.addEvent({ 
                    type: "stanceChanged", 
                    actor: target.id, 
                    stance: stance 
                });
                target.standing = true;
            }
            break;
        case "moving":
            if (target.standing && canMove(target)) {
                result.addEvent({ 
                    type: "stanceChanged", 
                    actor: target.id, 
                    stance: stance 
                });
                target.standing = false;
            }
            break;
    }
    return result;
}

export function calculateAccuracy(actor: iEntity, target: iEntity, move: MoveDef): AccuracyProfile {
    const base = move.accuracy;
    if (!base) {
        return { none: 100 };
    }

    // Every accuracy-bearing move should have a Hit band.
    if (base.hit === undefined) {
        throw new Error(`Move ${move.id} has an accuracy profile with no Hit band`);
    }

    const clamp = (value: number, min: number, max: number): number =>
        Math.max(min, Math.min(max, value));

    /*
     * The authored accuracy bar represents performance against neutral Defense.
     *
     * Characters currently have no base Hit stat, so their status modifiers
     * are relative to neutral accuracy.
     *
     */
    let hitModifier = getModifier(actor, "hit") * HIT_MODIFIER;

    if (isCharacter(actor)) {
        switch (move.type) {
            case "arms":
                hitModifier += getModifier(actor, "hitarms") * HIT_MODIFIER;
                break;

            case "mouth":
                hitModifier += getModifier(actor, "hitmouth") * HIT_MODIFIER;
                break;

            case "legs":
                hitModifier += getModifier(actor, "hitlegs") * HIT_MODIFIER;
                break;
        }
    }


    let defenseModifier = 0;

    //Ignore defense when you're targetting your own side
    if (getIEntitySide(actor) != getIEntitySide(target)) {
        defenseModifier = (isEnemy(target) ? target.currDef : 0);
        defenseModifier += getModifier(target, "defense") * DEFENSE_MODIFIER;
    }

    const delta = hitModifier - defenseModifier;

    /*
     * Work with cumulative boundaries:
     *
     * crit     = Crit width
     * fullHit  = Hit + Crit
     * contact  = Graze + Hit + Crit
     *
     * This makes it much easier to reshape the bar without changing
     * the total away from 100.
     */
    const hasMiss = base.miss !== undefined;
    const hasGraze = base.graze !== undefined;
    const hasCrit = base.crit !== undefined;

    const baseCrit = base.crit ?? 0;
    const baseFullHit = base.hit + baseCrit;
    const baseContact = (base.graze ?? 0) + baseFullHit;

    /*
     * Accuracy mostly changes ordinary reliability.
     *
     * Crit is deliberately harder to gain and easier to lose:
     *
     *   positive accuracy: +Crit at 1/4 rate
     *   negative accuracy: -Crit at 2x rate
     *
     * An absent Crit band can never be created by generic accuracy.
     */
    let crit = 0;

    if (hasCrit) {
        const critDelta = delta >= 0
            ? delta * 0.25
            : delta * 2;

        crit = clamp(baseCrit + critDelta, 0, 100);
    }

    /*
     * Full hits react directly to accuracy.
     * Mere contact reacts only half as strongly.
     */
    let fullHit = clamp(baseFullHit + delta, 0, 100);
    let contact = clamp(baseContact + delta * 0.5, 0, 100);

    // Crit must live inside the full-hit region.
    crit = Math.min(crit, fullHit);

    /*
     * Preserve structural zero-width bands.
     *
     * No Graze band:
     *     Hit transitions directly into Miss.
     *
     * No Miss band:
     *     Accuracy can degrade Hit into Graze, but cannot create Miss.
     *
     * No Miss AND no Graze:
     *     The move always fully connects; only Hit/Crit distribution changes.
     */
    if (!hasMiss && !hasGraze) {
        fullHit = 100;
        contact = 100;
        crit = Math.min(crit, fullHit);
    } else if (!hasGraze) {
        contact = fullHit;
    } else {
        contact = clamp(contact, fullHit, 100);

        if (!hasMiss) {
            contact = 100;
        }
    }

    /*
     * Convert the cumulative boundaries back into individual widths.
     */
    const result: AccuracyProfile = {};

    if (hasMiss) {
        result.miss = 100 - contact;
    }

    if (hasGraze) {
        result.graze = contact - fullHit;
    }

    result.hit = fullHit - crit;

    if (hasCrit) {
        result.crit = crit;
    }

    return result;
}


export function evaluateResult(target: iEntity, accuracy: AccuracyProfile, roll: number): iTargetInfo {
    const result: iTargetInfo = { target: target, result: "none", effectiveness: 0 };

    const order: AccuracyResult[] = ["miss", "graze", "hit", "crit"];

    let cumulative = 0;
    for (const band of order) {
        const value = accuracy[band];
        if (value !== undefined && value > 0) {
            result.result = band;
            if (roll < cumulative + value) {
                if (band !== "miss") {
                    const [min, max] = effectivenessRange[band];
                    const effect = (roll - cumulative) / value;
                    result.effectiveness = (min + (max - min) * effect) * (1 + getModifier(target, "effect") * EFFECT_MODIFIER);
                }
                return result;
            }
            cumulative += value;
        }
    }
    //rolled above the highest band, return the top of the highest band
    result.effectiveness = effectivenessRange[result.result][1] * (1 + getModifier(target, "effect") * EFFECT_MODIFIER);

    return result;
}

export function tickBuffs(state: iGameState): GameEffects {
    const result = new GameEffects();
    const effects: iEffect[] = [];
    for (const entity of [...state.characters, ...state.enemies]) {
        for (const buff of [...entity.buffs]) {
            if (!buff.active) {
                buff.active = true;
                continue;
            }
            if (buff.duration === undefined) {
                continue;
            }
            buff.duration--;
            if (buff.duration === 0) {
                effects.push({
                    type: "buff",
                    buff: buff,
                    target: entity,
                    operation: "remove"
                });
            }
        }
    }
    result.fromEffects(state, effects);
    return result;
}

export function tickCooldowns(enemies: iEnemy[]) {
    for (const enemy of enemies) {
        for (const [moveId,cooldown] of Object.entries(enemy.cooldowns)) {
            if (cooldown > 0) {
                enemy.cooldowns[moveId]--;
            }
        }
    }
}

export function resolveEscape(actor: iCharacter, target: iCharacter, binding: iBinding): iEffect[] {
    const effects: iEffect[] = [];
    const basePotency = 20;
    const bindingValue = binding.value;
    const bindingRatio = Math.min(bindingValue / thresholds.impossible, 1);
    const basePenalty = 15;
    let escapePotency = basePotency - basePenalty * Math.pow(bindingRatio, 2);
    escapePotency *= 1 + getModifier(actor, "escape") * BINDING_MODIFIER;
    if (actor !== target) {
        escapePotency *= 1.5;
    }
    escapePotency = Math.ceil(escapePotency);

    effects.push({
        type: "binding",
        target: target,
        binding: binding.definition,
        amount: escapePotency * -1
    });

    if (binding.definition.onEscape) {
        effects.push(...binding.definition.onEscape(actor, target, binding, escapePotency));
    }

    return effects;
}

export function resolveMove(state: iGameState, move: iMove, actor: iEntity, targets: iTargetInfo[]): iEffect[] {
    const successfulTargets = targets.filter(
        target => target.result !== "miss"
    );
    const effects: iEffect[] = move.definition.resolve(state, actor, move, successfulTargets);
    return effects.map(normalizeEffect);
}

function normalizeEffect(effect: iEffect): iEffect {
    switch (effect.type) {
        case "binding":
        case "damage":
            return {
                ...effect,
                amount: Math.ceil(effect.amount)
            };
        default:
            return effect;
    }
}
