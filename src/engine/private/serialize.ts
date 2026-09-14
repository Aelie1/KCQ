import type { EncounterDef, MoveDef } from "../protected/definitions";
import { getBindingLevel } from "../protected/helpers";
import { getBlockedMoveTypes, getModifiers } from "../protected/status";
import type { iBinding, iBuff, iCharacter, iEffect, iEnemy, iGameState, iIntention, iStatus, iTrap } from "../protected/types";
import type { Binding, Buff, Character, Effect, Encounter, Enemy, GameState, Intention, Move, Status, TargetInfo, Trap, ValidityInfo } from "../public/types";
import { evaluateIntention, resolveMove } from "./combat";
import type { iValidityInfo } from "./types";

export function serializeGameState(state: iGameState): GameState {
    return {
        turn: { ...state.turn },
        characters: state.characters.map(serializeCharacter),
        enemies: state.enemies.map(enemy => serializeEnemy(state, enemy)),
        traps: state.traps.map(serializeTraps)
    };
}

function serializeCharacter(character: iCharacter): Character {
    return {
        id: character.id,
        acted: character.acted,
        standing: character.standing,
        bonusEscapes: character.bonusEscapes,
        bindings: character.bindings.map(serializeBinding),
        buffs: character.buffs.filter(x => x.active).map(serializeBuff),
        modifiers: getModifiers(character),
        blockedMoveTypes: getBlockedMoveTypes(character),
    };
}

function serializeEnemy(state: iGameState, enemy: iEnemy): Enemy {
    return {
        id: enemy.id,
        maxHp: enemy.maxHp,
        currHp: enemy.currHp,
        currDef: enemy.currDef,
        intention: enemy.intention.map(x => serializeIntention(state, x)),
        buffs: enemy.buffs.filter(x => x.active).map(serializeBuff),
        cooldowns: { ...enemy.cooldowns },
    };
}

function serializeIntention(state: iGameState, intention: iIntention): Intention {
    const preview = {
        ...intention,
        move: { ...intention.move }
    };
    const iTargets = evaluateIntention(state, preview);
    const targets: TargetInfo[] = [];
    let effects = resolveMove(state, preview.move, preview.actor, iTargets);
    for (const iTarget of iTargets) {
        const tEffects = effects.filter(x => "target" in x && x.target === iTarget.target);
        targets.push({ target: iTarget.target.id, band: iTarget.band, effects: serializeEffects(tEffects) });
        effects = effects.filter(x => !("target" in x) || x.target !== iTarget.target);
    }

    return {
        move: intention.move.definition.id,
        targets: targets,
        effects: serializeEffects(effects)
    }
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

export function serializeEncounter(encounter: EncounterDef): Encounter {
    return {
        id: encounter.id,
        enemies: encounter.enemies.map(x => x.id),
        bindings: encounter.bindings.map(x => x.id),
        traps: encounter.traps.map(x => x.definition.id)
    }
}