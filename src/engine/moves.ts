import { getIEntitySide } from "./helpers";
import { iGameState, MoveDef, iEntity, iTargetInfo, iEffect, iCharacter, iMove } from "./itypes";

export function resolveMove(state: iGameState, move: iMove, actor: iEntity, targets: iTargetInfo[]): iEffect[] {
    const successfulTargets = targets.filter(
        target => target.result !== "miss"
    );
    const effects: iEffect[] = move.definition.resolve(state, actor, move, successfulTargets);
    return effects.map(normalizeEffect);
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
    if (targets.length !== move.targets && move.targets !== "all") {
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