import { ko } from "./content/characters/ko";
import { skunkette } from "./content/enemies/skunk/skunkette";
import { GameEngine } from "./engine/engine";

const engine = new GameEngine();
engine.loadCharacter(ko);
engine.loadEnemy(skunkette);
engine.updateIntentions();
const actions = engine.getActions("ko");
console.log("~~Actions~~");
console.dir(actions, { depth: null, breakLength: 200 });
console.log("~~State~~");
console.dir(engine.getGameState(), { depth: null, breakLength: 200 });
let events = engine.executeAction({ type: "attack", actor: "ko", "move": "telekinesis", targets: ["skunkette1"] });
console.log("~~Events: Attack #1~~");
console.dir(events, { depth: null, breakLength: 200 });
events = engine.executeAction({ type: "attack", actor: "ko", "move": "telekinesis", targets: ["skunkette1"] });
console.log("~~Events: Attack #2~~");
console.dir(events, { depth: null, breakLength: 200 });
events = engine.executeAction({ type: "endTurn" });
console.log("~~End Turn #1~~");
console.dir(events, { depth: null, breakLength: 200 });
events = engine.executeAction({ type: "attack", actor: "ko", "move": "telekinesis", targets: ["skunkette1"] });
console.log("~~Events: Attack #3~~");
console.dir(events, { depth: null, breakLength: 200 });
events = engine.executeAction({ type: "endTurn" });
console.log("~~End Turn #2~~");
console.dir(events, { depth: null, breakLength: 200 });
events = engine.executeAction({ type: "attack", actor: "ko", "move": "telekinesis", targets: ["skunkette1"] });
console.log("~~Events: Attack #4~~");
console.dir(events, { depth: null, breakLength: 200 });
console.log("~~State~~");
console.dir(engine.getGameState(), { depth: null, breakLength: 200 });
const state = engine.getGameState();

state.turn.round = 999;
state.characters[0].buffs.push({
    duration: 999,
    effect: 999
});

console.dir(engine.getGameState(), { depth: null, breakLength: 200 });