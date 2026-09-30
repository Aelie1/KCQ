import type { DifficultyId, EncounterId, Engine, GameEvent } from "../../engine/public/types";
import { runBattleController, type BattleUI } from "../console/controller";
import {
    createBattleTelemetryObserver,
    disabledTelemetry,
    type BattleTelemetryObserver,
    type GameplayTelemetry,
} from "./telemetry";

export interface PreparedBattle {
    engine: Engine;
    encounterId: string;
    loadEvents: GameEvent[];
}

export const ENCOUNTER_DIFFICULTIES: readonly { id: DifficultyId; label: string }[] = [
    { id: "casual", label: "Casual" },
    { id: "standard", label: "Standard" },
    { id: "veteran", label: "Veteran" },
    { id: "extreme", label: "Extreme" },
    { id: "mythic", label: "Mythic" },
];

export const DEFAULT_DIFFICULTY: DifficultyId = "standard";

export function createBattle(
    engine: Engine,
    encounterId: EncounterId,
    difficulty?: DifficultyId,
): PreparedBattle {
    if (difficulty) {
        engine.setDifficulty(difficulty);
    }

    const loadEvents = engine.listCharacters().map(id =>
        engine.loadCharacter(id)
    );

    loadEvents.push(engine.loadEncounter(encounterId));

    return {
        engine,
        encounterId,
        loadEvents,
    };
}

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

export interface PageLifecycleTarget {
    addEventListener(type: "pagehide", listener: (event: PageTransitionEvent) => void): void;
    removeEventListener(type: "pagehide", listener: (event: PageTransitionEvent) => void): void;
}

export function attachBattlePageLifecycle(
    observer: BattleTelemetryObserver,
    target: PageLifecycleTarget | undefined = typeof window === "undefined" ? undefined : window,
): () => void {
    if (!target) return () => undefined;
    const onPageHide = (event: PageTransitionEvent): void => {
        observer.onPageHide({ persisted: event.persisted });
    };
    target.addEventListener("pagehide", onPageHide);
    return () => target.removeEventListener("pagehide", onPageHide);
}
