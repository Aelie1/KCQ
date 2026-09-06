import { EASY_THRESHOLD, EXTREME_THRESHOLD, HARD_THRESHOLD, IMPOSSIBLE_THRESHOLD, MEDIUM_THRESHOLD } from "./constants";
import type { iGameState, iCharacter, iEnemy, iEntity, MoveDef, iBinding } from "./itypes";
import type { EntityId, MoveId, BindingId, EntitySide, BindingLevel } from "./types";


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
    return entity.definition.moves.find(move => move.id === id);
}

export function findBinding(entity: iCharacter, id: BindingId): iBinding | undefined {
    return entity.bindings.find(binding => binding.id === id);
}


export function getEntitySide(state: iGameState, id: EntityId): EntitySide | undefined {
    if (findCharacter(state, id)) {
        return "player";
    }

    if (findEnemy(state, id)) {
        return "enemy";
    }

    return undefined;
}

export function getIEntitySide(entity: iEntity): EntitySide {
    return (isCharacter(entity)) ? "player" : "enemy";
}


export function isCharacter(entity: iCharacter | iEnemy): entity is iCharacter {
    return "bindings" in entity;
}

export function isEnemy(entity: iCharacter | iEnemy): entity is iEnemy {
    return "currHp" in entity;
}

export function getBindingLevel(binding: iBinding): BindingLevel {
    if (binding.value >= IMPOSSIBLE_THRESHOLD)
        return "impossible";
    else if (binding.value >= EXTREME_THRESHOLD)
        return "extreme";
    else if (binding.value >= HARD_THRESHOLD)
        return "hard";
    else if (binding.value >= MEDIUM_THRESHOLD)
        return "medium";
    else if (binding.value >= EASY_THRESHOLD)
        return "easy";
    return "none";
}