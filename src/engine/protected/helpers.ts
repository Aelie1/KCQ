import type { BindingId, BindingLevel, BuffId, EntityId, MoveId, TrapId } from "../public/types";
import type { BindingDef, MoveDef } from "./definitions";
import { Random } from "./random";
import { isIncapacitated } from "./status";
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
    const moves: MoveDef[] = [];
    moves.push(...target.definition.moves);
    for (const buff of target.buffs) {
        if (buff.active && buff.addedMoves) {
            moves.push(...buff.addedMoves);
        }
    }
    return moves;
}

export function getValidTargets(characters: iCharacter[]): iCharacter[] {
    const validCharacters: iCharacter[] = [];
    for (const character of characters) {
        if (!isIncapacitated(character)) {
            validCharacters.push(character);
        }
    }
    return validCharacters;
}

export function pickTarget(characters: iCharacter[], rng: Random): iCharacter | undefined {
    const validCharacters = getValidTargets(characters);

    if (validCharacters.length === 0) {
        return undefined;
    }

    const index = rng.int(0, validCharacters.length - 1);
    return validCharacters[index];
}

export function pickBinding(target: iCharacter, bindings: BindingDef[], rng: Random): BindingDef | undefined {
    const validMoves: BindingDef[] = [];
    for (const binding of bindings) {
        const tBinding = findBinding(target, binding.id);
        if (tBinding && tBinding.value >= thresholds.impossible) {
            continue;
        }
        validMoves.push(binding);
    }

    if (validMoves.length === 0) {
        return undefined;
    }

    const index = rng.int(0, validMoves.length - 1);
    return validMoves[index];
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