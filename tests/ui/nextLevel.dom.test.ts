import { readFileSync } from "node:fs";
import type { Window as HappyWindow } from "happy-dom";
import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStockEngine } from "../../src/stock";
import type { DifficultyId, EncounterId } from "../../src/engine/public/types";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createBattle } from "../../src/ui/web/app";
import { GraphicalApp } from "../../src/ui/web/app/GraphicalApp";
import { stockStrings } from "../helpers/stockStrings";

const viewport = (window as unknown as HappyWindow).happyDOM;
const initialViewport = { width: window.innerWidth, height: window.innerHeight };
const presentation = new Presentation(stockStrings);
const campaign = createStockEngine().getLibrary().campaigns.skunk;
let unmount: (() => void) | undefined;
beforeEach(() => {
    window.localStorage.clear(); window.localStorage.setItem("kcq.playbackSpeed", "instant");
    vi.stubGlobal("__KCQ_GIT_REVISION__", "test");
});
afterEach(() => {
    unmount?.(); unmount = undefined; document.body.replaceChildren();
    window.localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals();
    viewport.setViewport(initialViewport);
});
function element<T extends HTMLElement = HTMLElement>(selector: string): T {
    const found = document.querySelector<T>(selector);
    if (!found) throw new Error("Missing " + selector);
    return found;
}
function key(key: string, target: EventTarget = document, shiftKey = false) {
    const event = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    target.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
    return event;
}
function mount(localized = presentation) {
    const sessions: { engine: ReturnType<typeof createStockEngine>; dispose: ReturnType<typeof vi.fn> }[] = [];
    const prepareBattle = vi.fn((_campaign: "skunk", encounter: EncounterId, difficulty: DifficultyId) => {
        const engine = createStockEngine(12345); createBattle(engine, encounter, difficulty);
        const session = { engine, dispose: vi.fn() }; sessions.push(session); return session;
    });
    const style = document.createElement("style"); style.textContent = readFileSync("src/ui/web/app/tokens.css", "utf8") + readFileSync("src/ui/web/app/app.css", "utf8"); document.body.append(style);
    const host = document.createElement("div"); document.body.append(host);
    unmount = render(() => createComponent(GraphicalApp, {
        campaigns: ["skunk"], release: "test", presentation: localized, prepareBattle,
        composeCampaign: () => ({ engine: createStockEngine(), presentation: localized }),
    }), host);
    element(".kcq-title-screen__campaign").click();
    document.querySelector<HTMLButtonElement>(".kcq-party-selection__continue")!.click();
    return { sessions, prepareBattle };
}
function select(id: string, localized = presentation) {
    const row = [...document.querySelectorAll<HTMLButtonElement>(".kcq-encounter-picker__row")]
        .find(row => row.querySelector("strong")?.textContent === localized.encounter(id));
    if (!row) throw new Error("Missing encounter " + id);
    row.click();
}
function battle(encounter: string, outcome: "victory" | "defeat", localized = presentation, dismissStory = true) {
    const app = mount(localized);
    element<HTMLInputElement>(".kcq-encounter-picker__show-all input").click(); select(encounter, localized);
    key("Enter"); key("Enter");
    const engine = app.sessions[0]!.engine;
    const state = engine.getGameState();
    vi.spyOn(engine, "getGameState").mockReturnValue({ ...state, turn: { ...state.turn, outcome } });
    vi.spyOn(engine, "executeAction").mockReturnValue({ success: true, frames: [], actions: engine.getActionView() });
    key(" ");
    if (dismissStory) document.querySelector<HTMLButtonElement>(".kcq-victory-story__continue")?.click();
    return app;
}
const labels = () => [...element(".kcq-battle-result__actions").querySelectorAll("button")].map(button => button.textContent);
const details = () => element(".kcq-encounter-details h1").textContent;

