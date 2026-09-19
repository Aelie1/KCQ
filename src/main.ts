import { runConsoleClient } from "./console/client";
import { characterList, encounterList } from "./content/content";
import { GameEngine } from "./engine/public/engine";

const encounterId = "forest_3";
const engine = new GameEngine(encounterList, characterList);
const loadEvents = engine.loadCharacter("ko");
loadEvents.push(...engine.loadCharacter("matsuko"));
loadEvents.push(...engine.loadCharacter("hinari"));
loadEvents.push(...engine.loadEncounter(encounterId));

void runConsoleClient(engine, encounterId, loadEvents).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
