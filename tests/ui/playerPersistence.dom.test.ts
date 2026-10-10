import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStockEngine } from "../../src/stock";
import type { BattleState, DifficultyId, EncounterId } from "../../src/engine/public/types";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createBattle } from "../../src/ui/web/app";
import { GraphicalApp } from "../../src/ui/web/app/GraphicalApp";
import { stockStrings } from "../helpers/stockStrings";

const presentation = new Presentation(stockStrings);
const alternate = new Presentation({ ...stockStrings, "ui.title.name": "Translated Quest" });
const languages = [
    { id: "en", label: "English", presentation },
    { id: "test", label: "Test", presentation: alternate },
];
let unmount: (() => void) | undefined;
beforeEach(() => { window.localStorage.clear(); window.localStorage.setItem("kcq.playbackSpeed", "instant"); vi.stubGlobal("__KCQ_GIT_REVISION__", "test"); });
afterEach(() => {
    unmount?.(); unmount = undefined;
    document.body.replaceChildren();
    vi.restoreAllMocks(); vi.unstubAllGlobals(); window.localStorage.clear();
});

function click(selector: string) {
    const element = document.querySelector<HTMLButtonElement>(selector);
    if (!element) throw new Error("Missing " + selector);
    element.click();
}
function button(label: string) {
    const element = [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => {
        const content = button.cloneNode(true) as HTMLElement;
        content.querySelectorAll(".kcq-shortcut").forEach(shortcut => shortcut.remove());
        return content.textContent?.trim() === label;
    });
    if (!element) throw new Error("Missing button " + label);
    element.click();
}
function mount(supported = languages) {
    unmount?.();
    document.body.replaceChildren();
    const sessions: ReturnType<typeof createStockEngine>[] = [];
    const root = document.createElement("div"); document.body.append(root);
    unmount = render(() => createComponent(GraphicalApp, {
        campaigns: ["skunk"], release: "test", presentation, languages: supported,
        composeCampaign: () => ({ engine: createStockEngine(), presentation, languages: supported }),
        prepareBattle: (_campaign, encounter: EncounterId, difficulty: DifficultyId) => {
            const engine = createStockEngine(12345);
            createBattle(engine, encounter, difficulty); sessions.push(engine);
            return { engine, dispose: vi.fn() };
        },
    }), root);
    return { root, sessions };
}
function selectLanguage(id: string) {
    const select = document.querySelector<HTMLSelectElement>(".kcq-title-screen select")!;
    select.value = id; select.dispatchEvent(new Event("change", { bubbles: true }));
}
function start(difficulty = "Standard") {
    if (document.querySelector(".kcq-title-screen")) click(".kcq-title-screen__campaign");
    click(".kcq-encounter-picker__row"); button("Choose Difficulty"); button(difficulty); button("Start Encounter");
}
function finish(engine: ReturnType<typeof createStockEngine>, outcome: BattleState) {
    const getState = engine.getGameState.bind(engine);
    vi.spyOn(engine, "getGameState").mockImplementation(() => {
        const state = getState(); state.turn.outcome = outcome; return state;
    });
    button("End Turn");
}
const clearLabel = () => document.querySelector(".kcq-encounter-picker__best-clear")?.textContent;

describe("player persistence in the graphical application", () => {
    it("saves reactive language changes and restores selection and presentation on remount", () => {
        mount();
        expect(document.querySelector<HTMLSelectElement>(".kcq-title-screen select")?.value).toBe("en");
        const title = document.querySelector(".kcq-title-screen");
        selectLanguage("test");
        expect(document.querySelector(".kcq-title-screen")).toBe(title);
        expect(title?.querySelector("h1")?.textContent).toBe("Translated Quest");
        expect(window.localStorage.getItem("kcq.language")).toBe("test");
        mount();
        expect(document.querySelector<HTMLSelectElement>(".kcq-title-screen select")?.value).toBe("test");
        expect(document.querySelector(".kcq-title-screen h1")?.textContent).toBe("Translated Quest");
    });

    it("falls back to English when a saved language is no longer supported", () => {
        window.localStorage.setItem("kcq.language", "test"); mount([languages[0]!]);
        expect(document.querySelector<HTMLSelectElement>(".kcq-title-screen select")?.value).toBe("en");
    });

    it("restores multiple clears in encounter selection and details", () => {
        window.localStorage.setItem("kcq.clears", JSON.stringify({ plains_1: "extreme", plains_2: "casual", unknown: "mythic" }));
        mount(); click(".kcq-title-screen__campaign");
        const labels = [...document.querySelectorAll(".kcq-encounter-picker__best-clear")].map(row => row.textContent);
        expect(labels.slice(0, 3)).toEqual(["👑 Extreme", "👑 Casual", "👑 ---"]);
        click(".kcq-encounter-picker__row");
        expect(document.querySelector(".kcq-encounter-details__best-clear")?.textContent).toBe("👑 Extreme");
    });

    it("saves before leaving a victory, restores on remount, and never downgrades", () => {
        let { sessions } = mount(); start("Veteran"); finish(sessions[0]!, "victory");
        expect(JSON.parse(window.localStorage.getItem("kcq.clears")!)).toEqual({ plains_1: "veteran" });
        button("Back to Level Select"); expect(clearLabel()).toBe("👑 Veteran");
        ({ sessions } = mount()); click(".kcq-title-screen__campaign"); expect(clearLabel()).toBe("👑 Veteran");
        start("Casual"); finish(sessions[0]!, "victory"); button("Back to Level Select");
        expect(clearLabel()).toBe("👑 Veteran");
        expect(JSON.parse(window.localStorage.getItem("kcq.clears")!)).toEqual({ plains_1: "veteran" });
    });

    it("does not update progress after defeat, quitting, or restarting", () => {
        const { sessions } = mount(); start(); finish(sessions[0]!, "defeat");
        button("Back to Level Select"); expect(clearLabel()).toBe("👑 ---");
        start(); click(".kcq-battle-overview .kcq-combat-header__settings"); button("Retry Battle");
        click(".kcq-battle-overview .kcq-combat-header__settings"); button("Back to Level Select");
        expect(clearLabel()).toBe("👑 ---"); expect(window.localStorage.getItem("kcq.clears")).toBeNull();
    });

    it("keeps reactive language and progress working when storage access is blocked", () => {
        vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new Error("blocked"); });
        const { sessions } = mount(); selectLanguage("test");
        expect(document.querySelector<HTMLSelectElement>(".kcq-title-screen select")?.value).toBe("test");
        start();
        // The in-session speed still works when persistence is unavailable.
        click(".kcq-battle-overview .kcq-combat-header__settings");
        const speed = document.querySelector<HTMLSelectElement>(".kcq-battle-settings__playback-speed select")!;
        speed.value = "instant"; speed.dispatchEvent(new Event("change", { bubbles: true }));
        button("Resume");
        finish(sessions[0]!, "victory"); button("Back to Level Select");
        expect(clearLabel()).toBe("👑 Standard");
    });

    it("starts normally after both keys are removed", () => {
        window.localStorage.setItem("kcq.language", "test");
        window.localStorage.setItem("kcq.clears", '{"plains_1":"mythic"}');
        window.localStorage.removeItem("kcq.language"); window.localStorage.removeItem("kcq.clears");
        mount(); expect(document.querySelector<HTMLSelectElement>(".kcq-title-screen select")?.value).toBe("en");
        click(".kcq-title-screen__campaign"); expect(clearLabel()).toBe("👑 ---");
    });
});
