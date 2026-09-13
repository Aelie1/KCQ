import { BINDING_MODIFIER, DEFENSE_MODIFIER, EFFECTIVENESS_MODIFIER, effectivenessRange, HIT_MODIFIER, thresholds } from "../protected/constants";
import { getIEntitySide, isCharacter, isEnemy, isValidEntity } from "../protected/helpers";
import { iBinding, iCharacter, iEffect, iEnemy, iEntity, iGameState, iMove, iTargetInfo, iValidityInfo, MoveDef } from "../protected/itypes";
import { canMove, getModifier, isIncapacitated } from "../protected/status";
import { AccuracyProfile, AccuracyResult, HitBand } from "../public/types";


export function isValidTarget(state: iGameState, actor: iEntity, target: iEntity | null, move: MoveDef): iValidityInfo {
    if (target === null) {
        if (move.targets !== 0) {
            return {
                valid: false,
                target: null,
                reason: "invalidTarget"
            };
        }
    } else {
        if (!isValidEntity(state, target)) {
            return {
                valid: false,
                target: target,
                reason: "invalidTarget",
            };
        }
        if (getIEntitySide(target) !== move.side) {
            return {
                valid: false,
                target: target,
                reason: "invalidTarget",
            };
        }
        if (isCharacter(target) && isIncapacitated(target)) {
            return {
                valid: false,
                target: target,
                reason: "targetIncapacitated"
            };
        }
    }

    const accuracy = calculateAccuracy(actor, target, move);
    return {
        valid: true,
        accuracy: accuracy,
        target: target
    }
}

function calculateAccuracy(actor: iEntity, target: iEntity | null, move: MoveDef): AccuracyProfile | null {
    const base = move.accuracy;
    if (!base) {
        return null;
    }

    const clamp = (value: number, min: number, max: number): number =>
        Math.max(min, Math.min(max, value));

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

    //Ignore defense when you have no target
    if (target != null) {
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
    const hasHit = base.hit !== undefined;
    const hasCrit = base.crit !== undefined;

    const baseCrit = base.crit ?? 0;
    const baseFullHit = (base.hit ?? 0) + baseCrit;
    const baseContact = (base.graze ?? 0) + baseFullHit;

    /*
     * Accuracy mostly changes ordinary reliability.
     *
     * nemy crit chance can only decrease; 
     * player crit chance scales in both directions.
     *
     * An absent Crit band can never be created by generic accuracy.
     */
    let crit = 0;

    if (hasCrit) {
        let critDelta;
        if (isCharacter(actor)) {
            critDelta = delta * 0.1;
        } else {
            critDelta = Math.min(delta, 0) * 0.1;
        }

        crit = clamp(baseCrit + critDelta, 0, 100);
    }

    /*
     * Full hits react directly to accuracy.
     * Mere contact reacts only half as strongly.
     */
    let fullHit = clamp(baseFullHit + delta, 0, 100);
    let contact = clamp(baseContact + delta * 0.5, 0, 100);

    // crit must live inside the full hit region.
    fullHit = clamp(fullHit, crit, 100);
    // Full hit must live inside the contact region.
    contact = clamp(contact, fullHit, 100);

    /*
     * Preserve structural zero-width bands.
     *
     * No Hit band:
     *     Crit transitions directly into Graze.
     * 
     * No Graze band:
     *     Hit transitions directly into Miss.
     *
     * No Miss band:
     *     Accuracy can degrade Hit into Graze, but cannot create Miss.
     *
     */

    if (!hasHit) {
        fullHit = crit;
    }

    if (!hasGraze) {
        contact = fullHit;
    }

    if (!hasMiss) {
        contact = 100;

        if (!hasGraze) {
            fullHit = 100;

            if (!hasHit) {
                crit = 100;
            }
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

    if (hasHit) {
        result.hit = fullHit - crit;
    }

    if (hasCrit) {
        result.crit = crit;
    }

    return result;
}


export function evaluateResult(actor: iEntity, target: iEntity, accuracy: AccuracyProfile, roll: number): iTargetInfo {
    return {
        target: target,
        ...evaluateProfile(actor, accuracy, roll, getModifier(target, "vulnerability"))
    };
}

export function evaluateProfile(actor: iEntity, accuracy: AccuracyProfile, roll: number, vulnerability: number): AccuracyResult {
    const order: HitBand[] = ["miss", "graze", "hit", "crit"];
    const result: AccuracyResult = { band: "none", effectiveness: 0 }
    const potency = getModifier(actor, "potency");

    let cumulative = 0;
    for (const band of order) {
        const value = accuracy[band];
        if (value) {
            result.band = band;
            if (roll < cumulative + value) {
                if (band !== "miss") {
                    const [min, max] = effectivenessRange[band];
                    const ratio = (roll - cumulative) / value;
                    result.effectiveness = (min + (max - min) * ratio)
                        * (1 + vulnerability * EFFECTIVENESS_MODIFIER)
                        * (1 + potency * EFFECTIVENESS_MODIFIER);
                }
                return result;
            }
            cumulative += value;
        }
    }
    //rolled above the highest band, return the top of the highest band
    result.effectiveness = effectivenessRange[result.band][1]
        * (1 + vulnerability * EFFECTIVENESS_MODIFIER)
        * (1 + potency * EFFECTIVENESS_MODIFIER);

    return result;
}

export function tickBuffs(state: iGameState): iEffect[] {
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
            if (buff.duration <= 0) {
                effects.push({
                    type: "buff",
                    buff: buff,
                    target: entity,
                    operation: "remove"
                });
            }
        }
    }
    return effects;
}

export function tickCooldowns(enemies: iEnemy[]) {
    for (const enemy of enemies) {
        for (const [moveId, cooldown] of Object.entries(enemy.cooldowns)) {
            if (cooldown > 0) {
                enemy.cooldowns[moveId]--;
            }
        }
    }
}

export function tickPlayers(state: iGameState): iEffect[] {
    const effects: iEffect[] = [];
    for (const character of state.characters) {
        character.acted = false;
        effects.push({
            type: "stance",
            actor: character,
            stance: canMove(character) ? "moving" : "standing"
        });
        character.bonusEscapes = 0;
    }
    return effects;
}

export function tickBindings(state: iGameState): iEffect[] {
    const effects: iEffect[] = [];
    for (const character of state.characters) {
        for (const binding of character.bindings) {
            if (binding.definition.onTick) {
                effects.push(...binding.definition.onTick(character, binding));
            }
        }
    }
    return effects;
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
        target => target.band !== "miss"
    );
    const effects: iEffect[] = move.definition.resolve(state, actor, move, successfulTargets);
    return effects.map(normalizeEffect);
}

function normalizeEffect(effect: iEffect): iEffect {
    switch (effect.type) {
        case "binding":
        case "damage":
        case "trap":
            return {
                ...effect,
                ...(effect.amount !== undefined ? { amount: Math.ceil(effect.amount) } : {})
            };
        default:
            return effect;
    }
}
