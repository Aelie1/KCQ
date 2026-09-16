import type { BindingId, BindingLevel, BuffId, EntityId, MoveId, TrapId } from "../public/types";
import type { MoveDef } from "./definitions";
import type { iBinding, iBuff, iCharacter, iEnemy, iEntity, iGameState, iTrap } from "./types";

export function isValidEntity(state: iGameState, entity: iEntity): boolean {
    if (isCharacter(entity)) {
        return state.characters.includes(entity);
    }
    else {
        return state.enemies.includes(entity);
    }
}

export function isCharacter(entity: iEntity): entity is iCharacter {
    return "bindings" in entity;
}

export function isEnemy(entity: iEntity): entity is iEnemy {
    return "currHp" in entity;
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
    const moves: MoveDef[] = [...target.definition.getMoves(target)];
    for (const buff of target.buffs) {
        if (buff.active && buff.addedMoves) {
            moves.push(...buff.addedMoves);
        }
    }
    return moves;
}

export function findCharacter(state: iGameState, id: EntityId): iCharacter | undefined {
    return state.characters.find(character => character.id === id);
}

export function findEnemy(state: iGameState, id: EntityId): iEnemy | undefined {
    return state.enemies.find(enemy => enemy.id === id);
}

export function findEntity(state: iGameState, id: EntityId): iEntity | undefined {
    return findCharacter(state, id) ?? findEnemy(state, id);
}

export function findTrap(state: iGameState, id: TrapId): iTrap | undefined {
    return state.traps.find(x => x.id == id);
}

export function findMove(entity: iCharacter, id: MoveId): MoveDef | undefined {
    return getMoves(entity).find(move => move.id === id);
}

export function findBinding(entity: iCharacter, id: BindingId): iBinding | undefined {
    return entity.bindings.find(binding => binding.id === id);
}

export function findBuff(entity: iEntity, id: BuffId): iBuff | undefined {
    return entity.buffs.find(buff => buff.id === id);
}
