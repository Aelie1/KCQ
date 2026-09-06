import type { iGameState, iCharacter, iEnemy, iBuff, iBinding } from "./itypes";
import type { GameState, Character, Enemy, Buff, Binding, GameAction } from "./types";

export function serializeGameState(state: iGameState): GameState {
    return {
        ...state,
        turn: { ...state.turn },
        characters: state.characters.map(serializeCharacter),
        enemies: state.enemies.map(serializeEnemy),
    };
}

function serializeCharacter(character: iCharacter): Character {
    const { definition, ...state } = character;

    return {
        ...state,
        id: definition.id,
        buffs: character.buffs.map(serializeBuff),
        bindings: character.bindings.map(serializeBinding)
    };

}

function serializeEnemy(enemy: iEnemy): Enemy {
    const { definition, ...state } = enemy;
    return {
        ...state,
        intention: enemy.intention ? serializeAction(enemy.intention) : null,
        buffs: enemy.buffs.map(serializeBuff)
    };
}

function serializeAction(action: GameAction): GameAction {
    return action.type === "attack"
        ? { ...action, targets: [...action.targets] }
        : { ...action };
}

function serializeBuff(buff: iBuff): Buff {
    const { definition, ...state } = buff;
    return state;
}

function serializeBinding(binding: iBinding): Binding {
    const { definition, ...state } = binding;
    return state;
}
