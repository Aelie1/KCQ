import { ko } from "./content/characters/ko";
import { encounterList } from "./content/content";
import { GameEngine } from "./engine/engine";
import { GameAction } from "./engine/types";

const actionCounts: Record<string, number> = {};

function logAction(engine: GameEngine, action: GameAction) {
    actionCounts[action.type] = (actionCounts[action.type] ?? 0) + 1;
    
    console.log("~~" + action.type + " #" + actionCounts[action.type] + "~~");
    let events = engine.executeAction(action);
    console.dir(events, { depth: null, breakLength: 200 });
}
process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
const engine = new GameEngine(encounterList);
engine.loadCharacter(ko);
console.dir(engine.loadEncounter("plains_1"));
let actions = engine.getActions("ko");
console.dir(actions, { depth: null, breakLength: 200 });
console.log("~~State~~");
console.dir(engine.getGameState(), { depth: null, breakLength: 200 });
logAction(engine, { type: "attack", actor: "ko", "move": "telekinesis", targets: ["skunkette1"] });
logAction(engine, { type: "endTurn" });
logAction(engine, { type: "attack", actor: "ko", "move": "fairypunch", targets: [] });
logAction(engine, { type: "endTurn" });
logAction(engine, { type: "attack", actor: "ko", "move": "telekinesis", targets: ["skunkette1"] });
logAction(engine, { type: "endTurn" });
logAction(engine, { type: "attack", actor: "ko", "move": "telekinesis", targets: ["skunkette2"] });
logAction(engine, { type: "endTurn" });
logAction(engine, { type: "attack", actor: "ko", "move": "telekinesis", targets: ["skunkette2"] });
logAction(engine, { type: "endTurn" });
logAction(engine, { type: "attack", actor: "ko", "move": "telekinesis", targets: ["skunkette2"] });
logAction(engine, { type: "endTurn" });
logAction(engine, { type: "escape", actor: "ko", target: "ko", binding: "latexarms" });
logAction(engine, { type: "endTurn" });
logAction(engine, { type: "escape", actor: "ko", target: "ko", binding: "latexarms" });
logAction(engine, { type: "endTurn" });
logAction(engine, { type: "escape", actor: "ko", target: "ko", binding: "latexarms" });
logAction(engine, { type: "endTurn" });
logAction(engine, { type: "escape", actor: "ko", target: "ko", binding: "latexarms" });
logAction(engine, { type: "endTurn" });


