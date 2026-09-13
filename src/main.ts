import { runConsoleClient } from "./console/client";
import { ko } from "./content/characters/ko";
import { encounterList } from "./content/content";
import { GameEngine } from "./engine/public/engine";

const encounterId = "plains_3";
const engine = new GameEngine(encounterList);
engine.loadCharacter(ko);
const loadEvents = engine.loadEncounter(encounterId);

void runConsoleClient(engine, encounterId, loadEvents).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
