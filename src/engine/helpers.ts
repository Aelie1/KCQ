import { thresholds } from "./constants";
import type { iBinding, iCharacter, iEnemy, iEntity, iGameState, MoveDef } from "./itypes";
import type { BindingLevel, EntitySide } from "./types";

export function isValidEntity(state: iGameState, entity: iEntity): boolean {
    if (isCharacter(entity))
        return state.characters.includes(entity)
    else 
        return state.enemies.includes(entity);
}

export function isCharacter(entity: iEntity): entity is iCharacter {
    return "bindings" in entity;
}

export function isEnemy(entity: iEntity): entity is iEnemy {
    return "currHp" in entity;
}

export function getIEntitySide(entity: iEntity): EntitySide {
    return (isCharacter(entity)) ? "player" : "enemy";
}

export function getBindingLevel(binding: iBinding): BindingLevel {
    if (binding.value >= thresholds.impossible)
        return "impossible";
    else if (binding.value >= thresholds.extreme)
        return "extreme";
    else if (binding.value >= thresholds.hard)
        return "hard";
    else if (binding.value >= thresholds.medium)
        return "medium";
    else if (binding.value >= thresholds.easy)
        return "easy";
    return "none";
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
        return move.isValid(state, actor, targets);
    return true;
}

export function getMoves(target: iCharacter): MoveDef[] {
    const moves: MoveDef[] = [];
    moves.push(...target.definition.moves);
    for (const buff of target.buffs) {
        if (buff.active && buff.addedMoves) {
            moves.push(...buff.addedMoves);
        }
    }
    return moves;
}

