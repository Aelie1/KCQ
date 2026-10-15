import type { KCQCampaign } from "../../../content";
import { createSignal } from "solid-js";
import type { CampaignReference, ContentLibrary } from "../../../engine/public/library";
import type { DifficultyId, EncounterId, Engine } from "../../../engine/public/types";
import type { BattleTelemetryObserver } from "../telemetry";
import { DEFAULT_DIFFICULTY, ENCOUNTER_DIFFICULTIES } from "../app";
import { loadEncounterClears, saveEncounterClears, type EncounterClears } from "./encounterClears";
import { loadCampaignUnlocks, saveCampaignUnlocks, type CampaignUnlocks } from "./campaignUnlocks";
import { getNextEncounter } from "./nextEncounter";
import type { SavePackage } from "./savePackage";

export interface GraphicalBattleSession {
    engine: Engine;
    saved?: Pick<SavePackage, "gameLog" | "stats">;
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

    const openDetails = (campaignId: KCQCampaign, encounter: EncounterId, library: ContentLibrary | undefined): void => {
        setScreen({ screen: "details", campaign: campaignId, encounter });
        const campaign = library?.campaigns[campaignId];
        if (library?.encounters[encounter]?.stars === 0 && campaign) unlockEncounter(campaign, encounter, "victory");
    };

    const nextEncounter = (): EncounterId | undefined => {
        const current = screen();
        if (current.screen === "battle" && session) {
            const outcome = session.engine.getGameState().turn.outcome;
            return outcome === "ongoing" ? undefined : getNextEncounter(session.engine.getLibrary(), current.campaign, current.encounter, outcome);
        }
        if (current.screen === "details") {
            const library = getLibrary?.();
            if (library?.encounters[current.encounter]?.stars === 0) {
                return getNextEncounter(library, current.campaign, current.encounter, "victory");
            }
        }
        return undefined;
    };

    return {
        screen,
        bestClears,
        unlocks,
        showAll,
        setShowAll,
        nextEncounter,
        continueBattle(campaign: KCQCampaign, save: SavePackage, createEngine: () => Engine): boolean {
            if (screen().screen !== "title") return false;
            let restored: GraphicalBattleSession;
            const { encounter, difficulty } = save.saveState;
            try {
                if (save.saveState.campaign !== campaign || !encounter || save.stats.terminal) return false;
                const engine = createEngine();
                // Do not run encounter/character setup or attach fresh-run telemetry.
                engine.loadSaveState(save.saveState);
                const state = engine.getGameState();
                if (state.turn.outcome !== "ongoing" || state.encounter?.id !== encounter) return false;
                restored = { engine, saved: save, dispose: () => {} };
            } catch {
                // Commit the session and screen only after restoration succeeds.
                return false;
            }
            session = restored;
            outcomeRecorded = false;
            setScreen({ screen: "battle", campaign, encounter, difficulty, session });
            return true;
        },
        nextLevel(): void {
            const current = screen();
            const next = nextEncounter();
            if (!next || (current.screen !== "battle" && current.screen !== "details")) return;
            const library = current.screen === "battle" ? current.session.engine.getLibrary() : getLibrary?.();
            closeSession();
            openDetails(current.campaign, next, library);
        },
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
            openDetails(current.campaign, encounter, getLibrary?.());
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
