import type { Character, Enemy, GameState } from "./types";

export class GameEngine {
  private state: GameState;
  private nextEntityId = 1;

  constructor() {
    this.state = {
      turn: {round:1,step:1,phase:"player"},
      characters: [],
      enemies: []
    };
  }

  getGameState() {
      return serializeGameState(this.state);
  }

  loadCharacter( character: Character) {
    this.state.characters.push({
      definition: character, 
      acted:false,
      bindings: [],
      buffs: []
    });
  }

  loadEnemy( enemy: Enemy) {
    this.state.enemies.push({
      definition: enemy,
      buffs: [],
      id: enemy.id + this.nextEntityId++,
      currHp: enemy.hp,
      currDef: enemy.defense
    });
  }

  
}

function serializeGameState(state: GameState) {
  return {
      ...state,

      characters: state.characters.map(({ definition, ...runtime }) => ({
        id: definition.id,
        ...runtime
      })),
      enemies: state.enemies.map(({ definition, ...runtime }) => runtime),

  }
};

