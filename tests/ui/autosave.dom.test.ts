import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCampaignLibrary, createCharacterLibrary } from "../../src/content";
import { compressToBase64 } from "lz-string";
import { createStockEngine } from "../../src/stock";
import type { DifficultyId, EncounterId, Engine } from "../../src/engine/public/types";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createBattle } from "../../src/ui/web/app";
import { GraphicalApp } from "../../src/ui/web/app/GraphicalApp";
import { createSavePackage, type SavePackage } from "../../src/ui/web/app/savePackage";
import { AUTOSAVE_STORAGE_KEY, readSave, writeSave } from "../../src/ui/web/app/savePersistence";
import { createBattleResultTracker } from "../../src/ui/web/app/viewModels/battleResult";
import { createGameLogHistory } from "../../src/ui/web/app/viewModels/gameLogHistory";
import { stockStrings } from "../helpers/stockStrings";

const presentation = new Presentation(stockStrings);
let unmount: (() => void) | undefined;
beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("__KCQ_GIT_REVISION__", "autosave-test");
    window.localStorage.clear();
    window.localStorage.setItem("kcq.playbackSpeed", "instant");
});
afterEach(() => {
    unmount?.(); unmount = undefined;
    document.body.replaceChildren();
    vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
    window.localStorage.clear();
});

function click(selector: string): void {
    const element = document.querySelector<HTMLButtonElement>(selector);
    if (!element) throw new Error("Missing " + selector);
    element.click();
}
function button(label: string): void {
    const element = [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => {
        const copy = button.cloneNode(true) as HTMLElement;
        copy.querySelectorAll(".kcq-shortcut").forEach(node => node.remove());
        return copy.textContent?.trim() === label;
    });
    if (!element) throw new Error("Missing " + label);
    element.click();
}
function mount(configure?: (engine: Engine) => void, titlePresentation = presentation) {
    unmount?.(); document.body.replaceChildren();
    const sessions: { engine: Engine; dispose: ReturnType<typeof vi.fn> }[] = [];
    const restoredEngines: Engine[] = [];
    const prepareBattle = vi.fn((_campaign: "skunk", encounter: EncounterId, difficulty: DifficultyId) => {
        const engine = createStockEngine(12345 + sessions.length);
        createBattle(engine, encounter, difficulty);
        const session = { engine, dispose: vi.fn() };
        sessions.push(session);
        return session;
    });
    const createEngine = vi.fn(() => {
        const engine = createStockEngine(999);
        vi.spyOn(engine, "loadCharacter"); vi.spyOn(engine, "loadEncounter"); vi.spyOn(engine, "loadSaveState");
        configure?.(engine);
        restoredEngines.push(engine);
        return engine;
    });
    const composeCampaign = vi.fn(() => ({ library: createCampaignLibrary(["ko", "matsuko", "hinari"], "skunk"), presentation }));
    const host = document.createElement("div"); document.body.append(host);
    unmount = render(() => createComponent(GraphicalApp, {
        campaigns: ["skunk"], release: "test", presentation: titlePresentation, prepareBattle, composeCampaign,
        characterLibrary: createCharacterLibrary(), createEngine,
    }), host);
    return { sessions, restoredEngines, prepareBattle, composeCampaign };
}
function start(encounter = "forest_3", difficulty = "Veteran"): void {
    click(".kcq-title-screen__campaign");
    document.querySelector<HTMLInputElement>(".kcq-encounter-picker__show-all input")!.click();
    const row = [...document.querySelectorAll<HTMLButtonElement>(".kcq-encounter-picker__row")]
        .find(row => row.querySelector(".kcq-encounter-picker__name")?.textContent === presentation.encounter(encounter));
    if (!row) throw new Error("Missing encounter " + encounter);
    row.click(); button("Choose Difficulty"); button(difficulty); button("Start Encounter");
}
function saved(): SavePackage {
    const result = readSave();
    if (result.status !== "loaded") throw new Error("Expected autosave, got " + result.status);
    return result.save;
}
function seedSave(encounter = "forest_3") {
    const engine = createStockEngine(12345);
    createBattle(engine, encounter, "veteran");
    const history = createGameLogHistory(engine.getGameState());
    const tracker = createBattleResultTracker(engine.getGameState());
    const act = () => {
        const action = { type: "endTurn" } as const;
        const result = engine.executeAction(action);
        if (!result.success) throw new Error("Expected successful action");
        history.record(result.frames); tracker.record(action, result, engine.getGameState());
        return result;
    };
    act();
    const save = createSavePackage(engine.getSaveState(), history.getSaveState(), tracker.getSaveState());
    expect(writeSave(save).status).toBe("saved");
    return { engine, history, tracker, save, act };
}
const endTurn = () => click(".kcq-battle-overview__primary-action");
const encoded = () => window.localStorage.getItem(AUTOSAVE_STORAGE_KEY);
const titleError = () => document.querySelector(".kcq-title-screen__save-message")?.textContent;

