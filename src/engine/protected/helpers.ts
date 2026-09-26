import type { BindingId, BuffId, EntityId, MoveId, TrapId } from "../public/types";
import { type MoveDef } from "./definitions";
import { getMoves } from "./mechanics";
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

