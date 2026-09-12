import { runConsoleClient } from "./console/client";
import { formatEvents } from "./console/format";
import { ko } from "./content/characters/ko";
import { encounterList } from "./content/content";
import { GameEngine } from "./engine/engine";

const encounterId = "plains_1";
const engine = new GameEngine(encounterList);
engine.loadCharacter(ko);
const loadEvents = engine.loadEncounter(encounterId);

void runConsoleClient(engine, encounterId, formatEvents(loadEvents)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