describe("title saved-battle card", () => {
    it("presents localized campaign, encounter, difficulty, round and actions without composing an engine", () => {
        const source = seedSave("plains_3");
        source.save.saveState.turn.round = 7;
        writeSave(source.save);
        const localized = new Presentation({ ...stockStrings,
            "campaign.skunk.name": "Localized campaign", "encounter.plains_3.name": "Localized encounter",
            "difficulty.veteran.name": "Localized difficulty", "ui.battleOverview.round": "Turn {round}",
            "ui.title.resumeBattle": "Localized resume", "ui.title.continue": "Localized continue",
            "ui.title.party": "Localized party", "ui.title.campaigns": "Localized campaigns",
            "ui.title.save.delete": "Localized delete",
            "ui.battleResult.bossHp.short": "Localized boss {percent}%",
        });
        const app = mount(undefined, localized);
        expect([...document.querySelectorAll(".kcq-title-screen h2")].map(heading => heading.textContent))
            .toEqual(["Localized resume", "Localized party", "Localized campaigns"]);
        const card = document.querySelector(".kcq-title-screen__resume")!;
        const upper = document.querySelector(".kcq-title-screen__upper")!;
        expect(upper.children).toHaveLength(2);
        expect(upper.children[0]?.contains(card)).toBe(true);
        expect(upper.children[1]?.querySelector(".kcq-title-screen__party")).not.toBeNull();
        expect(upper.contains(document.querySelector(".kcq-title-screen__campaigns"))).toBe(false);
        expect(card.previousElementSibling?.tagName).toBe("H2");
        expect(card.previousElementSibling?.textContent).toBe("Localized resume");
        expect(card.getAttribute("aria-label")).toBe("Localized resume");
        expect(card.querySelector("strong")?.textContent).toBe("Localized campaign");
        expect(card.querySelector(".kcq-title-screen__resume-details p")?.textContent)
            .toBe("Localized encounter\nLocalized difficulty · Turn 7 · Localized boss 100%");
        expect(card.querySelector(".kcq-title-screen__continue")?.textContent).toBe("Localized continue");
        expect(card.querySelector(".kcq-title-screen__save-action")?.textContent).toBe("Localized delete");
        expect(card.textContent).not.toContain("plains_3");
        expect(app.composeCampaign).not.toHaveBeenCalled();
        expect(app.prepareBattle).not.toHaveBeenCalled();
        for (const action of card.querySelectorAll<HTMLButtonElement>("button")) {
            expect(action.tabIndex).toBe(0);
            action.focus(); expect(document.activeElement).toBe(action);
        }
    });

    it.each(["Cancel", "Escape"])("confirms deletion inline and cancels via %s without changing storage or campaigns", method => {
        seedSave(); mount(); const before = encoded();
        const campaign = document.querySelector(".kcq-title-screen__campaign");
        const remove = vi.spyOn(window.localStorage, "removeItem");
        button("Delete");
        const confirmation = document.querySelector(".kcq-title-screen__delete-confirmation")!;
        expect(confirmation.getAttribute("aria-label")).toBe(presentation.ui("title.save.deletePrompt"));
        expect(document.activeElement?.textContent).toBe("Cancel");
        expect(encoded()).toBe(before); expect(remove).not.toHaveBeenCalled();
        if (method === "Cancel") button("Cancel");
        else document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        expect(document.querySelector(".kcq-title-screen__delete-confirmation")).toBeNull();
        expect(document.activeElement?.textContent).toBe("Delete");
        expect(encoded()).toBe(before); expect(remove).not.toHaveBeenCalled();
        expect(document.querySelector(".kcq-title-screen__campaign")?.textContent).toBe(campaign?.textContent);
        click(".kcq-title-screen__continue");
        expect(document.querySelector(".kcq-battle-overview")).not.toBeNull();
    });

    it("immediately removes the saved-battle card after confirmation and keeps campaign selection intact", () => {
        seedSave(); const app = mount();
        const campaign = document.querySelector(".kcq-title-screen__campaign");
        const remove = vi.spyOn(window.localStorage, "removeItem");
        button("Delete"); button("Delete Battle");
        expect(remove).toHaveBeenCalledExactlyOnceWith(AUTOSAVE_STORAGE_KEY);
        expect(readSave().status).toBe("missing");
        expect(document.querySelector(".kcq-title-screen__resume")).toBeNull();
        expect(document.querySelector(".kcq-title-screen__upper")?.children).toHaveLength(1);
        expect(document.querySelector(".kcq-title-screen__upper .kcq-title-screen__party")).not.toBeNull();
        expect(document.querySelector(".kcq-title-screen__campaign")?.textContent).toBe(campaign?.textContent);
        expect(document.activeElement?.textContent).toBe(presentation.ui("title.campaigns"));
        expect(app.composeCampaign).not.toHaveBeenCalled();
        click(".kcq-title-screen__campaign");
        expect(document.querySelector(".kcq-encounter-picker")).not.toBeNull();
    });

    it("reports failed deletion and preserves the save for Continue", () => {
        const source = seedSave(); const app = mount(); const before = encoded();
        const remove = vi.spyOn(window.localStorage, "removeItem").mockImplementation(() => { throw new Error("private details"); });
        button("Delete"); button("Delete Battle");
        expect(document.querySelector('[role="alert"]')?.textContent).toBe(presentation.ui("title.save.deleteError"));
        expect(document.body.textContent).not.toContain("private details");
        expect(encoded()).toBe(before);
        expect(document.querySelector(".kcq-title-screen__resume")).not.toBeNull();
        button("Cancel");
        expect(document.querySelector('[role="alert"]')).toBeNull();
        remove.mockRestore();
        click(".kcq-title-screen__continue");
        expect(app.restoredEngines[0]!.getSaveState()).toEqual(source.save.saveState);
    });

    it.each(["corrupted", "incompatible"] as const)("can delete a %s save without starting a battle", status => {
        const value = status === "corrupted" ? "broken save" : compressToBase64(JSON.stringify({ version: "old-version" }));
        window.localStorage.setItem(AUTOSAVE_STORAGE_KEY, value);
        const app = mount();
        expect(titleError()).toBe(presentation.ui(`title.save.${status}`));
        expect(document.querySelector(".kcq-title-screen__continue")).toBeNull();
        button("Delete");
        expect(document.activeElement?.textContent).toBe("Cancel");
        button("Cancel");
        expect(document.activeElement?.textContent).toBe("Delete");
        expect(encoded()).toBe(value);
        button("Delete"); button("Delete Battle");
        expect(encoded()).toBeNull(); expect(titleError()).toBeUndefined();
        expect(document.querySelector(".kcq-title-screen__resume")).toBeNull();
        expect(app.composeCampaign).not.toHaveBeenCalled(); expect(app.prepareBattle).not.toHaveBeenCalled();
    });

    it("can clear a stored save even when reading it is inaccessible", () => {
        seedSave();
        const storage = window.localStorage;
        const get = storage.getItem.bind(storage);
        vi.spyOn(window, "localStorage", "get").mockReturnValue({
            ...storage, removeItem: storage.removeItem.bind(storage), clear: storage.clear.bind(storage),
            getItem: (key: string) => {
                if (key === AUTOSAVE_STORAGE_KEY) throw new Error("read blocked");
                return get(key);
            },
        });
        mount(); expect(titleError()).toBe(presentation.ui("title.save.inaccessible"));
        button("Delete"); button("Delete Battle");
        expect(get(AUTOSAVE_STORAGE_KEY)).toBeNull();
        expect(document.querySelector(".kcq-title-screen__resume")).toBeNull();
        expect(titleError()).toBeUndefined();
    });
});
describe("graphical autosave and Continue", () => {
    it("replaces the slot at initialization and can refresh before the first action", () => {
        const previous = seedSave().save;
        const app = mount(); start();
        const initial = saved();
        expect(initial.saveState).toEqual(app.sessions[0]!.engine.getSaveState());
        expect(initial.stats.stats.actions).toBe(0); expect(initial.gameLog.entries).toEqual([]);
        expect(initial).not.toEqual(previous);
        const refreshed = mount(); click(".kcq-title-screen__continue");
        expect(document.querySelector(".kcq-battle-overview")).not.toBeNull();
        expect(refreshed.restoredEngines[0]!.getSaveState()).toEqual(initial.saveState);
        expect(refreshed.prepareBattle).not.toHaveBeenCalled();
    });

    it.each(["normal", "instant"])("saves every frame and tracker update after %s playback completes", speed => {
        window.localStorage.setItem("kcq.playbackSpeed", speed);
        const app = mount(); start(); const engine = app.sessions[0]!.engine;
        const history = createGameLogHistory(engine.getGameState());
        const tracker = createBattleResultTracker(engine.getGameState());
        const execute = vi.spyOn(engine, "executeAction"); const initial = encoded();
        endTurn(); const result = execute.mock.results[0]!.value;
        expect(result.success).toBe(true);
        if (speed === "normal") {
            expect(document.querySelector(".kcq-battle-stage")?.getAttribute("aria-busy")).toBe("true");
            expect(encoded()).toBe(initial); vi.advanceTimersByTime(100); expect(encoded()).toBe(initial);
            vi.advanceTimersByTime(20000);
        }
        expect(document.querySelector(".kcq-battle-stage")?.getAttribute("aria-busy")).toBe("false");
        if (result.success) history.record(result.frames);
        tracker.record({ type: "endTurn" }, result, engine.getGameState());
        expect(saved()).toEqual(createSavePackage(engine.getSaveState(), history.getSaveState(), tracker.getSaveState()));
    });

    it("keeps the previous decision when disposed during animation and resumes that decision", () => {
        window.localStorage.setItem("kcq.playbackSpeed", "normal");
        const app = mount(); start(); const initial = saved(); endTurn();
        expect(app.sessions[0]!.engine.getSaveState()).not.toEqual(initial.saveState);
        const refreshed = mount(); vi.advanceTimersByTime(20000); expect(saved()).toEqual(initial);
        click(".kcq-title-screen__continue");
        expect(refreshed.restoredEngines[0]!.getSaveState()).toEqual(initial.saveState);
    });

    it("does not save failed decisions", () => {
        const app = mount(); start(); const before = encoded();
        const snapshot = vi.spyOn(app.sessions[0]!.engine, "getSaveState");
        vi.spyOn(app.sessions[0]!.engine, "executeAction").mockReturnValue({ success: false, reason: "wrongPhase" });
        endTurn(); vi.advanceTimersByTime(20000);
        expect(encoded()).toBe(before); expect(snapshot).not.toHaveBeenCalled();
    });

    it("restores engine, immediate historical log and statistics, then continues identically", () => {
        const original = seedSave(); const app = mount(); click(".kcq-title-screen__continue");
        const restored = app.restoredEngines[0]!;
        expect(restored.loadSaveState).toHaveBeenCalledExactlyOnceWith(original.save.saveState);
        for (const engine of app.restoredEngines) {
            expect(engine.loadCharacter).not.toHaveBeenCalled(); expect(engine.loadEncounter).not.toHaveBeenCalled();
        }
        expect(app.prepareBattle).not.toHaveBeenCalled();
        expect(restored.getGameState()).toEqual(original.engine.getGameState());
        expect(document.querySelector(".kcq-character-details")).toBeNull();
        click(".kcq-battle-overview__secondary-action");
        expect(document.querySelectorAll(".kcq-game-log [data-kind=move]").length).toBeGreaterThan(0);
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", bubbles: true }));
        original.act(); endTurn();
        expect(saved()).toEqual(createSavePackage(original.engine.getSaveState(), original.history.getSaveState(), original.tracker.getSaveState()));
        expect(saved().stats.stats.actions).toBe(2);
    });

    it("keeps the save at title, then retries with the original encounter and difficulty", () => {
        seedSave(); const app = mount(); click(".kcq-title-screen__continue"); const before = encoded();
        click(".kcq-battle-overview .kcq-combat-header__settings"); button("Back to Title Screen");
        expect(encoded()).toBe(before); click(".kcq-title-screen__continue");
        click(".kcq-battle-overview .kcq-combat-header__settings"); button("Retry Battle");
        expect(app.prepareBattle).toHaveBeenCalledExactlyOnceWith("skunk", "forest_3", "veteran", ["ko", "matsuko", "hinari"]);
        expect(saved().stats.stats.actions).toBe(0); expect(saved().gameLog.entries).toEqual([]);
        expect(saved().saveState).toEqual(app.sessions[0]!.engine.getSaveState());
    });
});

