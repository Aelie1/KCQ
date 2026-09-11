import { evaluateIntention } from "./enemies";
import { getBindingLevel } from "./helpers";
import type { iBinding, iBuff, iCharacter, iEffect, iEnemy, iGameState, iIntention, iStatus, MoveDef } from "./itypes";
import { resolveMove } from "./combat";
import { getStatuses } from "./status";
import type { Binding, Buff, Character, Effect, Enemy, GameState, Intention, Move, Status, TargetInfo } from "./types";

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
        status: getStatuses(character).map(serializeStatus),
    };

}

function serializeEnemy(state: iGameState, enemy: iEnemy): Enemy {
    const { definition, ..._enemy } = enemy;
    return {
        ..._enemy,
        intention: enemy.intention ? serializeIntention(state, enemy.intention) : null,
        buffs: enemy.buffs.map(serializeBuff)
    };
}

function serializeIntention(state: iGameState, intention: iIntention): Intention {
    const iTargets = evaluateIntention(intention);
    const targets: TargetInfo[] = [];
    let effects = resolveMove(state, intention.move, intention.actor, iTargets);
    for (const iTarget of iTargets) {
        const tEffects = effects.filter(x => x.target === iTarget.target);
        targets.push({ target: iTarget.target.id, result: iTarget.result, effects: tEffects.map(serializeEffect) })
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
                ...effect,
                target: effect.target.id,
                binding: effect.binding.id
            };
        case "buff":
            return {
                ...effect,
                source: effect.source.id,
                target: effect.target.id,
                buff: effect.buff.id
            }
        case "damage":
            return {
                ...effect,
                source: effect.source.id,
                target: effect.target.id
            }
    }
}

function serializeBuff(buff: iBuff): Buff {
    const { addedMoves, ..._buff } = buff;
    return {
        ..._buff,
        statuses: buff.statuses?.map(serializeStatus)
    };
}

function serializeBinding(binding: iBinding): Binding {
    const { definition, ..._binding } = binding;
    return {
        ..._binding,
        data: { ...binding.data },
        level: getBindingLevel(binding),
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
        target: move.target,
        targets: move.targets,
        type: move.type
    };
}
