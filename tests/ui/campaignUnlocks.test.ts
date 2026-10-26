import { createRoot } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KCQCampaign } from "../../src/content";
import type { CampaignReference } from "../../src/engine/public/library";
import type { BattleState, DifficultyId, EncounterId } from "../../src/engine/public/types";
import { createStockEngine } from "../../src/stock";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createBattle } from "../../src/ui/web/app";
import { loadCampaignUnlocks } from "../../src/ui/web/app/campaignUnlocks";
import { createGraphicalController } from "../../src/ui/web/app/graphicalController";
import { createEncounterPickerViewModel } from "../../src/ui/web/app/viewModels/encounters";
import { stockStrings } from "../helpers/stockStrings";

const library = createStockEngine().getLibrary();
const campaign = library.campaigns.skunk;
const presentation = new Presentation(stockStrings);
const disposers: (() => void)[] = [];
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); vi.restoreAllMocks(); });

function storageWith(saved: Record<string, string> = {}) {
    const values = new Map(Object.entries(saved));
    return {
        getItem: vi.fn((key: string) => values.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    };
}

function unlockedStorage(ids: string[], saved: Record<string, string> = {}) {
    return storageWith({ "kcq.unlocks": JSON.stringify({ skunk: ids }), ...saved });
}

function setup(storage = storageWith(), campaigns: Record<string, CampaignReference> = library.campaigns) {
    let outcome: BattleState = "ongoing";
    const prepare = vi.fn((_campaign: KCQCampaign, encounter: EncounterId, difficulty: DifficultyId) => {
        outcome = "ongoing";
        const engine = createStockEngine(12345);
        createBattle(engine, encounter, difficulty);
        vi.spyOn(engine, "getLibrary").mockReturnValue({ ...library, campaigns });
        const initial = engine.getGameState();
        vi.spyOn(engine, "getGameState").mockImplementation(() => ({ ...initial, turn: { ...initial.turn, outcome } }));
        return { engine, dispose: vi.fn(), observer: { onQuit: vi.fn() } };
    });
    const controller = createRoot(dispose => {
        disposers.push(() => { controller.dispose(); dispose(); });
        return createGraphicalController(prepare, storage, () => ({ ...library, campaigns }));
    });
    const start = (encounter: EncounterId, difficulty: DifficultyId = "standard", id: KCQCampaign = "skunk") => {
        controller.selectCampaign(id); controller.confirmParty();
        controller.selectEncounter(encounter);
        controller.chooseDifficulty();
        controller.selectDifficulty(difficulty);
        controller.startEncounter();
    };
    const visible = () => createEncounterPickerViewModel(library, presentation, campaign,
        controller.bestClears(), controller.unlocks().skunk ?? [], controller.showAll()).encounters.filter(encounter => !encounter.locked).map(({ id }) => id);
    return { controller, prepare, storage, start, visible,
        finish(value: BattleState) { outcome = value; controller.recordOutcome(); } };
}

describe("campaign encounter unlocks", () => {
    it.each([
        ["plains_1", "victory", "plains_2"], ["plains_3", "victory", "interlude_1"],
        ["forest_3", "victory", "interlude_2"], ["tower_1", "victory", campaign.victory.tower_1[0]],
        ["tower_2", "victory", campaign.victory.tower_2[0]], ["tower_3", "victory", "interlude_3"],
        ["tower_1", "defeat", "tower_2"], ["tower_2", "defeat", "tower_3"],
    ] as const)("advances from %s %s to %s details and disposes only the completed session", (encounter, outcome, next) => {
        const app = setup(unlockedStorage([encounter])); app.start(encounter); app.finish(outcome);
        const first = app.prepare.mock.results[0]!.value;
        const clears = app.controller.bestClears();
        expect(app.controller.nextEncounter()).toBe(next);
        app.controller.nextLevel();
        expect(app.controller.screen()).toEqual({ screen: "details", campaign: "skunk", encounter: next });
        expect(app.prepare).toHaveBeenCalledTimes(1);
        expect(first.dispose).toHaveBeenCalledOnce();
        expect(first.observer.onQuit).not.toHaveBeenCalled();
        expect(app.controller.bestClears()).toEqual(clears);
        if (library.encounters[next].stars === 0) {
            for (const unlocked of campaign.victory[next]) expect(app.controller.unlocks().skunk).toContain(unlocked);
            expect(app.controller.bestClears()[next]).toBeUndefined();
        }
        app.controller.dispose(); expect(first.dispose).toHaveBeenCalledOnce();
    });

    it.each(["prologue", "interlude_1", "interlude_2", "interlude_3", "epilogue"])("advances the story %s without starting combat or selecting difficulty", story => {
        const app = setup(unlockedStorage([story])); app.controller.selectCampaign("skunk"); app.controller.confirmParty(); app.controller.selectEncounter(story);
        const next = campaign.victory[story][0];
        expect(app.controller.nextEncounter()).toBe(next);
        app.controller.nextLevel();
        expect(app.controller.screen()).toEqual({ screen: "details", campaign: "skunk", encounter: next });
        expect(app.prepare).not.toHaveBeenCalled();
        expect(app.controller.bestClears()).toEqual({});
        if (next === "epilogue") expect(app.controller.unlocks().skunk).toContain("outside");
    });

    it.each(["ongoing", "defeat", "victory"] as const)("does not advance Outside on %s without an applicable next encounter", outcome => {
        const app = setup(); app.start("outside"); app.finish(outcome);
        const current = app.controller.screen();
        expect(app.controller.nextEncounter()).toBeUndefined();
        app.controller.nextLevel();
        expect(app.controller.screen()).toBe(current);
        expect(app.prepare.mock.results[0]!.value.dispose).not.toHaveBeenCalled();
    });

    it("requires a valid first unlock instead of skipping to a later valid ID", () => {
        const app = setup(storageWith(), { skunk: { ...campaign, victory: { prologue: ["missing", "plains_1"], plains_1: ["missing", "plains_2"] } } });
        app.controller.selectCampaign("skunk"); app.controller.confirmParty(); app.controller.selectEncounter("prologue");
        expect(app.controller.nextEncounter()).toBeUndefined();
        app.controller.nextLevel();
        expect(app.controller.screen()).toEqual({ screen: "details", campaign: "skunk", encounter: "prologue" });
        app.controller.backToPicker(); app.start("plains_1"); app.finish("victory");
        expect(app.controller.nextEncounter()).toBeUndefined();
    });

    it("preserves the selected campaign and Show All when advancing", () => {
        const alternate = "alternate" as KCQCampaign;
        const app = setup(storageWith(), { ...library.campaigns, alternate: { id: alternate, initial: ["prologue"], victory: { prologue: ["outside"] }, defeat: {} } });
        app.controller.selectCampaign(alternate); app.controller.confirmParty(); app.controller.setShowAll(true); app.controller.selectEncounter("prologue");
        app.controller.nextLevel();
        expect(app.controller.screen()).toEqual({ screen: "details", campaign: alternate, encounter: "outside" });
        expect(app.controller.showAll()).toBe(true);
        expect(app.controller.unlocks()).toEqual({ alternate: ["outside"] });
    });

    it.each([
        ["prologue", "plains_1"], ["interlude_1", "forest_1"], ["interlude_2", "tower_1"],
        ["interlude_3", "epilogue"], ["epilogue", "outside"],
    ])("opening %s immediately unlocks %s without combat or repeated writes", (story, next) => {
        const savedClears = { plains_1: "mythic" };
        const app = setup(story === "prologue" ? storageWith({ "kcq.clears": JSON.stringify(savedClears) })
            : unlockedStorage([story], { "kcq.clears": JSON.stringify(savedClears) }));
        app.controller.selectCampaign("skunk"); app.controller.confirmParty();
        app.controller.selectEncounter(story);
        expect(app.controller.screen()).toEqual({ screen: "details", campaign: "skunk", encounter: story });
        expect(app.controller.unlocks()).toEqual({ skunk: [...(story === "prologue" ? [] : [story]), next] });
        expect(app.controller.bestClears()).toEqual(savedClears);
        expect(app.prepare).not.toHaveBeenCalled();
        expect(app.storage.setItem).toHaveBeenCalledExactlyOnceWith("kcq.unlocks", JSON.stringify({ skunk: [...(story === "prologue" ? [] : [story]), next] }, null, 2));
        app.controller.backToPicker(); app.controller.selectEncounter(story);
        expect(app.controller.unlocks()).toEqual({ skunk: [...(story === "prologue" ? [] : [story]), next] });
        expect(app.storage.setItem).toHaveBeenCalledTimes(1);
        expect(setup(app.storage).controller.unlocks()).toEqual({ skunk: [...(story === "prologue" ? [] : [story]), next] });
    });

    it("preserves old unlocks across the revised graph and adds story unlocks cumulatively", () => {
        const saved = { skunk: ["plains_1", "interlude_1", "forest_1", "tower_3", "outside", "interlude_2"], alternate: ["old"] };
        const app = setup(storageWith({ "kcq.unlocks": JSON.stringify(saved) }));
        expect(app.controller.unlocks()).toEqual(saved);
        expect(app.storage.setItem).not.toHaveBeenCalled();
        app.controller.selectCampaign("skunk"); app.controller.confirmParty(); app.controller.selectEncounter("interlude_1");
        expect(app.storage.setItem).not.toHaveBeenCalled();
        app.controller.backToPicker(); app.controller.selectEncounter("interlude_2");
        expect(app.controller.unlocks()).toEqual({ ...saved, skunk: [...saved.skunk, "tower_1"] });
        expect(setup(app.storage).controller.unlocks()).toEqual(app.controller.unlocks());
    });

    it("uses stars and the selected campaign's public story rules instead of known story IDs", () => {
        const alternate = "alternate" as KCQCampaign;
        const changed = { ...library, encounters: { ...library.encounters, forest_1: { ...library.encounters.forest_1, stars: 0 } },
            campaigns: { ...library.campaigns, alternate: { id: alternate, initial: ["forest_1"], victory: { forest_1: ["plains_3"] }, defeat: {} } } };
        const storage = storageWith(); const prepare = vi.fn();
        const controller = createRoot(dispose => {
            disposers.push(dispose);
            return createGraphicalController(prepare, storage, () => changed);
        });
        controller.selectCampaign(alternate); controller.confirmParty(); controller.selectEncounter("forest_1");
        expect(controller.unlocks()).toEqual({ alternate: ["plains_3"] });
        expect(controller.bestClears()).toEqual({});
        expect(prepare).not.toHaveBeenCalled();
    });

    it("keeps combat victories behind the Interlude and Epilogue gates", () => {
        const app = setup(unlockedStorage(["plains_3", "forest_3", "tower_3"]));
        app.start("plains_3"); app.finish("victory"); app.controller.returnToLevelSelect();
        expect(app.visible()).toEqual(["prologue", "plains_3", "interlude_1", "forest_3", "tower_3"]);
        app.controller.selectEncounter("interlude_1"); app.controller.backToPicker();
        expect(app.visible()).toEqual(["prologue", "plains_3", "interlude_1", "forest_1", "forest_3", "tower_3"]);
        app.start("forest_3"); app.finish("victory"); app.controller.returnToLevelSelect();
        expect(app.controller.unlocks().skunk).not.toContain("tower_1");
        app.controller.selectEncounter("interlude_2"); app.controller.backToPicker();
        expect(app.controller.unlocks().skunk).toContain("tower_1");
        app.start("tower_3"); app.finish("victory"); app.controller.returnToLevelSelect();
        expect(app.controller.unlocks().skunk).not.toContain("epilogue");
        expect(app.controller.unlocks().skunk).not.toContain("outside");
        app.controller.selectEncounter("interlude_3"); app.controller.backToPicker();
        expect(app.controller.unlocks().skunk).toContain("epilogue");
        expect(app.controller.unlocks().skunk).not.toContain("outside");
        app.controller.selectEncounter("epilogue");
        expect(app.controller.unlocks().skunk).toContain("outside");
    });

    it("includes initial encounters on a fresh save without writing storage, including story-only entries", () => {
        const app = setup();
        expect(campaign.initial).toEqual(["prologue"]);
        expect(app.visible()).toEqual(["prologue"]);
        expect(app.controller.showAll()).toBe(false);
        expect(app.storage.setItem).not.toHaveBeenCalled();
    });

    it.each(["casual", "standard", "veteran", "extreme", "mythic"] as const)("uses authored victory rules at %s independently of clears", difficulty => {
        const app = setup(unlockedStorage(["plains_1"], { "kcq.clears": '{"plains_1":"mythic"}' }));
        app.start("plains_1", difficulty); app.finish("victory");
        expect(app.controller.unlocks()).toEqual({ skunk: ["plains_1", ...campaign.victory.plains_1] });
        expect(app.visible()).toEqual(["prologue", "plains_1", "plains_2"]);
        expect(app.controller.bestClears()).toEqual({ plains_1: "mythic" });
        expect(app.storage.setItem.mock.calls.filter(([key]) => key === "kcq.unlocks"))
            .toEqual([["kcq.unlocks", JSON.stringify({ skunk: ["plains_1", "plains_2"] }, null, 2)]]);
    });

    it("accumulates Tower defeat unlocks and restores them in a new controller", () => {
        const app = setup(unlockedStorage(["tower_1"]));
        app.start("tower_1"); app.finish("defeat");
        expect(app.controller.unlocks()).toEqual({ skunk: ["tower_1", ...campaign.defeat.tower_1] });
        app.controller.returnToLevelSelect();
        app.start("tower_2", "mythic"); app.finish("defeat");
        expect(app.controller.unlocks()).toEqual({ skunk: ["tower_1", "tower_2", "tower_3"] });
        expect(app.controller.bestClears()).toEqual({});
        expect(app.storage.getItem("kcq.clears")).toBeNull();
        const restored = setup(app.storage);
        expect(restored.visible()).toEqual(["prologue", "tower_1", "tower_2", "tower_3"]);
    });

    it("handles duplicate callbacks and repeated battles without duplicate IDs or storage writes", () => {
        const app = setup(unlockedStorage(["plains_3"]));
        app.start("plains_3"); app.finish("victory");
        app.finish("victory"); app.finish("defeat");
        expect(app.controller.unlocks()).toEqual({ skunk: ["plains_3", "interlude_1"] });
        expect(app.storage.setItem.mock.calls.filter(([key]) => key !== "kcq.difficulty")).toHaveLength(2);
        app.controller.retryEncounter(); app.finish("victory");
        expect(app.storage.setItem.mock.calls.filter(([key]) => key !== "kcq.difficulty")).toHaveLength(2);
        expect(app.visible()).toEqual(["prologue", "plains_3", "interlude_1"]);
    });

    it("reads the selected campaign's rules and keeps multiple campaigns independent", () => {
        // The application ships one campaign; this fixture exercises another public CampaignId.
        const alternate = "alternate" as KCQCampaign;
        const campaigns = { ...library.campaigns, alternate: {
            id: alternate, initial: ["forest_1"], victory: { plains_1: ["outside", "outside"] }, defeat: {},
        } };
        const app = setup(storageWith({ "kcq.unlocks": JSON.stringify({ skunk: ["plains_1"], alternate: ["plains_1"] }) }), campaigns);
        app.start("plains_1"); app.finish("victory"); app.controller.returnToTitle();
        app.start("plains_1", "casual", alternate); app.finish("victory");
        expect(app.controller.unlocks()).toEqual({ skunk: ["plains_1", "plains_2"], alternate: ["plains_1", "outside"] });
        const restored = setup(app.storage, campaigns);
        expect(restored.controller.unlocks()).toEqual(app.controller.unlocks());
        expect(createEncounterPickerViewModel(library, presentation, campaigns.alternate, {},
            restored.controller.unlocks()[alternate]).encounters.filter(encounter => !encounter.locked).map(({ id }) => id)).toEqual(["plains_1", "forest_1", "outside"]);
        expect(restored.visible()).toEqual(["prologue", "plains_1", "plains_2"]);
    });

    it("Show All permits locked selection and restores locks without saving progress", () => {
        const app = setup();
        app.controller.selectCampaign("skunk"); app.controller.confirmParty(); app.controller.setShowAll(true);
        expect(app.visible()).toEqual(Object.keys(library.encounters));
        app.controller.selectEncounter("outside");
        expect(app.controller.screen()).toEqual({ screen: "details", campaign: "skunk", encounter: "outside" });
        app.controller.backToPicker(); app.controller.setShowAll(false);
        expect(app.visible()).toEqual(campaign.initial);
        expect(app.controller.unlocks()).toEqual({});
        expect(app.controller.bestClears()).toEqual({});
        expect(app.storage.setItem.mock.calls).toEqual([["kcq.showAll", "true"], ["kcq.showAll", "false"]]);
    });

    it.each(["interlude_1", "interlude_2", "interlude_3", "epilogue"])("does not unlock progress by viewing locked story %s through Show All", story => {
        const app = setup();
        app.controller.selectCampaign("skunk"); app.controller.confirmParty(); app.controller.setShowAll(true);
        app.controller.selectEncounter(story);
        expect(app.controller.screen()).toEqual({ screen: "details", campaign: "skunk", encounter: story });
        expect(app.controller.unlocks()).toEqual({});
        expect(app.storage.setItem).toHaveBeenCalledExactlyOnceWith("kcq.showAll", "true");
    });

    it.each(["victory", "defeat"] as const)("does not grant campaign unlocks for a locked combat %s", outcome => {
        const app = setup(); app.controller.setShowAll(true);
        app.start("tower_1"); app.finish(outcome);
        expect(app.controller.unlocks()).toEqual({});
        expect(app.storage.setItem.mock.calls.filter(([key]) => key === "kcq.unlocks")).toEqual([]);
        expect(app.controller.bestClears()).toEqual(outcome === "victory" ? { tower_1: "standard" } : {});
    });

    it.each(["retryEncounter", "returnToLevelSelect", "returnToTitle", "dispose"] as const)("does not unlock on %s during an ongoing battle", action => {
        const app = setup(); app.start("tower_1"); app.finish("ongoing");
        app.controller[action]();
        expect(app.controller.unlocks()).toEqual({});
        expect(app.storage.setItem.mock.calls.filter(([key]) => key === "kcq.unlocks")).toEqual([]);
        expect(app.prepare.mock.results[0]!.value.observer.onQuit).toHaveBeenCalledOnce();
    });

    it("keeps initial IDs available without saving redundant unlocks", () => {
        const app = setup(storageWith(), { skunk: { ...campaign, initial: [...campaign.initial, "plains_1"], victory: { plains_1: [...campaign.initial] } } });
        app.start("plains_1"); app.finish("victory");
        expect(app.controller.unlocks()).toEqual({});
        expect(app.storage.setItem.mock.calls.filter(([key]) => key !== "kcq.difficulty").map(([key]) => key)).toEqual(["kcq.clears"]);
    });

    it.each(["{broken", "null", "[]", "42", '"plains_1"'])("ignores malformed storage %s and still progresses", saved => {
        const app = setup(storageWith({ "kcq.unlocks": saved }));
        expect(app.visible()).toEqual(campaign.initial);
        app.controller.selectCampaign("skunk"); app.controller.confirmParty(); app.controller.selectEncounter("prologue");
        app.controller.backToPicker();
        app.start("plains_1"); app.finish("victory");
        expect(app.controller.unlocks()).toEqual({ skunk: ["plains_1", "plains_2"] });
        expect(() => app.controller.returnToLevelSelect()).not.toThrow();
    });

    it("filters malformed entries and deduplicates saved IDs", () => {
        const saved = { skunk: ["tower_2", 1, null, {}, "", "tower_2"], alternate: ["outside"], bad: {}, nested: null };
        expect(loadCampaignUnlocks(storageWith({ "kcq.unlocks": JSON.stringify(saved) }))).toEqual({ skunk: ["tower_2"], alternate: ["outside"] });
    });

    it("retains story unlocks in session and supports navigation when storage is unavailable", () => {
        const storage = storageWith();
        storage.getItem.mockImplementation(() => { throw new Error("blocked"); });
        storage.setItem.mockImplementation(() => { throw new Error("quota"); });
        const app = setup(storage);
        app.controller.selectCampaign("skunk"); app.controller.confirmParty();
        expect(() => app.controller.selectEncounter("prologue")).not.toThrow();
        expect(app.controller.unlocks()).toEqual({ skunk: ["plains_1"] });
        expect(app.controller.bestClears()).toEqual({});
        app.controller.backToPicker();
        expect(app.visible()).toEqual(["prologue", "plains_1"]);
        app.controller.selectEncounter("prologue");
        expect(storage.setItem).toHaveBeenCalledTimes(1);
        expect(app.prepare).not.toHaveBeenCalled();
    });

    it("preserves reactive progress and navigation when storage reads and writes throw", () => {
        const storage = storageWith();
        storage.getItem.mockImplementation(() => { throw new Error("blocked"); });
        storage.setItem.mockImplementation(() => { throw new Error("quota"); });
        const app = setup(storage);
        app.controller.selectCampaign("skunk"); app.controller.confirmParty(); app.controller.selectEncounter("prologue");
        app.controller.backToPicker(); app.start("plains_1");
        expect(() => app.finish("victory")).not.toThrow();
        expect(app.visible()).toEqual(["prologue", "plains_1", "plains_2"]);
        expect(app.controller.bestClears()).toEqual({ plains_1: "standard" });
        expect(() => app.controller.returnToLevelSelect()).not.toThrow();
        expect(app.controller.screen().screen).toBe("picker");
    });
});
