import type { iBinding, iBuff, iCharacter, iEnemy, iEntity, iGameState, MoveDef } from "./itypes";
import { getMoves } from "./moves";
import type { BindingId, BuffId, EntityId, EntitySide, MoveId } from "./types";

export function findCharacter(state: iGameState, id: EntityId): iCharacter | undefined {
    return state.characters.find(character => character.id === id);
}

export function findEnemy(state: iGameState, id: EntityId): iEnemy | undefined {
    return state.enemies.find(enemy => enemy.id === id);
}

export function findEntity(state: iGameState, id: EntityId): iCharacter | iEnemy | undefined {
    return findCharacter(state, id) ?? findEnemy(state, id);
}

export function findMove(entity: iEntity, id: MoveId): MoveDef | undefined {
    return getMoves(entity).find(move => move.id === id);
}

export function findBinding(entity: iCharacter, id: BindingId): iBinding | undefined {
    return entity.bindings.find(binding => binding.id === id);
}

export function findBuff(entity: iEntity, id: BuffId): iBuff[] | undefined {
    return entity.buffs.filter(buff => buff.id === id);
}

export function getIEntitySide(entity: iEntity): EntitySide {
    return (isCharacter(entity)) ? "player" : "enemy";
}

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

