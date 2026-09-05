import type { iGameState, iCharacter, iEnemy, iBuff } from "./itypes";
import type { GameState, Character, Enemy, Buff } from "./types";

export function serializeGameState(state: iGameState): GameState {
  return {
    ...state,
    turn: { ...state.turn },
    characters: state.characters.map(serializeCharacter),
    enemies: state.enemies.map(serializeEnemy),
  };
}
;
function serializeCharacter(character: iCharacter): Character {
  const { definition, ...state } = character;

  return {
    ...state,
    id: definition.id,
    buffs: character.buffs.map(serializeBuff),
    bindings: character.bindings.map(binding => ({ ...binding }))
  };

}
;
function serializeEnemy(enemy: iEnemy): Enemy {
  const { definition, ...state } = enemy;
  return {
    ...state,
    buffs: enemy.buffs.map(serializeBuff)
  };
}
function serializeBuff(buff: iBuff): Buff {
  const { definition, ...state } = buff;
  return state;
}
