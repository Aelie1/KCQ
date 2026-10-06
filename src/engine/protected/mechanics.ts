import type { AccuracyProfile, BindingLevel, MoveId } from "../public/types";
import type { MoveDef } from "./definitions";
import { isCharacter, isEnemy } from "./helpers";
import type { iBinding, iCharacter, iEntity, iMove, iMoveResult, iTargetInfo } from "./types";

export const BINDING_MODIFIER = 0.1;
export const BASE_ESCAPE_POTENCY = 20;
export const BASE_ESCAPE_PENALTY = 15;

export function getEscapePotency(value: number, escapeModifier: number, assistModifier: number) {
    const basePotency = BASE_ESCAPE_POTENCY;
    const bindingValue = value;
    const bindingRatio = Math.min(bindingValue / thresholds.overwhelming, 1);
    const basePenalty = BASE_ESCAPE_PENALTY;
    let escapePotency = basePotency - basePenalty * Math.pow(bindingRatio, 2);
    escapePotency *= 1 + escapeModifier * BINDING_MODIFIER;
    escapePotency *= assistModifier;
    escapePotency = Math.min(value, Math.ceil(escapePotency));
    return escapePotency;
}

export function getBindingPotency(base: number, amount: number): number {
    let value = base;
    //bondage above 80 is reduced by 90%

    if (value > thresholds.overwhelming) {
        value += Math.ceil(amount * 0.1);
    } else {
        const toThreshold = Math.min(amount, thresholds.overwhelming - value);
        const overflow = amount - toThreshold;
        value += Math.ceil(toThreshold + overflow * 0.1);
    }
    if (value > thresholds.max) {
        value = thresholds.max;
    }
    return value - base;
}

export const thresholds: Record<BindingLevel, number> = {
    none: 0,
    light: 10,
    moderate: 20,
    heavy: 30,
    severe: 50,
    overwhelming: 80,
    max: 100
};

export function getBindingLevel(binding: iBinding): BindingLevel {
    if (binding.value >= thresholds.overwhelming) {
        return "overwhelming";
    }
    else if (binding.value >= thresholds.severe) {
        return "severe";
    }
    else if (binding.value >= thresholds.heavy) {
        return "heavy";
    }
    else if (binding.value >= thresholds.moderate) {
        return "moderate";
    }
    else if (binding.value >= thresholds.light) {
        return "light";
    }
    return "none";
}

export function findMove(entity: iCharacter, id: MoveId): MoveDef | undefined {
    return getMoves(entity).find(move => move.id === id);
}

export function getMoves(target: iCharacter): MoveDef[] {
    const moves: MoveDef[] = [...target.definition.moves];
    const blockedMoves: MoveDef[] = [];
    for (const buff of target.buffs) {
        if (buff.active) {
            if (buff.moveList) {
                moves.push(...(buff.moveList.addedMoves ?? []));
                blockedMoves.push(...(buff.moveList.blockedMoves ?? []));
            }
        }
    }
    return moves.filter(x => !blockedMoves.includes(x)).sort((a, b) => ((a.index ?? 99) - (b.index ?? 99)));
}

export const basicPlayerAccuracy: AccuracyProfile = {
    miss: 10,
    graze: 15,
    hit: 65,
    crit: 10
};

export function basicDamageEffect(actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
    const result: iMoveResult = { effects: [], targets: [] };
    for (const target of targets) {
        if (isEnemy(target.target) && target.effectiveness > 0) {
            result.targets.push({
                target: target.target,
                result: target.band,
                effects: [{
                    type: "damage",
                    source: actor,
                    target: target.target,
                    amount: ((move.definition.baseDamage ?? 1) * target.effectiveness)
                }]
            });
        }
    }
    return result;
}

export function basicBindingEffect(actor: iEntity, move: iMove, targets: iTargetInfo[]): iMoveResult {
    const result: iMoveResult = { effects: [], targets: [] };
    if (!move.binding) {
        return result;
    }
    for (const target of targets) {
        if (isCharacter(target.target) && target.effectiveness > 0) {
            result.targets.push({
                target: target.target,
                result: target.band,
                effects: [{
                    type: "binding",
                    source: actor,
                    target: target.target,
                    binding: move.binding,
                    amount: (move.definition.baseDamage ?? 1) * target.effectiveness
                }]
            });
        }
    }
    return result;
}
