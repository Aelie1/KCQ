import { ko } from "./content/characters/ko";
import { skunkette } from "./content/enemies/skunk/skunkette";
import { GameEngine } from "./engine/engine";

const engine = new GameEngine();
engine.loadCharacter(ko);
engine.loadEnemy(skunkette);
const actions = engine.getActions("ko");
console.log("~~Actions~~");
console.dir(actions);
console.log("~~State~~");
console.dir(engine.getGameState(), { depth: null });