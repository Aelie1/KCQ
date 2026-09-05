import type { ActionInfo, ActionUnavailableReason, Character, Enemy, EntityId, GameState } from "./types";

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

  getActions( name: EntityId ): ActionInfo[] {
    const actions: ActionInfo[] = [];
    for (const character of this.state.characters) {
      if (character.definition.id === name) {
        for (const move of character.definition.moves) {
          const { activate, ...moveInfo } = move;
          let available = true;
          let reason: ActionUnavailableReason = "moveUnavailable";
          if (this.state.turn.phase !== "player") {
            available = false;
            reason = "wrongPhase";
          }
          if (character.acted) {
            available = false;
            reason = "actorAlreadyActed";
          }
          if (available) {
            actions.push({
              move: moveInfo,
              available: true
            });
          } else {
            actions.push({
              move: moveInfo,
              available: false,
              reason: reason
            });
          }
        }
      }
    }
    return actions;
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

