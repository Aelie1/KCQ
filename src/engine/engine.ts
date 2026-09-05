import type { CharacterDefinition, GameState } from "./types";

export class GameEngine {
  private state: GameState;

  constructor() {
    this.state = {
      metadata: {round:1,step:1,phase:"player"},
      characters: [],
      enemies: []
    };
  }

  getGameState(): GameState {
      return this.state;
  }

  loadCharacter( character: CharacterDefinition) {
    this.state.characters.push({
      definition: character, 
      acted:false,
      bindingTracks: []
    });
  }
}

