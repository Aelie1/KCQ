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
        return createGraphicalController(prepare, storage);
    });
    const start = (encounter: EncounterId, difficulty: DifficultyId = "standard", id: KCQCampaign = "skunk") => {
        controller.selectCampaign(id);
        controller.selectEncounter(encounter);
        controller.chooseDifficulty();
        controller.selectDifficulty(difficulty);
        controller.startEncounter();
    };
    const visible = () => createEncounterPickerViewModel(library, presentation, campaign,
        controller.bestClears(), controller.unlocks().skunk ?? [], controller.showAll()).encounters.map(({ id }) => id);
    return { controller, prepare, storage, start, visible,
        finish(value: BattleState) { outcome = value; controller.recordOutcome(); } };
}

describe("campaign encounter unlocks", () => {
    it("includes initial encounters on a fresh save without writing storage, including story-only entries", () => {
        const app = setup();
        expect(app.visible()).toEqual(campaign.initial);
        expect(app.visible()).toContain("prologue");
        expect(app.controller.showAll()).toBe(false);
        expect(app.storage.setItem).not.toHaveBeenCalled();
    });

    it.each(["casual", "standard", "veteran", "extreme", "mythic"] as const)("uses authored victory rules at %s independently of clears", difficulty => {
        const app = setup(storageWith({ "kcq.clears": '{"plains_1":"mythic"}' }));
        app.start("plains_1", difficulty); app.finish("victory");
        expect(app.controller.unlocks()).toEqual({ skunk: campaign.victory.plains_1 });
        expect(app.visible()).toEqual(["prologue", "plains_1", "plains_2"]);
        expect(app.controller.bestClears()).toEqual({ plains_1: "mythic" });
        expect(app.storage.setItem).toHaveBeenCalledExactlyOnceWith("kcq.unlocks", JSON.stringify({ skunk: ["plains_2"] }, null, 2));
    });

    it("accumulates Tower defeat unlocks and restores them in a new controller", () => {
        const app = setup();
        app.start("tower_1"); app.finish("defeat");
        expect(app.controller.unlocks()).toEqual({ skunk: campaign.defeat.tower_1 });
        app.controller.returnToLevelSelect();
        app.start("tower_2", "mythic"); app.finish("defeat");
        expect(app.controller.unlocks()).toEqual({ skunk: ["tower_2", "tower_3"] });
        expect(app.controller.bestClears()).toEqual({});
        expect(app.storage.getItem("kcq.clears")).toBeNull();
        const restored = setup(app.storage);
        expect(restored.visible()).toEqual(["prologue", "plains_1", "tower_2", "tower_3"]);
    });

    it("handles duplicate callbacks and repeated battles without duplicate IDs or storage writes", () => {
        const app = setup();
        app.start("plains_3"); app.finish("victory");
        app.finish("victory"); app.finish("defeat");
        expect(app.controller.unlocks()).toEqual({ skunk: ["interlude_1", "forest_1"] });
        expect(app.storage.setItem.mock.calls).toHaveLength(2);
        app.controller.retryEncounter(); app.finish("victory");
        expect(app.storage.setItem.mock.calls).toHaveLength(2);
        expect(app.visible()).toEqual(["prologue", "plains_1", "interlude_1", "forest_1"]);
    });

    it("reads the selected campaign's rules and keeps multiple campaigns independent", () => {
        // The application ships one campaign; this fixture exercises another public CampaignId.
        const alternate = "alternate" as KCQCampaign;
        const campaigns = { ...library.campaigns, alternate: {
            id: alternate, initial: ["forest_1"], victory: { plains_1: ["outside", "outside"] }, defeat: {},
        } };
        const app = setup(storageWith(), campaigns);
        app.start("plains_1"); app.finish("victory"); app.controller.returnToTitle();
        app.start("plains_1", "casual", alternate); app.finish("victory");
        expect(app.controller.unlocks()).toEqual({ skunk: ["plains_2"], alternate: ["outside"] });
        const restored = setup(app.storage, campaigns);
        expect(restored.controller.unlocks()).toEqual(app.controller.unlocks());
        expect(createEncounterPickerViewModel(library, presentation, campaigns.alternate, {},
            restored.controller.unlocks()[alternate]).encounters.map(({ id }) => id)).toEqual(["forest_1", "outside"]);
        expect(restored.visible()).toEqual(["prologue", "plains_1", "plains_2"]);
    });

    it("Show All permits locked selection and restores filtering without saving progress", () => {
        const app = setup();
        app.controller.selectCampaign("skunk"); app.controller.setShowAll(true);
        expect(app.visible()).toEqual(Object.keys(library.encounters));
        app.controller.selectEncounter("outside");
        expect(app.controller.screen()).toEqual({ screen: "details", campaign: "skunk", encounter: "outside" });
        app.controller.backToPicker(); app.controller.setShowAll(false);
        expect(app.visible()).toEqual(campaign.initial);
        expect(app.controller.unlocks()).toEqual({});
        expect(app.controller.bestClears()).toEqual({});
        expect(app.storage.setItem).not.toHaveBeenCalled();
    });

    it.each(["retryEncounter", "returnToLevelSelect", "returnToTitle", "dispose"] as const)("does not unlock on %s during an ongoing battle", action => {
        const app = setup(); app.start("tower_1"); app.finish("ongoing");
        app.controller[action]();
        expect(app.controller.unlocks()).toEqual({});
        expect(app.storage.setItem).not.toHaveBeenCalled();
        expect(app.prepare.mock.results[0]!.value.observer.onQuit).toHaveBeenCalledOnce();
    });

    it("keeps initial IDs available without saving redundant unlocks", () => {
        const app = setup(storageWith(), { skunk: { ...campaign, victory: { plains_1: [...campaign.initial] } } });
        app.start("plains_1"); app.finish("victory");
        expect(app.controller.unlocks()).toEqual({});
        expect(app.storage.setItem.mock.calls.map(([key]) => key)).toEqual(["kcq.clears"]);
    });

    it.each(["{broken", "null", "[]", "42", '"plains_1"'])("ignores malformed storage %s and still progresses", saved => {
        const app = setup(storageWith({ "kcq.unlocks": saved }));
        expect(app.visible()).toEqual(campaign.initial);
        app.start("tower_1"); app.finish("defeat");
        expect(app.controller.unlocks()).toEqual({ skunk: ["tower_2"] });
        expect(() => app.controller.returnToLevelSelect()).not.toThrow();
    });

    it("filters malformed entries and deduplicates saved IDs", () => {
        const saved = { skunk: ["tower_2", 1, null, {}, "", "tower_2"], alternate: ["outside"], bad: {}, nested: null };
        expect(loadCampaignUnlocks(storageWith({ "kcq.unlocks": JSON.stringify(saved) }))).toEqual({ skunk: ["tower_2"], alternate: ["outside"] });
    });

    it("preserves reactive progress and navigation when storage reads and writes throw", () => {
        const storage = storageWith();
        storage.getItem.mockImplementation(() => { throw new Error("blocked"); });
        storage.setItem.mockImplementation(() => { throw new Error("quota"); });
        const app = setup(storage);
        app.start("plains_1");
        expect(() => app.finish("victory")).not.toThrow();
        expect(app.visible()).toEqual(["prologue", "plains_1", "plains_2"]);
        expect(app.controller.bestClears()).toEqual({ plains_1: "standard" });
        expect(() => app.controller.returnToLevelSelect()).not.toThrow();
        expect(app.controller.screen().screen).toBe("picker");
    });
});
