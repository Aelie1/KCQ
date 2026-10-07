import { createSignal } from "solid-js";
import type { DifficultyId, EncounterId, Engine } from "../../../engine/public/types";
import type { BattleTelemetryObserver } from "../telemetry";
import { encounterStartRoute, type GraphicalRoute } from "./entry";

export interface GraphicalBattleSession {
    engine: Engine;
    observer?: Pick<BattleTelemetryObserver, "onAction" | "onOutcome">;
    dispose: () => void;
}

export type GraphicalScreen = Exclude<GraphicalRoute, { screen: "battle" }>
    | (Extract<GraphicalRoute, { screen: "battle" }> & { session: GraphicalBattleSession });

/** URL selection is initialization only; subsequent navigation stays inside Solid. */
export function createGraphicalController(
    initialRoute: GraphicalRoute,
    prepareBattle: (encounter: EncounterId, difficulty: DifficultyId) => GraphicalBattleSession,
) {
    let session: GraphicalBattleSession | undefined;
    const enterBattle = (route: Extract<GraphicalRoute, { screen: "battle" }>): GraphicalScreen => {
        session = prepareBattle(route.encounter, route.difficulty);
        return { ...route, session };
    };
    const [screen, setScreen] = createSignal<GraphicalScreen>(
        initialRoute.screen === "battle" ? enterBattle(initialRoute) : initialRoute,
    );

    return {
        screen,
        selectEncounter(encounter: EncounterId): void {
            if (screen().screen === "picker") setScreen({ screen: "details", encounter });
        },
        backToPicker(): void {
            const current = screen();
            if (current.screen === "details" || current.screen === "error") setScreen({ screen: "picker" });
        },
        startEncounter(): void {
            const current = screen();
            if (current.screen === "details") setScreen(enterBattle(encounterStartRoute(current.encounter)));
        },
        dispose(): void {
            session?.dispose();
            session = undefined;
        },
    };
}
