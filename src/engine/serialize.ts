import { resolveMove } from "./combat";
import { evaluateIntention } from "./enemies";
import { getBindingLevel } from "./helpers";
import type { iBinding, iBuff, iCharacter, iEffect, iEnemy, iGameState, iIntention, iStatus, iValidityInfo, MoveDef } from "./itypes";
import { getBlockedMoveTypes, getModifiers } from "./status";
import type { Binding, Buff, Character, Effect, Enemy, GameState, Intention, Move, Status, TargetInfo, ValidityInfo } from "./types";

export function serializeGameState(state: iGameState): GameState {
    const { nextEntityId, ..._state } = state;

    return {
        ..._state,
        turn: { ...state.turn },
        characters: state.characters.map(serializeCharacter),
        enemies: state.enemies.map(enemy => serializeEnemy(state, enemy)),
    };
}

function serializeCharacter(character: iCharacter): Character {
    const { definition, ..._character } = character;

    return {
        ..._character,
        id: definition.id,
        buffs: character.buffs.map(serializeBuff),
        bindings: character.bindings.map(serializeBinding),
        modifiers: getModifiers(character),
        blockedMoveTypes: getBlockedMoveTypes(character)
    };

}

function serializeEnemy(state: iGameState, enemy: iEnemy): Enemy {
    const { definition, ..._enemy } = enemy;
    return {
        ..._enemy,
        intention: enemy.intention ? serializeIntention(state, enemy.intention) : null,
        buffs: enemy.buffs.map(serializeBuff),
        cooldowns: {..._enemy.cooldowns},

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
        const tEffects = effects.filter(x => x.target === iTarget.target);
        targets.push({ target: iTarget.target.id, band: iTarget.band, effects: tEffects.map(serializeEffect) })
        effects = effects.filter(x => x.target !== iTarget.target);
    }

    return {
        move: intention.move.definition.id,
        targets: targets,
        effects: effects.map(serializeEffect)
    }
}

export function serializeEffect(effect: iEffect): Effect {
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
                source: effect.source.id,
                target: effect.target.id,
                amount: effect.amount
            }
        case "enemy":
            return {
                type: effect.type,
                target: effect.target.id
            }
    }
}

function serializeBuff(buff: iBuff): Buff {
    const { addedMoves, ..._buff } = buff;
    return {
        ..._buff,
        statuses: buff.statuses?.map(serializeStatus),
        modifiers: {..._buff.modifiers}
    };
}

function serializeBinding(binding: iBinding): Binding {
    const { definition, ..._binding } = binding;
    const level = getBindingLevel(binding);
    const status = definition.status;
    return {
        ..._binding,
        data: { ...binding.data },
        level: level,
        status: status ? (status[level] ?? []).map(serializeStatus) : []
    };
}

function serializeStatus(status: iStatus): Status {
    const { definition, ..._status } = status;
    return {
        ..._status,
        id: status.definition.id,
    };
}

export function serializeMove(move: MoveDef): Move {
    return {
        id: move.id,
        side: move.side,
        targets: move.targets,
        type: move.type
    };
}

export function serializeValidity(info: iValidityInfo): ValidityInfo {
    return {
        ...info,
        target: info.target === null ? null : info.target.id,
    };
}