describe("Next Level navigation", () => {
    it.each([["tower_1", true], ["plains_1", false]] as const)("keeps compact result actions readable for %s defeat", (encounter, hasNext) => {
        viewport.setViewport({ width: 390, height: 400 });
        battle(encounter, "defeat");
        expect(getComputedStyle(element(".kcq-battle-result__actions")).gridTemplateColumns).toBe("1fr 1fr");
        expect(getComputedStyle(element(".kcq-battle-result__log")).gridColumn).toBe("1 / -1");
        if (hasNext) expect(getComputedStyle(element(".kcq-battle-result__back")).gridColumn).toBe("1 / -1");
        expect(labels()).toEqual(hasNext ? ["View Game Log", "Next Level", "Retry", "Back to Level Select"]
            : ["View Game Log", "Retry", "Back to Level Select"]);
    });

    it("keeps the narrative Continue button cyan while result Retry becomes secondary", () => {
        battle("plains_1", "victory", presentation, false);
        const reference = document.createElement("button");
        reference.style.background = "var(--kcq-accent-primary)"; document.body.append(reference);
        const proceed = element(".kcq-victory-story__continue");
        expect(getComputedStyle(proceed).backgroundColor).toBe(getComputedStyle(reference).backgroundColor);
        proceed.click();
        expect(getComputedStyle(element(".kcq-battle-result__next")).backgroundColor).toBe(getComputedStyle(reference).backgroundColor);
        expect(getComputedStyle(element(".kcq-battle-result__retry")).backgroundColor).not.toBe(getComputedStyle(reference).backgroundColor);
    });

    it.each([
        ["plains_1", "victory", "plains_2"], ["plains_3", "victory", "interlude_1"],
        ["tower_1", "defeat", "tower_2"], ["tower_2", "defeat", "tower_3"],
        ["tower_1", "victory", campaign.victory.tower_1[0]], ["tower_2", "victory", campaign.victory.tower_2[0]],
    ] as const)("offers Next Level from %s %s and opens %s details", (encounter, outcome, next) => {
        const app = battle(encounter, outcome);
        expect(labels()).toEqual(["View Game Log", "Next Level", "Retry", "Back to Level Select"]);
        expect(document.activeElement).toBe(element(".kcq-battle-result__next"));
        const clears = window.localStorage.getItem("kcq.clears");
        const nextButton = element(".kcq-battle-result__next");
        expect(getComputedStyle(nextButton).backgroundColor).not.toBe(getComputedStyle(element(".kcq-battle-result__retry")).backgroundColor);
        expect(getComputedStyle(element(".kcq-battle-result__retry")).backgroundColor).toBe(getComputedStyle(element(".kcq-battle-result__back")).backgroundColor);
        nextButton.click();
        expect(details()).toBe(presentation.encounter(next));
        expect(document.querySelector(".kcq-difficulty-select")).toBeNull();
        expect(document.querySelector(".kcq-battle-overview")).toBeNull();
        expect(app.prepareBattle).toHaveBeenCalledTimes(1);
        expect(app.sessions[0]!.dispose).toHaveBeenCalledOnce();
        expect(window.localStorage.getItem("kcq.clears")).toBe(clears);
        if (createStockEngine().getLibrary().encounters[next].stars === 0) {
            const unlocked = JSON.parse(window.localStorage.getItem("kcq.unlocks")!).skunk;
            for (const id of campaign.victory[next]) expect(unlocked).toContain(id);
        }
    });

    it.each([["outside", "victory"], ["outside", "defeat"], ["plains_1", "defeat"]] as const)("omits Next Level after %s %s while keeping secondary Retry available", (encounter, outcome) => {
        const app = battle(encounter, outcome);
        expect(labels()).toEqual(["View Game Log", "Retry", "Back to Level Select"]);
        expect(document.querySelector(".kcq-battle-result__next")).toBeNull();
        const retry = element<HTMLButtonElement>(".kcq-battle-result__retry");
        expect(retry.disabled).toBe(false);
        expect(document.activeElement).toBe(retry);
        expect(getComputedStyle(retry).backgroundColor).toBe(getComputedStyle(element(".kcq-battle-result__back")).backgroundColor);
        retry.click();
        expect(app.prepareBattle).toHaveBeenCalledTimes(2);
        expect(app.sessions[0]!.dispose).toHaveBeenCalledOnce();
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(document.querySelector(".kcq-battle-overview")).not.toBeNull();
    });

    it.each(["prologue", "interlude_1", "interlude_2", "interlude_3", "epilogue"])("advances story %s to details with the existing footer shortcut", story => {
        const app = mount();
        element(".kcq-encounter-picker__show-all input").click(); select(story);
        const footer = element(".kcq-encounter-details__footer");
        expect(footer.querySelectorAll("button")).toHaveLength(2);
        expect(footer.querySelector('[data-kcq-shortcut="escape"]')).not.toBeNull();
        const next = footer.querySelector<HTMLButtonElement>('[data-kcq-shortcut="enter"]')!;
        expect(next.textContent).toContain(presentation.ui("encounter.nextLevel"));
        expect(next.classList.contains("kcq-battle-overview__primary-action")).toBe(true);
        expect(footer.textContent).not.toContain(presentation.ui("encounter.chooseDifficulty"));
        key("Enter");
        const destination = campaign.victory[story][0];
        expect(details()).toBe(presentation.encounter(destination));
        expect(app.prepareBattle).not.toHaveBeenCalled();
        expect(window.localStorage.getItem("kcq.clears")).toBeNull();
        if (destination === "epilogue") expect(JSON.parse(window.localStorage.getItem("kcq.unlocks")!).skunk).toContain("outside");
    });

    it("preserves result focus trapping, Game Log return, and level-select navigation", () => {
        const app = battle("tower_1", "defeat");
        const stats = element(".kcq-battle-result__stats"); const back = element(".kcq-battle-result__back");
        stats.focus(); expect(key("Tab", stats, true).defaultPrevented).toBe(true); expect(document.activeElement).toBe(back);
        expect(key("Tab", back).defaultPrevented).toBe(true); expect(document.activeElement).toBe(stats);
        const next = element(".kcq-battle-result__next"); next.focus();
        expect(key("Escape", next).defaultPrevented).toBe(true);
        expect(key("Enter", next).defaultPrevented).toBe(false);
        element(".kcq-battle-result__log").click();
        element(".kcq-game-log .kcq-combat-header__back").click();
        expect(document.activeElement).toBe(element(".kcq-battle-result__log"));
        expect(labels()).toEqual(["View Game Log", "Next Level", "Retry", "Back to Level Select"]);
        element(".kcq-battle-result__back").click();
        expect(element<HTMLInputElement>(".kcq-encounter-picker__show-all input").checked).toBe(true);
        expect(app.sessions[0]!.dispose).toHaveBeenCalledOnce();
    });

    it("uses the same localized label in stories and battle results", () => {
        const localized = new Presentation({ ...stockStrings, "ui.encounter.nextLevel": "Advance fixture" });
        mount(localized); select("prologue", localized);
        expect(element('[data-kcq-shortcut="enter"]').textContent).toContain("Advance fixture");
        key("Enter"); key("Enter");
        expect(document.querySelector(".kcq-difficulty-select")).not.toBeNull();
        unmount!(); unmount = undefined; document.body.replaceChildren();
        battle("plains_1", "victory", localized);
        expect(element(".kcq-battle-result__next").textContent).toBe("Advance fixture");
    });
});
