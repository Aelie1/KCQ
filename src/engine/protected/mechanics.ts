import type { AccuracyProfile, BindingLevel } from "../public/types";
import type { MoveDef } from "./definitions";
import { isCharacter, isEnemy } from "./helpers";
import type { iBinding, iCharacter, iEntity, iMove, iMoveResult, iTargetInfo } from "./types";

export const BINDING_MODIFIER = 0.1;
export const BASE_ESCAPE_POTENCY = 20;
export const BASE_ESCAPE_PENALTY = 15;

export function getEscapePotency(value: number, escapeModifier: number, assistModifier: number) {
    const basePotency = BASE_ESCAPE_POTENCY;
    const bindingValue = value;
    const bindingRatio = Math.min(bindingValue / thresholds.impossible, 1);
    const basePenalty = BASE_ESCAPE_PENALTY;
    let escapePotency = basePotency - basePenalty * Math.pow(bindingRatio, 2);
    escapePotency *= 1 + escapeModifier * BINDING_MODIFIER;
    escapePotency *= assistModifier;
    escapePotency = Math.min(value, Math.ceil(escapePotency));
    return escapePotency;
}

export const thresholds: Record<BindingLevel, number> = {
    none: 0,
    easy: 10,
    medium: 20,
    hard: 30,
    extreme: 50,
    impossible: 80,
    max: 100
};

export function getBindingLevel(binding: iBinding): BindingLevel {
    if (binding.value >= thresholds.impossible) {
        return "impossible";
    }
    else if (binding.value >= thresholds.extreme) {
        return "extreme";
    }
    else if (binding.value >= thresholds.hard) {
        return "hard";
    }
    else if (binding.value >= thresholds.medium) {
        return "medium";
    }
    else if (binding.value >= thresholds.easy) {
        return "easy";
    }
    return "none";
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
