import { calculateAccuracy, evaluateIntention, evaluateResult } from "./combat";
import { getBindingLevel } from "./helpers";
import type { iBinding, iBuff, iCharacter, iEnemy, iGameState, iIntention, iStatus, iTargetInfo, MoveDef } from "./itypes";
import { getStatuses } from "./status";
import type { Binding, Buff, Character, Enemy, PlayerAction, GameState, Move, Status, Intention, TargetInfo } from "./types";

export function serializeGameState(state: iGameState): GameState {
    const { nextEntityId, ..._state } = state;

    return {
        ..._state,
        turn: { ...state.turn },
        characters: state.characters.map(serializeCharacter),
        enemies: state.enemies.map(serializeEnemy),
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

function serializeEnemy(enemy: iEnemy): Enemy {
    const { definition, ..._enemy } = enemy;
    return {
        ..._enemy,
        intention: enemy.intention ? serializeIntention(enemy.intention) : null,
        buffs: enemy.buffs.map(serializeBuff)
    };
}

function serializeIntention(intention: iIntention): Intention {
    return {
        move: intention.action.move.id,
        targets: evaluateIntention(intention).map(serializeTarget)
    }
}

function serializeTarget(target: iTargetInfo): TargetInfo {
    return {
        ...target,
        target: target.target.id,
    }
}

function serializeBuff(buff: iBuff): Buff {
    const { ..._buff } = buff;
    return {
        ..._buff,
        statuses: buff.statuses.map(serializeStatus)
    };
}

function serializeBinding(binding: iBinding): Binding {
    const { definition, ..._binding } = binding;
    return {
        ..._binding,
        state: { ...binding.state },
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
