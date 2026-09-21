import { runBattleController, type BattleUI } from "../console/controller";
import { characterList } from "../content/content";
import type { EncounterDef } from "../engine/protected/definitions";
import { createEngine } from "../engine/public/engine";
import type { Engine, GameEvent } from "../engine/public/types";
import {
    createBattleTelemetryObserver,
    disabledTelemetry,
    type GameplayTelemetry,
} from "./telemetry";

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

export async function startBattle(
    encounter: EncounterDef,
    ui: BattleUI,
    telemetry: GameplayTelemetry = disabledTelemetry,
    release = "",
): Promise<void> {
    const battle = createBattle(encounter);
    const observer = createBattleTelemetryObserver({
        telemetry,
        replayId: crypto.randomUUID(),
        release,
        encounter: battle.encounterId,
        seed: battle.engine.getSeed(),
        initialView: battle.engine.getGameView(),
        getCurrentView: () => battle.engine.getGameView(),
    });
    await runBattleController(
        battle.engine,
        battle.encounterId,
        battle.loadEvents,
        ui,
        observer,
    );
}
