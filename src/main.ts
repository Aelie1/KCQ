import { ko } from "./content/characters/ko";
import { GameEngine } from "./engine/engine";

const engine = new GameEngine();
engine.loadCharacter(ko);
console.dir(engine.getGameState(), { depth: null });