import type { DifficultyId, EncounterId, Engine } from "../../engine/public/types";
import { attachBattlePageLifecycle, createBattle } from "../web/app";
import {
    createBattleTelemetryObserver,
    disabledTelemetry,
    type GameplayTelemetry,
} from "../web/telemetry";
import { runBattleController, type BattleUI } from "./controller";

export async function startBattle(
    engine: Engine,
    encounter: EncounterId,
    ui: BattleUI,
    telemetry: GameplayTelemetry = disabledTelemetry,
    release = "",
    difficulty?: DifficultyId,
): Promise<void> {
    const battle = createBattle(engine, encounter, difficulty);
    const observer = createBattleTelemetryObserver({
        telemetry,
        replayId: crypto.randomUUID(),
        release,
        encounter: battle.encounterId,
        seed: battle.engine.getSeed(),
        initialState: battle.engine.getGameState(),
        getCurrentState: () => battle.engine.getGameState(),
    });
    const detachLifecycle = attachBattlePageLifecycle(observer);
    try {
        await runBattleController(
            battle.engine,
            battle.encounterId,
            battle.loadEvents,
            ui,
            observer,
        );
    } finally {
        detachLifecycle();
    }
}
