import { createSignal } from "solid-js";
import type { DifficultyId, EncounterId, Engine } from "../../../engine/public/types";
import type { BattleTelemetryObserver } from "../telemetry";
import { DEFAULT_DIFFICULTY } from "../app";

export interface GraphicalBattleSession {
    engine: Engine;
    observer?: Pick<BattleTelemetryObserver, "onAction" | "onOutcome">;
    dispose: () => void;
}

export type GraphicalScreen =
    | { screen: "picker" }
    | { screen: "details"; encounter: EncounterId }
    | { screen: "battle"; encounter: EncounterId; difficulty: DifficultyId; session: GraphicalBattleSession };

export function createGraphicalController(
    prepareBattle: (encounter: EncounterId, difficulty: DifficultyId) => GraphicalBattleSession,
) {
    let session: GraphicalBattleSession | undefined;
    const [screen, setScreen] = createSignal<GraphicalScreen>({ screen: "picker" });

    return {
        screen,
        selectEncounter(encounter: EncounterId): void {
            if (screen().screen === "picker") setScreen({ screen: "details", encounter });
        },
        backToPicker(): void {
            const current = screen();
            if (current.screen === "details") setScreen({ screen: "picker" });
        },
        startEncounter(): void {
            const current = screen();
            if (current.screen !== "details") return;
            // Use the shared default until the graphical difficulty selector is added.
            session = prepareBattle(current.encounter, DEFAULT_DIFFICULTY);
            setScreen({ screen: "battle", encounter: current.encounter, difficulty: DEFAULT_DIFFICULTY, session });
        },
        dispose(): void {
            session?.dispose();
            session = undefined;
        },
    };
}
