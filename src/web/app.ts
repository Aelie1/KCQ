import { runBattleController, type BattleUI } from "../console/controller";
import { characterList } from "../content/content";
import type { EncounterDef } from "../engine/protected/definitions";
import { createEngine } from "../engine/public/engine";
import type { Engine, GameEvent } from "../engine/public/types";

export interface PreparedBattle {
    engine: Engine;
    encounterId: string;
    loadEvents: GameEvent[];
}

export function createBattle(encounter: EncounterDef): PreparedBattle {
    const engine = createEngine();
    const loadEvents = characterList.flatMap((character) =>
        engine.loadCharacter(character.id),
    );
    loadEvents.push(...engine.loadEncounter(encounter.id));

    return {
        engine,
        encounterId: encounter.id,
        loadEvents,
    };
}

export async function startBattle(encounter: EncounterDef, ui: BattleUI): Promise<void> {
    const battle = createBattle(encounter);
    await runBattleController(
        battle.engine,
        battle.encounterId,
        battle.loadEvents,
        ui,
    );
}
