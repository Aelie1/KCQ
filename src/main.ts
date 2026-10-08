import { createStockEngine } from "./stock";

const encounterId = "forest_3";
const engine = createStockEngine();
// const loadEvents: GameEvent[] = [];
// loadEvents.push(engine.loadCharacter("ko"));
// loadEvents.push(engine.loadCharacter("matsuko"));
// loadEvents.push(engine.loadCharacter("hinari"));
// loadEvents.push(engine.loadEncounter(encounterId));

console.dir(engine.getLibrary(), {
    depth: null,
    colors: true,
});
