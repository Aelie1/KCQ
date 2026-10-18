import { createRoot } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEngine, type KCQCampaign, type KCQCharacter } from "../../src/content";
import type { DifficultyId, EncounterId } from "../../src/engine/public/types";
import { stockCharacters } from "../../src/stock";
import { createBattle, DEFAULT_DIFFICULTY } from "../../src/ui/web/app";
import { createGraphicalController } from "../../src/ui/web/app/graphicalController";
import { createSavePackage } from "../../src/ui/web/app/savePackage";
import { createBattleResultTracker } from "../../src/ui/web/app/viewModels/battleResult";
import { createGameLogHistory } from "../../src/ui/web/app/viewModels/gameLogHistory";

beforeEach(() => vi.stubGlobal("__KCQ_GIT_REVISION__", "preferences-test"));
afterEach(() => vi.unstubAllGlobals());

function storageWith(saved: Record<string, string> = {}) {
    const values = new Map(Object.entries(saved));
    return {
        getItem: vi.fn((key: string) => values.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    };
}

function prepareBattle(campaign: KCQCampaign, encounter: EncounterId, difficulty: DifficultyId, party: readonly KCQCharacter[]) {
    const engine = createEngine(party, campaign, 12345);
    createBattle(engine, encounter, difficulty);
    return { engine, dispose: vi.fn() };
}

function openDifficulty(controller: ReturnType<typeof createGraphicalController>) {
    controller.selectCampaign("skunk"); controller.selectEncounter("plains_1"); controller.chooseDifficulty();
}

describe("battle preferences", () => {
    it("defaults without writing storage and goes straight from campaign to encounters", () => createRoot(dispose => {
        const storage = storageWith();
        const controller = createGraphicalController(prepareBattle, storage);
        expect(controller.party()).toEqual(stockCharacters);
        controller.selectCampaign("skunk");
        expect(controller.screen()).toEqual({ screen: "picker", campaign: "skunk" });
        controller.selectEncounter("plains_1"); controller.chooseDifficulty();
        expect(controller.screen()).toMatchObject({ difficulty: DEFAULT_DIFFICULTY });
        expect(storage.setItem).not.toHaveBeenCalled();
        dispose();
    }));

    it.each(["title", "picker"] as const)("commits only confirmed parties and cancels drafts back to %s", origin => createRoot(dispose => {
        const storage = storageWith({ "kcq.unlocks": '{"skunk":["plains_2"]}', "kcq.clears": '{"plains_1":"veteran"}' });
        const controller = createGraphicalController(prepareBattle, storage);
        if (origin === "picker") { controller.selectCampaign("skunk"); controller.setShowAll(true); }
        const previous = controller.screen();
        controller.changeParty();
        expect(controller.screen()).toEqual({ screen: "party", returnTo: previous });
        controller.toggleCharacter("ko"); controller.confirmParty();
        expect(controller.screen().screen).toBe("party");
        expect(controller.party()).toEqual(stockCharacters);
        expect(storage.setItem).not.toHaveBeenCalled();
        controller.cancelParty();
        expect(controller.screen()).toEqual(previous);
        controller.changeParty();
        expect(controller.draftParty()).toEqual(stockCharacters);
        controller.toggleCharacter("ko"); controller.toggleCharacter("naruyo");
        // Even a valid draft is discarded by Cancel.
        controller.cancelParty();
        expect(controller.party()).toEqual(stockCharacters);
        expect(storage.setItem).not.toHaveBeenCalled();
        controller.changeParty();
        controller.toggleCharacter("ko"); controller.toggleCharacter("sakari"); controller.confirmParty();
        expect(controller.screen()).toEqual(previous);
        expect(controller.party()).toEqual(["matsuko", "hinari", "sakari"]);
        expect(storage.setItem).toHaveBeenCalledExactlyOnceWith("kcq.party", '["matsuko","hinari","sakari"]');
        expect(controller.unlocks()).toEqual({ skunk: ["plains_2"] });
        expect(controller.bestClears()).toEqual({ plains_1: "veteran" });
        expect(controller.showAll()).toBe(origin === "picker");
        const recreated = createGraphicalController(prepareBattle, storage);
        expect(recreated.party()).toEqual(controller.party());
        expect(recreated.unlocks()).toEqual(controller.unlocks());
        expect(recreated.bestClears()).toEqual(controller.bestClears());
        dispose();
    }));

    it("persists explicit difficulty choices across navigation and controller recreation", () => createRoot(dispose => {
        const storage = storageWith();
        const controller = createGraphicalController(prepareBattle, storage);
        controller.selectDifficulty("mythic");
        expect(storage.setItem).not.toHaveBeenCalled();
        openDifficulty(controller); controller.selectDifficulty("extreme");
        controller.selectDifficulty("obsolete" as DifficultyId);
        expect(storage.setItem).toHaveBeenCalledExactlyOnceWith("kcq.difficulty", "extreme");
        controller.backToDetails(); controller.chooseDifficulty();
        expect(controller.screen()).toMatchObject({ difficulty: "extreme" });
        controller.returnToTitle(); openDifficulty(controller);
        expect(controller.screen()).toMatchObject({ difficulty: "extreme" });
        const recreated = createGraphicalController(prepareBattle, storage);
        openDifficulty(recreated);
        expect(recreated.screen()).toMatchObject({ difficulty: "extreme" });
        dispose();
    }));

    it.each(['broken', 'null', '{}', '"ko"', '[]', '["ko","hinari"]', '["ko","ko","hinari"]',
        '["ko","hinari","obsolete"]', '["ko","hinari",null]', '["ko","hinari",{}]', '["ko","hinari","matsuko","sakari"]'])
    ("falls back from malformed or obsolete party %s", saved => createRoot(dispose => {
        const controller = createGraphicalController(prepareBattle, storageWith({ "kcq.party": saved }));
        expect(controller.party()).toEqual(stockCharacters);
        dispose();
    }));

    it.each(["", "obsolete", '"standard"', "null"])("falls back from unknown difficulty %s", saved => createRoot(dispose => {
        const controller = createGraphicalController(prepareBattle, storageWith({ "kcq.difficulty": saved }));
        openDifficulty(controller);
        expect(controller.screen()).toMatchObject({ difficulty: DEFAULT_DIFFICULTY });
        dispose();
    }));

    it("keeps confirmed preferences usable when reading and writing storage throw", () => createRoot(dispose => {
        const storage = storageWith();
        storage.getItem.mockImplementation(() => { throw new Error("blocked"); });
        storage.setItem.mockImplementation(() => { throw new Error("quota"); });
        const prepare = vi.fn(prepareBattle);
        const controller = createGraphicalController(prepare, storage);
        expect(controller.party()).toEqual(stockCharacters);
        controller.changeParty(); controller.toggleCharacter("ko"); controller.toggleCharacter("naruyo"); controller.confirmParty();
        openDifficulty(controller); controller.selectDifficulty("mythic"); controller.startEncounter();
        expect(prepare).toHaveBeenCalledExactlyOnceWith("skunk", "plains_1", "mythic", ["matsuko", "hinari", "naruyo"]);
        controller.returnToTitle(); openDifficulty(controller);
        expect(controller.screen()).toMatchObject({ difficulty: "mythic" });
        controller.dispose(); dispose();
    }));

    it("resumes and retries the save configuration while retaining preferences for new battles", () => createRoot(dispose => {
        const savedParty: KCQCharacter[] = ["sakari", "ko", "naruyo"];
        const preferredParty: KCQCharacter[] = ["hinari", "matsuko", "ko"];
        const source = prepareBattle("skunk", "plains_1", "veteran", savedParty).engine;
        const state = source.getGameState();
        const save = createSavePackage(source.getSaveState(), createGameLogHistory(state).getSaveState(), createBattleResultTracker(state).getSaveState());
        const storage = storageWith({ "kcq.party": JSON.stringify(preferredParty), "kcq.difficulty": "mythic" });
        const prepare = vi.fn(prepareBattle);
        const controller = createGraphicalController(prepare, storage);
        const create = vi.fn((party: readonly KCQCharacter[]) => createEngine(party, "skunk", 999));
        expect(controller.continueBattle("skunk", save, create)).toBe(true);
        expect(create).toHaveBeenCalledExactlyOnceWith(savedParty);
        expect(create.mock.results[0]!.value.getSaveState()).toEqual(save.saveState);
        expect(controller.screen()).toMatchObject({ screen: "battle", difficulty: "veteran" });
        expect(controller.party()).toEqual(preferredParty);
        expect(storage.setItem).not.toHaveBeenCalled();
        controller.retryEncounter();
        expect(prepare).toHaveBeenNthCalledWith(1, "skunk", "plains_1", "veteran", savedParty);
        controller.returnToLevelSelect(); controller.selectEncounter("plains_2"); controller.chooseDifficulty(); controller.startEncounter();
        expect(prepare).toHaveBeenNthCalledWith(2, "skunk", "plains_2", "mythic", preferredParty);
        expect(storage.setItem).not.toHaveBeenCalled();
        controller.dispose(); dispose();
    }));
});
