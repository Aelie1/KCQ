import { runBattleController, type BattleUI } from "../console/controller";
import type { EncounterId, Engine, GameEvent } from "../engine/public/types";
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

export function createBattle(engine: Engine, encounterId: EncounterId): PreparedBattle {

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
): Promise<void> {
    const battle = createBattle(engine, encounter);
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