describe("autosave lifecycle and failures", () => {
    it.each(["victory", "defeat"] as const)("processes %s progression and clears the slot after playback", outcome => {
        window.localStorage.setItem("kcq.playbackSpeed", "normal");
        window.localStorage.setItem("kcq.unlocks", JSON.stringify({ skunk: ["plains_1"] }));
        const app = mount(); start("plains_1", "Standard");
        const engine = app.sessions[0]!.engine;
        const initial = encoded();
        const execute = engine.executeAction.bind(engine);
        const getState = engine.getGameState.bind(engine);
        let completed = false;
        vi.spyOn(engine, "getGameState").mockImplementation(() => {
            const state = getState();
            return completed ? { ...state, turn: { ...state.turn, outcome } } : state;
        });
        vi.spyOn(engine, "executeAction").mockImplementation(action => {
            const result = execute(action); completed = true; return result;
        });
        endTurn();
        expect(encoded()).toBe(initial);
        expect(window.localStorage.getItem("kcq.clears")).toBeNull();
        vi.advanceTimersByTime(20000);
        expect(readSave().status).toBe("missing");
        if (outcome === "victory") {
            expect(JSON.parse(window.localStorage.getItem("kcq.clears")!)).toEqual({ plains_1: "standard" });
            expect(JSON.parse(window.localStorage.getItem("kcq.unlocks")!).skunk).toContain("plains_2");
        }
        document.querySelector<HTMLButtonElement>(".kcq-victory-story__continue")?.click();
        if (outcome === "defeat") button("Retry");
        else {
            // Victory returns to selection; retry is offered only after defeat.
            button("Back to Level Select");
            const row = [...document.querySelectorAll<HTMLButtonElement>(".kcq-encounter-picker__row")]
                .find(row => row.querySelector(".kcq-encounter-picker__name")?.textContent === presentation.encounter("plains_1"))!;
            row.click(); button("Choose Difficulty"); button("Start Encounter");
        }
        expect(saved().stats.stats.actions).toBe(0);
        expect(saved().saveState).toEqual(app.sessions[1]!.engine.getSaveState());
    });

    it("starts the next encounter with its own initial autosave after a continued victory", () => {
        seedSave("plains_1"); const app = mount(); click(".kcq-title-screen__continue");
        const engine = app.restoredEngines[0]!;
        const state = engine.getGameState();
        vi.spyOn(engine, "getGameState").mockReturnValue({ ...state, turn: { ...state.turn, outcome: "victory" } });
        vi.spyOn(engine, "executeAction").mockReturnValue({ success: true, frames: [], actions: engine.getActionView() });
        endTurn(); expect(readSave().status).toBe("missing");
        document.querySelector<HTMLButtonElement>(".kcq-victory-story__continue")?.click();
        expect(document.querySelector(".kcq-battle-result__summary")?.textContent).toContain("2 Actions");
        click(".kcq-battle-result__next");
        expect(readSave().status).toBe("missing");
        button("Choose Difficulty"); button("Start Encounter");
        expect(saved().saveState.encounter).toBe("plains_2");
        expect(saved().stats.stats.actions).toBe(0);
        expect(saved().saveState).toEqual(app.sessions[0]!.engine.getSaveState());
    });

    it.each(["corrupted", "incompatible"] as const)("explains %s saves without deleting them and allows a new battle", status => {
        const value = status === "corrupted" ? "broken save" : compressToBase64(JSON.stringify({ version: "old-version" }));
        window.localStorage.setItem(AUTOSAVE_STORAGE_KEY, value); const app = mount();
        expect(document.querySelector(".kcq-title-screen__continue")).toBeNull();
        expect(titleError()).toBe(presentation.ui(`title.save.${status}`));
        expect(encoded()).toBe(value); expect(app.composeCampaign).not.toHaveBeenCalled();
        start(); expect(readSave().status).toBe("loaded");
    });

    it("shows no Continue or error for a missing save", () => {
        expect(document.querySelector(".kcq-title-screen__resume")).toBeNull();
        mount(); expect(document.querySelector(".kcq-title-screen__continue")).toBeNull(); expect(titleError()).toBeUndefined();
    });

    it.each(["references", "engine", "terminal", "campaign", "phase"])("handles restoration failure (%s) without committing a session or deleting the save", failure => {
        const source = seedSave();
        if (failure === "references") source.save.saveState.encounter = "missing-encounter";
        if (failure === "terminal") source.save.stats.terminal = true;
        if (failure === "campaign") source.save.saveState.campaign = "missing-campaign";
        if (failure === "phase") source.save.saveState.turn.phase = "enemy";
        writeSave(source.save); const before = encoded();
        const app = mount(engine => {
            if (failure === "engine") vi.mocked(engine.loadSaveState).mockImplementation(() => { throw new Error("private details"); });
        });
        click(".kcq-title-screen__continue");
        expect(titleError()).toBe(presentation.ui("title.save.corrupted"));
        expect(document.querySelector(".kcq-battle-stage")).toBeNull();
        expect(document.body.textContent).not.toContain("private details");
        expect(app.prepareBattle).not.toHaveBeenCalled(); expect(encoded()).toBe(before);
        if (failure === "phase") expect(app.composeCampaign).not.toHaveBeenCalled();
        start(); expect(document.querySelector(".kcq-battle-overview")).not.toBeNull();
    });

    it("reports inaccessible storage while allowing initialization and decisions", () => {
        vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new Error("blocked"); });
        const app = mount(); expect(titleError()).toBe(presentation.ui("title.save.inaccessible"));
        start(); const before = app.sessions[0]!.engine.getGameState().turn.round;
        endTurn(); expect(app.sessions[0]!.engine.getGameState().turn.round).toBe(before + 1);
    });

    it.each(["normal", "instant"])("reports failed snapshots and writes until saving recovers with %s playback", speed => {
        window.localStorage.setItem("kcq.playbackSpeed", speed);
        const app = mount(); start(); const engine = app.sessions[0]!.engine;
        const before = encoded();
        const warning = () => document.querySelector(".kcq-autosave-warning");
        expect(warning()).toBeNull();
        const snapshot = vi.spyOn(engine, "getSaveState").mockImplementation(() => { throw new Error("snapshot failed"); });
        endTurn(); vi.advanceTimersByTime(20000); expect(encoded()).toBe(before);
        expect(warning()?.getAttribute("role")).toBe("alert");
        expect(warning()?.textContent).toBe(presentation.ui("autosave.failed"));
        snapshot.mockRestore();
        const writes = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
        endTurn(); vi.advanceTimersByTime(20000); expect(encoded()).toBe(before);
        expect(warning()).not.toBeNull();
        expect(engine.getGameState().turn.round).toBe(3);
        click(".kcq-battle-overview__secondary-action");
        expect(warning()).not.toBeNull();
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", bubbles: true }));
        writes.mockRestore();
        endTurn(); vi.advanceTimersByTime(20000);
        expect(warning()).toBeNull();
        expect(saved().saveState).toEqual(engine.getSaveState());
        expect(saved().stats.stats.actions).toBe(3);
    });

    it("reports an initial autosave failure and clears the warning after the next successful save", () => {
        const app = mount();
        const writes = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
        start();
        expect(encoded()).toBeNull();
        expect(document.querySelector(".kcq-autosave-warning")?.textContent).toBe(presentation.ui("autosave.failed"));
        writes.mockRestore();
        endTurn();
        expect(document.querySelector(".kcq-autosave-warning")).toBeNull();
        expect(saved().saveState).toEqual(app.sessions[0]!.engine.getSaveState());
    });
});
