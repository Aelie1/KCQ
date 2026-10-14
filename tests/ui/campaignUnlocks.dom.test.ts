import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BattleState, DifficultyId, EncounterId } from "../../src/engine/public/types";
import { createStockEngine } from "../../src/stock";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createBattle } from "../../src/ui/web/app";
import { GraphicalApp } from "../../src/ui/web/app/GraphicalApp";
import { stockStrings } from "../helpers/stockStrings";

const presentation = new Presentation(stockStrings);
let unmount: (() => void) | undefined;
beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("kcq.playbackSpeed", "instant");
    vi.stubGlobal("__KCQ_GIT_REVISION__", "test");
});
afterEach(() => {
    unmount?.(); unmount = undefined;
    document.body.replaceChildren();
    vi.restoreAllMocks(); vi.unstubAllGlobals();
    window.localStorage.clear();
});
function element<T extends HTMLElement = HTMLElement>(selector: string): T {
    const found = document.querySelector<T>(selector);
    if (!found) throw new Error("Missing " + selector);
    return found;
}
function mount() {
    const sessions: { engine: ReturnType<typeof createStockEngine>; dispose: ReturnType<typeof vi.fn> }[] = [];
    const prepareBattle = vi.fn((_campaign: "skunk", encounter: EncounterId, difficulty: DifficultyId) => {
        const engine = createStockEngine(12345); createBattle(engine, encounter, difficulty);
        const session = { engine, dispose: vi.fn() }; sessions.push(session); return session;
    });
    const host = document.createElement("div"); document.body.append(host);
    unmount = render(() => createComponent(GraphicalApp, {
        campaigns: ["skunk"], release: "test", presentation, prepareBattle,
        composeCampaign: () => ({ engine: createStockEngine(), presentation }),
    }), host);
    element(".kcq-title-screen__campaign").click();
    return { sessions, prepareBattle };
}
const toggle = () => element<HTMLInputElement>(".kcq-encounter-picker__show-all input");
const names = () => [...document.querySelectorAll(".kcq-encounter-picker__name")].map(row => row.textContent);
const encounterNames = (ids: string[]) => ids.map(id => presentation.encounter(id));
function select(id: string) {
    const row = [...document.querySelectorAll<HTMLButtonElement>(".kcq-encounter-picker__row")]
        .find(row => row.querySelector(".kcq-encounter-picker__name")?.textContent === presentation.encounter(id));
    if (!row) throw new Error("Missing encounter " + id);
    row.click();
}
function start(id: string) {
    select(id);
    element(".kcq-encounter-details__footer [data-kcq-shortcut=enter]").click();
    element(".kcq-difficulty-select__footer [data-kcq-shortcut=enter]").click();
}
function finish(engine: ReturnType<typeof createStockEngine>, outcome: BattleState) {
    const state = engine.getGameState();
    vi.spyOn(engine, "getGameState").mockReturnValue({ ...state, turn: { ...state.turn, outcome } });
    vi.spyOn(engine, "executeAction").mockReturnValue({ success: true, frames: [], actions: engine.getActionView() });
    press(" ");
}
function returnFromResult() {
    document.querySelector<HTMLButtonElement>(".kcq-victory-story button")?.click();
    element(".kcq-battle-result__back").click();
}
function press(key: string) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
}

