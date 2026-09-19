import type { EncounterDef, MoveDef } from "../protected/definitions";
import { getBindingLevel } from "../protected/helpers";
import { GameStatus, getStatus } from "../protected/status";
import type { iBinding, iBuff, iCharacter, iEffect, iEnemy, iEntity, iGameState, iStatus, iTrap } from "../protected/types";
import type { Binding, Buff, Character, Effect, Encounter, Enemy, GameState, GameView, Move, Status, Trap, ValidityInfo } from "../public/types";
import { evaluateBattleState } from "./combat";
import type { iValidityInfo } from "./types";
import { getActionView } from "./view";

export function serializeGameView(state: iGameState): GameView {
    //First we cache all statuses
    const statuses = new Map<iEntity, GameStatus>();
    for (const character of state.characters) {
        statuses.set(character, new GameStatus(character));
    }
    for (const enemy of state.enemies) {
        statuses.set(enemy, new GameStatus(enemy));
    }

    return {
        ...serializeGameState(state, statuses),
        actions: getActionView(state, statuses)
    };
}

function serializeGameState(state: iGameState, statuses: Map<iEntity, GameStatus>): GameState {
    return {
        turn: {
            ...state.turn,
            outcome: evaluateBattleState(state, statuses)
        },
        characters: state.characters.map(x => serializeCharacter(x, getStatus(statuses, x))),
        enemies: state.enemies.map(enemy => serializeEnemy(enemy)),
        traps: state.traps.map(serializeTraps),
        encounter: state.encounter ? serializeEncounter(state.encounter) : null
    };
}

function serializeCharacter(character: iCharacter, status: GameStatus): Character {
    return {
        id: character.id,
        acted: character.acted,
        standing: character.standing,
        bonusEscapes: character.bonusEscapes,
        bindings: character.bindings.map(serializeBinding),
        buffs: character.buffs.filter(x => x.active).map(serializeBuff),
        modifiers: status.getModifiers(),
        blockedMoveTypes: status.getBlockedMoveTypes(),
        data: { ...character.data }
    };
}

function serializeEnemy(enemy: iEnemy): Enemy {
    return {
        id: enemy.id,
        rank: enemy.rank,
        maxHp: enemy.maxHp,
        currHp: enemy.currHp,
        currDef: enemy.currDef,
        intentions: structuredClone(enemy.preview),
        buffs: enemy.buffs.filter(x => x.active).map(serializeBuff),
        cooldowns: { ...enemy.cooldowns },
    };
}

export function serializeEffects(effects: iEffect[]): Effect[] {
    return effects.map(serializeEffect).filter(x => x !== undefined);
}

function serializeEffect(effect: iEffect): Effect | undefined {
    switch (effect.type) {
        case "binding":
            return {
                type: effect.type,
                target: effect.target.id,
                binding: effect.binding.id,
                amount: effect.amount
            };
        case "buff":
            return {
                type: effect.type,
                target: effect.target.id,
                buff: effect.buff.id,
                effects: effect.buff.modifiers,
                operation: effect.operation
            }
        case "damage":
            return {
                type: effect.type,
                target: effect.target.id,
                amount: effect.amount
            }
        case "enemy":
            return {
                type: effect.type,
                target: effect.definition.id
            }
        case "trap":
            return {
                type: effect.type,
                trap: effect.trap.id,
                amount: effect.amount
            }
        case "move":
            return {
                type: effect.type,
                move: effect.move.definition.id
            }
    }
}

function serializeBuff(buff: iBuff): Buff {
    return {
        id: buff.id,
        duration: buff.duration,
        statuses: buff.statuses?.map(serializeStatus),
        modifiers: { ...buff.modifiers },
        linkedEntity: buff.linkedEntity
    };
}

function serializeBinding(binding: iBinding): Binding {
    const level = getBindingLevel(binding);
    const status = binding.definition.status;
    return {
        id: binding.id,
        data: { ...binding.data },
        value: binding.value,
        level: level,
        status: status ? (status[level] ?? []).map(serializeStatus) : []
    };
}

function serializeTraps(trap: iTrap): Trap {
    return {
        id: trap.id,
        amount: trap.amount
    }
}

function serializeStatus(status: iStatus): Status {
    return {
        id: status.definition.id,
        value: status.value
    };
}

export function serializeMove(move: MoveDef): Move {
    return {
        id: move.id,
        targetSide: move.targetSide,
        targets: move.targets,
        type: move.type
    };
}

export function serializeValidity(info: iValidityInfo): ValidityInfo {
    const target = info.target === null ? null : info.target.id;

    if (!info.valid) {
        return {
            valid: false,
            target,
            reason: info.reason
        };
    }

    return {
        valid: true,
        target,
        accuracy: info.accuracy
    };
}

function serializeEncounter(encounter: EncounterDef): Encounter {
    return {
        id: encounter.id,
        enemies: encounter.enemies.map(x => x.id),
        bindings: encounter.bindings.map(x => x.id),
        traps: encounter.traps.map(x => x.definition.id)
    }
}