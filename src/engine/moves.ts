import { getIEntitySide } from "./helpers";
import { iGameState, MoveDef, iEntity, iTargetInfo, iEffect, iCharacter } from "./itypes";

export function resolveMove(state: iGameState, move: MoveDef, actor: iEntity, targets: iTargetInfo[]): iEffect[] {
    const successfulTargets = targets.filter(
        target => target.result !== "miss"
    );
    if (successfulTargets.length > 0) {
        const effects: iEffect[] = move.resolve(state, actor, successfulTargets);
        return effects.map(normalizeEffect);
    }
    else {
        return [];
    }
}

export function normalizeEffect(effect: iEffect): iEffect {
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

export function isValidMove(state: iGameState, actor: iEntity, targets: iEntity[], move: MoveDef): boolean {
    if (targets.length !== move.targets) {
        return false;
    }
    for (const target of targets) {
        if (getIEntitySide(target) !== move.target) {
            return false;
        }
    }
    if (move.isValid)
        return move.isValid(state, actor, targets)
    return true;
}

export function getMoves(target: iCharacter) : MoveDef[] {
    const moves: MoveDef[] = [];
    moves.push(...target.definition.moves);
    for (const buff of target.buffs) {
        if (buff.addedMoves) {
            moves.push(...buff.addedMoves);
        }
    }
    return moves;
}