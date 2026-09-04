import type { GameState } from "./types";

function createGameState(): GameState {
  return {
    metadata: {round:1,step:1,phase:"player"},
    characters: [],
    enemies: []
  };
}