describe("campaign unlock UI integration", () => {
    it.each([
        ["interlude_1", "forest_1"], ["interlude_2", "tower_1"],
        ["interlude_3", "epilogue"], ["epilogue", "outside"],
    ])("opening %s unlocks %s even through Show All, without combat or clears", (story, next) => {
        window.localStorage.setItem("kcq.clears", JSON.stringify({ plains_1: "mythic" }));
        const { prepareBattle } = mount();
        toggle().click();
        expect(window.localStorage.getItem("kcq.unlocks")).toBeNull();
        select(story);
        expect(JSON.parse(window.localStorage.getItem("kcq.unlocks")!)).toEqual({ skunk: [next] });
        expect(JSON.parse(window.localStorage.getItem("kcq.clears")!)).toEqual({ plains_1: "mythic" });
        expect(prepareBattle).not.toHaveBeenCalled();
        press("Escape"); toggle().click();
        expect(names()).toEqual(encounterNames(Object.keys(createStockEngine().getLibrary().encounters)
            .filter(id => id === "prologue" || id === next)));
    });

    it("defaults to initial encounters and exposes a localized, labeled Show All checkbox", () => {
        const { prepareBattle } = mount();
        expect(toggle().checked).toBe(false);
        expect(toggle().closest("label")?.textContent).toBe(presentation.ui("encounter.showAll"));
        expect(names()).toEqual(encounterNames(["prologue"]));
        select("prologue");
        expect(prepareBattle).not.toHaveBeenCalled();
        expect(document.querySelector(".kcq-encounter-details h1")?.textContent).toBe(presentation.encounter("prologue"));
        expect(document.querySelector('[data-kcq-shortcut="enter"]')?.textContent).toContain(presentation.ui("encounter.nextLevel"));
        expect(JSON.parse(window.localStorage.getItem("kcq.unlocks")!)).toEqual({ skunk: ["plains_1"] });
        expect(document.querySelector(".kcq-encounter-picker__show-all")).toBeNull();
        expect(window.localStorage.getItem("kcq.clears")).toBeNull();
        press("Escape");
        expect(names()).toEqual(encounterNames(["prologue", "plains_1"]));
        select("prologue"); press("Escape");
        expect(names()).toEqual(encounterNames(["prologue", "plains_1"]));
    });

    it("plays a locked encounter through Show All and restores the filtered list without saving it", () => {
        const { prepareBattle } = mount();
        toggle().click();
        expect(names()).toEqual(encounterNames(Object.keys(createStockEngine().getLibrary().encounters)));
        start("outside");
        expect(prepareBattle).toHaveBeenCalledExactlyOnceWith("skunk", "outside", "standard");
        element(".kcq-combat-header__settings").click();
        const back = [...document.querySelectorAll<HTMLButtonElement>(".kcq-battle-settings button")]
            .find(button => button.textContent === presentation.ui("battleResult.back"))!;
        back.click();
        expect(toggle().checked).toBe(true);
        toggle().click();
        expect(names()).toEqual(encounterNames(["prologue"]));
        expect(window.localStorage.getItem("kcq.unlocks")).toBeNull();
        expect(window.localStorage.getItem("kcq.clears")).toBeNull();
    });

    it("records victory before returning to the picker and immediately includes the new encounter", () => {
        const { sessions } = mount();
        select("prologue"); press("Escape");
        start("plains_1"); finish(sessions[0]!.engine, "victory");
        expect(JSON.parse(window.localStorage.getItem("kcq.unlocks")!)).toEqual({ skunk: ["plains_1", "plains_2"] });
        expect(JSON.parse(window.localStorage.getItem("kcq.clears")!)).toEqual({ plains_1: "standard" });
        returnFromResult();
        expect(names()).toEqual(encounterNames(["prologue", "plains_1", "plains_2"]));
    });

    it("unlocks Tower 2 and Tower 3 on defeat and selects the correct visible encounter by shortcut", () => {
        const { sessions, prepareBattle } = mount();
        toggle().click(); start("tower_1"); finish(sessions[0]!.engine, "defeat"); returnFromResult();
        toggle().click();
        expect(names()).toEqual(encounterNames(["prologue", "tower_2"]));
        press("2");
        expect(document.querySelector(".kcq-encounter-details h1")?.textContent).toBe(presentation.encounter("tower_2"));
        press("Enter"); press("Enter");
        expect(prepareBattle).toHaveBeenLastCalledWith("skunk", "tower_2", "standard");
        finish(sessions[1]!.engine, "defeat"); returnFromResult();
        expect(names()).toEqual(encounterNames(["prologue", "tower_2", "tower_3"]));
        expect(JSON.parse(window.localStorage.getItem("kcq.unlocks")!)).toEqual({ skunk: ["tower_2", "tower_3"] });
        expect(window.localStorage.getItem("kcq.clears")).toBeNull();
        toggle().click(); toggle().click();
        press("3");
        expect(document.querySelector(".kcq-encounter-details h1")?.textContent).toBe(presentation.encounter("tower_3"));
    });

    it("retries an ongoing Tower battle without unlocking the next encounter", () => {
        const { sessions, prepareBattle } = mount();
        toggle().click(); start("tower_1");
        element(".kcq-combat-header__settings").click();
        const retry = [...document.querySelectorAll<HTMLButtonElement>(".kcq-battle-settings button")]
            .find(button => button.textContent === presentation.ui("battleSettings.retry"))!;
        retry.click();
        expect(prepareBattle).toHaveBeenCalledTimes(2);
        expect(sessions[0]!.dispose).toHaveBeenCalledOnce();
        expect(window.localStorage.getItem("kcq.unlocks")).toBeNull();
    });
});
