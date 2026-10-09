import { createRoot } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStockEngine } from "../../src/stock";
import type { BattleState, DifficultyId, EncounterId } from "../../src/engine/public/types";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createBattle } from "../../src/ui/web/app";
import { loadLanguage, saveLanguage } from "../../src/ui/web/app/language";
import { createGraphicalController } from "../../src/ui/web/app/graphicalController";
import { stockStrings } from "../helpers/stockStrings";

function mockStorage(saved: Record<string, string> = {}) {
    const values = new Map(Object.entries(saved));
    return {
        getItem: vi.fn((key: string) => values.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    };
}

const presentation = new Presentation(stockStrings);
// Alternate language options exercise the supported-language list without adding translations.
const options = [
    { id: "test", label: "Test", presentation },
    { id: "en", label: "English", presentation },
];
const disposers: (() => void)[] = [];
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); vi.restoreAllMocks(); });

describe("language storage", () => {
    it("defaults to English without a preference, regardless of option ordering", () => {
        const storage = mockStorage();
        expect(loadLanguage(options, storage).id).toBe("en");
        expect(storage.getItem).toHaveBeenCalledWith("kcq.language");
    });

    it.each(["en", "test"])("restores supported language %s", id => {
        expect(loadLanguage(options, mockStorage({ "kcq.language": id })).id).toBe(id);
    });

    it.each(["", "unknown", "fr", '"en"'])("falls back from invalid or unsupported %s", id => {
        expect(loadLanguage(options, mockStorage({ "kcq.language": id })).id).toBe("en");
    });

    it("saves a changed language as a plain ID", () => {
        const storage = mockStorage();
        saveLanguage("test", storage);
        expect(storage.setItem).toHaveBeenCalledExactlyOnceWith("kcq.language", "test");
        expect(loadLanguage(options, storage).id).toBe("test");
    });

    it("handles read and write exceptions", () => {
        const storage = mockStorage();
        storage.getItem.mockImplementation(() => { throw new Error("blocked"); });
        storage.setItem.mockImplementation(() => { throw new Error("quota"); });
        expect(loadLanguage(options, storage).id).toBe("en");
        expect(() => saveLanguage("test", storage)).not.toThrow();
    });
});

function setup(storage = mockStorage()) {
    let outcome: BattleState = "ongoing";
    const prepare = vi.fn((_campaign, encounter: EncounterId, difficulty: DifficultyId) => {
        outcome = "ongoing";
        const engine = createStockEngine(12345);
        createBattle(engine, encounter, difficulty);
        const initial = engine.getGameState();
        vi.spyOn(engine, "getGameState").mockImplementation(() => ({
            ...initial, turn: { ...initial.turn, outcome },
        }));
        return { engine, dispose: vi.fn() };
    });
    const controller = createRoot(dispose => {
        disposers.push(() => { controller.dispose(); dispose(); });
        return createGraphicalController(prepare, storage);
    });
    const start = (encounter: EncounterId = "plains_1", difficulty: DifficultyId = "standard") => {
        controller.selectCampaign("skunk");
        controller.selectEncounter(encounter);
        controller.chooseDifficulty();
        controller.selectDifficulty(difficulty);
        controller.startEncounter();
    };
    return { controller, storage, start, finish(value: BattleState) { outcome = value; controller.recordVictory(); } };
}

describe("encounter clear storage", () => {
    it("restores multiple independent records and tolerates unknown encounter IDs", () => {
        const saved = { plains_1: "standard", plains_2: "mythic", unknown: "casual" };
        const { controller, storage } = setup(mockStorage({ "kcq.clears": JSON.stringify(saved) }));
        expect(controller.bestClears()).toEqual(saved);
        expect(storage.setItem).not.toHaveBeenCalled();
    });

    it("saves a confirmed victory immediately and restores it in another controller", () => {
        const { controller, storage, start, finish } = setup();
        start();
        finish("victory");
        expect(controller.bestClears()).toEqual({ plains_1: "standard" });
        expect(JSON.parse(storage.getItem("kcq.clears")!)).toEqual({ plains_1: "standard" });
        expect(setup(storage).controller.bestClears()).toEqual(controller.bestClears());
    });

    it.each([
        ["casual", "standard"], ["standard", "veteran"], ["veteran", "extreme"], ["extreme", "mythic"],
    ] as const)("upgrades %s to %s using game order", (previous, next) => {
        const { controller, storage, start, finish } = setup(mockStorage({ "kcq.clears": JSON.stringify({ plains_1: previous, plains_2: "mythic" }) }));
        start("plains_1", next);
        finish("victory");
        expect(controller.bestClears()).toEqual({ plains_1: next, plains_2: "mythic" });
        expect(JSON.parse(storage.getItem("kcq.clears")!)).toEqual(controller.bestClears());
    });

    it.each(["casual", "standard", "veteran", "extreme", "mythic"] as const)("does not downgrade or rewrite Mythic after %s", difficulty => {
        const { controller, storage, start, finish } = setup(mockStorage({ "kcq.clears": '{"plains_1":"mythic"}' }));
        start("plains_1", difficulty);
        finish("victory");
        expect(controller.bestClears()).toEqual({ plains_1: "mythic" });
        expect(storage.setItem).not.toHaveBeenCalled();
    });

    it("keeps victories for different encounters independent", () => {
        const { controller, start, finish } = setup();
        start("plains_1", "mythic"); finish("victory"); controller.returnToLevelSelect();
        start("plains_2", "casual"); finish("victory");
        expect(controller.bestClears()).toEqual({ plains_1: "mythic", plains_2: "casual" });
    });

    it.each(["ongoing", "defeat"] as const)("does not save %s, quitting, or restarting", outcome => {
        const { controller, storage, start, finish } = setup();
        start(); finish(outcome);
        controller.retryEncounter();
        controller.returnToLevelSelect();
        start(); controller.returnToTitle();
        controller.recordVictory();
        expect(controller.bestClears()).toEqual({});
        expect(storage.setItem).not.toHaveBeenCalled();
    });

    it.each(["{broken", "null", "[]", "42", '"standard"'])("ignores malformed records %s", saved => {
        expect(setup(mockStorage({ "kcq.clears": saved })).controller.bestClears()).toEqual({});
    });

    it("ignores invalid difficulty identifiers while keeping valid records", () => {
        const saved = { plains_1: "hard", plains_2: "veteran", forest_1: null, forest_2: 3, forest_3: {} };
        expect(setup(mockStorage({ "kcq.clears": JSON.stringify(saved) })).controller.bestClears()).toEqual({ plains_2: "veteran" });
    });

    it("retains session progress and navigation when storage throws", () => {
        const storage = mockStorage();
        storage.getItem.mockImplementation(() => { throw new Error("blocked"); });
        storage.setItem.mockImplementation(() => { throw new Error("quota"); });
        const { controller, start, finish } = setup(storage);
        expect(controller.bestClears()).toEqual({});
        start();
        expect(() => finish("victory")).not.toThrow();
        expect(controller.bestClears()).toEqual({ plains_1: "standard" });
        expect(() => controller.returnToLevelSelect()).not.toThrow();
        expect(controller.screen().screen).toBe("picker");
    });
});
