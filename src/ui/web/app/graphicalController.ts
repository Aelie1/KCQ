import type { KCQCampaign } from "../../../content";
import { createSignal } from "solid-js";
import type { DifficultyId, EncounterId, Engine } from "../../../engine/public/types";
import type { BattleTelemetryObserver } from "../telemetry";
import { DEFAULT_DIFFICULTY } from "../app";

export interface GraphicalBattleSession {
    engine: Engine;
    observer?: Pick<BattleTelemetryObserver, "onAction" | "onOutcome"> & Partial<Pick<BattleTelemetryObserver, "onQuit">>;
    dispose: () => void;
}

export type GraphicalScreen = { screen: "title" } | ({ campaign: KCQCampaign } & (
    | { screen: "picker" }
    | { screen: "details"; encounter: EncounterId }
    | { screen: "difficulty"; encounter: EncounterId; difficulty: DifficultyId }
    | { screen: "battle"; encounter: EncounterId; difficulty: DifficultyId; session: GraphicalBattleSession }));

export function createGraphicalController(
    prepareBattle: (campaign: KCQCampaign, encounter: EncounterId, difficulty: DifficultyId) => GraphicalBattleSession,
) {
    let session: GraphicalBattleSession | undefined;
    const [screen, setScreen] = createSignal<GraphicalScreen>({ screen: "title" });

    const closeSession = (): void => {
        if (session?.engine.getGameState().turn.outcome === "ongoing") {
            try {
                const pending = session.observer?.onQuit?.();
                if (pending) void pending.catch(() => undefined);
            } catch {
                // Telemetry must never prevent retry or navigation.
            }
        }
        session?.dispose();
        session = undefined;
    };

    return {
        screen,
        selectCampaign(campaign: KCQCampaign): void {
            if (screen().screen === "title") setScreen({ screen: "picker", campaign });
        },
        returnToTitle(): void {
            if (screen().screen !== "picker") return;
            closeSession();
            setScreen({ screen: "title" });
        },
        selectEncounter(encounter: EncounterId): void {
            const current = screen();
            if (current.screen === "picker") setScreen({ screen: "details", campaign: current.campaign, encounter });
        },
        backToPicker(): void {
            const current = screen();
            if (current.screen === "details") setScreen({ screen: "picker", campaign: current.campaign });
        },
        chooseDifficulty(): void {
            const current = screen();
            if (current.screen === "details") {
                setScreen({ screen: "difficulty", campaign: current.campaign, encounter: current.encounter, difficulty: DEFAULT_DIFFICULTY });
            }
        },
        selectDifficulty(difficulty: DifficultyId): void {
            const current = screen();
            if (current.screen === "difficulty") setScreen({ ...current, difficulty });
        },
        backToDetails(): void {
            const current = screen();
            if (current.screen === "difficulty") setScreen({ screen: "details", campaign: current.campaign, encounter: current.encounter });
        },
        startEncounter(): void {
            const current = screen();
            if (current.screen !== "difficulty") return;
            session = prepareBattle(current.campaign, current.encounter, current.difficulty);
            setScreen({ screen: "battle", campaign: current.campaign, encounter: current.encounter, difficulty: current.difficulty, session });
        },
        retryEncounter(): void {
            const current = screen();
            if (current.screen !== "battle") return;
            closeSession();
            session = prepareBattle(current.campaign, current.encounter, current.difficulty);
            setScreen({ ...current, session });
        },
        returnToLevelSelect(): void {
            const current = screen();
            if (current.screen !== "battle") return;
            closeSession();
            setScreen({ screen: "picker", campaign: current.campaign });
        },
        dispose(): void {
            closeSession();
        },
    };
}
