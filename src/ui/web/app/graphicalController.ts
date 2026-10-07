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
    | { screen: "difficulty"; encounter: EncounterId; difficulty: DifficultyId }
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
        chooseDifficulty(): void {
            const current = screen();
            if (current.screen === "details") {
                setScreen({ screen: "difficulty", encounter: current.encounter, difficulty: DEFAULT_DIFFICULTY });
            }
        },
        selectDifficulty(difficulty: DifficultyId): void {
            const current = screen();
            if (current.screen === "difficulty") setScreen({ ...current, difficulty });
        },
        backToDetails(): void {
            const current = screen();
            if (current.screen === "difficulty") setScreen({ screen: "details", encounter: current.encounter });
        },
        startEncounter(): void {
            const current = screen();
            if (current.screen !== "difficulty") return;
            session = prepareBattle(current.encounter, current.difficulty);
            setScreen({ screen: "battle", encounter: current.encounter, difficulty: current.difficulty, session });
        },
        dispose(): void {
            session?.dispose();
            session = undefined;
        },
    };
}
