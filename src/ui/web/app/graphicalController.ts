import type { KCQCampaign } from "../../../content";
import { createSignal } from "solid-js";
import type { CampaignReference, ContentLibrary } from "../../../engine/public/library";
import type { DifficultyId, EncounterId, Engine } from "../../../engine/public/types";
import type { BattleTelemetryObserver } from "../telemetry";
import { DEFAULT_DIFFICULTY, ENCOUNTER_DIFFICULTIES } from "../app";
import { loadEncounterClears, saveEncounterClears, type EncounterClears } from "./encounterClears";
import { loadCampaignUnlocks, saveCampaignUnlocks, type CampaignUnlocks } from "./campaignUnlocks";

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
    storage?: Pick<Storage, "getItem" | "setItem">,
    getLibrary?: () => ContentLibrary | undefined,
) {
    let session: GraphicalBattleSession | undefined;
    let outcomeRecorded = false;
    const [bestClears, setBestClears] = createSignal<EncounterClears>(loadEncounterClears(storage));
    const [unlocks, setUnlocks] = createSignal<CampaignUnlocks>(loadCampaignUnlocks(storage));
    const [showAll, setShowAll] = createSignal(false);
    const [screen, setScreen] = createSignal<GraphicalScreen>({ screen: "title" });

    const unlockEncounter = (campaign: CampaignReference, encounter: EncounterId, outcome: "victory" | "defeat"): void => {
        const saved = unlocks()[campaign.id] ?? [];
        const available = new Set([...campaign.initial, ...saved]);
        const added = (campaign[outcome][encounter] ?? []).filter(id => !available.has(id));
        if (added.length === 0) return;
        const updated = { ...unlocks(), [campaign.id]: [...new Set([...saved, ...added])] };
        setUnlocks(updated);
        saveCampaignUnlocks(updated, storage);
    };

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
        bestClears,
        unlocks,
        showAll,
        setShowAll,
        recordOutcome(): void {
            const current = screen();
            if (current.screen !== "battle" || !session || outcomeRecorded) return;
            const outcome = session.engine.getGameState().turn.outcome;
            if (outcome === "ongoing") return;
            outcomeRecorded = true;
            const campaign = session.engine.getLibrary().campaigns[current.campaign];
            if (campaign) unlockEncounter(campaign, current.encounter, outcome);
            if (outcome !== "victory") return;
            const rank = (difficulty: DifficultyId | undefined) => ENCOUNTER_DIFFICULTIES.findIndex(({ id }) => id === difficulty);
            if (rank(current.difficulty) <= rank(bestClears()[current.encounter])) return;
            const updated = { ...bestClears(), [current.encounter]: current.difficulty };
            setBestClears(updated);
            saveEncounterClears(updated, storage);
        },
        selectCampaign(campaign: KCQCampaign): void {
            if (screen().screen === "title") {
                setShowAll(false);
                setScreen({ screen: "picker", campaign });
            }
        },
        returnToTitle(): void {
            if (screen().screen === "title") return;
            closeSession();
            setScreen({ screen: "title" });
        },
        selectEncounter(encounter: EncounterId): void {
            const current = screen();
            if (current.screen !== "picker") return;
            const library = getLibrary?.();
            const campaign = library?.campaigns[current.campaign];
            setScreen({ screen: "details", campaign: current.campaign, encounter });
            if (library?.encounters[encounter]?.stars === 0 && campaign) unlockEncounter(campaign, encounter, "victory");
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
            outcomeRecorded = false;
            setScreen({ screen: "battle", campaign: current.campaign, encounter: current.encounter, difficulty: current.difficulty, session });
        },
        retryEncounter(): void {
            const current = screen();
            if (current.screen !== "battle") return;
            closeSession();
            session = prepareBattle(current.campaign, current.encounter, current.difficulty);
            outcomeRecorded = false;
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
