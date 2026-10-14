import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BattleState, DifficultyId, EncounterId, EventFrame } from "../../src/engine/public/types";
import { createStockEngine } from "../../src/stock";
import { Presentation, type StringTable } from "../../src/ui/presentation/presentation";
import { createBattle } from "../../src/ui/web/app";
import { GraphicalApp } from "../../src/ui/web/app/GraphicalApp";
import { stockStrings } from "../helpers/stockStrings";
import { victoryNarrative, victoryStoryStrings } from "../helpers/victoryStory";

let unmount: (() => void) | undefined;
beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("kcq.playbackSpeed", "instant");
    vi.stubGlobal("__KCQ_GIT_REVISION__", "test");
});
afterEach(() => {
    unmount?.(); unmount = undefined;
    document.body.replaceChildren();
    vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
    window.localStorage.clear();
});

function element<T extends HTMLElement = HTMLElement>(selector: string): T {
    const found = document.querySelector<T>(selector);
    if (!found) throw new Error("Missing " + selector);
    return found;
}
function button(label: string): HTMLButtonElement {
    const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => {
        const content = button.cloneNode(true) as HTMLElement;
        content.querySelectorAll(".kcq-shortcut").forEach(shortcut => shortcut.remove());
        return content.textContent?.trim() === label;
    });
    if (!found) throw new Error("Missing button " + label);
    return found;
}
function mount(strings: StringTable = victoryStoryStrings) {
    const base = { ...stockStrings };
    delete base["encounter.plains_1.victory"];
    delete base["encounter.plains_1.defeat"];
    const presentation = new Presentation({ ...base, ...strings });
    const sessions: { engine: ReturnType<typeof createStockEngine>; dispose: ReturnType<typeof vi.fn> }[] = [];
    const host = document.createElement("div"); document.body.append(host);
    const prepareBattle = vi.fn((_campaign: "skunk", encounter: EncounterId, difficulty: DifficultyId) => {
        const engine = createStockEngine(12345); createBattle(engine, encounter, difficulty);
        const session = { engine, dispose: vi.fn() }; sessions.push(session); return session;
    });
    unmount = render(() => createComponent(GraphicalApp, {
        campaigns: ["skunk"], release: "test", presentation, prepareBattle,
        composeCampaign: () => ({ engine: createStockEngine(), presentation }),
    }), host);
    element(".kcq-title-screen__campaign").click();
    element('.kcq-encounter-picker__row[data-kcq-shortcut="1"]').click();
    element(".kcq-encounter-details__footer button").click();
    element('.kcq-encounter-picker__row[data-kcq-shortcut="2"]').click();
    button("Choose Difficulty").click(); button("Start Encounter").click();
    return { sessions, prepareBattle, presentation };
}
function finish(engine: ReturnType<typeof createStockEngine>, outcome: BattleState = "victory", frames: EventFrame[] = []) {
    const state = engine.getGameState();
    vi.spyOn(engine, "getGameState").mockReturnValue({ ...state, turn: { ...state.turn, outcome } });
    const execute = vi.spyOn(engine, "executeAction").mockReturnValue({ success: true, frames, actions: engine.getActionView() });
    button("End Turn").click();
    return execute;
}
function key(target: HTMLElement, key: string, shiftKey = false): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    target.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
    return event;
}

describe("victory story screen flow", () => {
    it("shows the story first and Continue opens the unchanged result statistics", () => {
        const { sessions, presentation } = mount();
        finish(sessions[0]!.engine);
        const story = element(".kcq-victory-story");
        expect(story.querySelector("h1")?.textContent).toBe(presentation.battleState("victory"));
        expect(story.querySelector(".kcq-battle-result__encounter")?.textContent).toBe(presentation.encounter("plains_1"));
        expect(story.querySelector(".kcq-victory-story__narrative")?.textContent).toBe(victoryNarrative);
        expect(story.querySelectorAll("button")).toHaveLength(1);
        expect(story.querySelector("dl")).toBeNull();
        expect(document.querySelector(".kcq-battle-result--victory")).toBeNull();
        expect(element(".kcq-battle-stage__background").hasAttribute("inert")).toBe(true);
        expect(element(".kcq-battle-stage__background").getAttribute("aria-hidden")).toBe("true");
        expect(element(".kcq-battle-result__overlay").parentElement?.parentElement).toBe(document.body);
        expect(document.activeElement).toBe(button("Continue"));
        // Victory is recorded before the narrative is dismissed.
        expect(JSON.parse(window.localStorage.getItem("kcq.clears")!)).toEqual({ plains_1: "standard" });
        button("Continue").click();
        expect(document.querySelector(".kcq-victory-story")).toBeNull();
        const result = element(".kcq-battle-result--victory");
        expect(result.querySelector(".kcq-battle-result__summary")?.textContent).toBe("1 Rounds · 1 Actions");
        expect(result.querySelector("dl")?.textContent).toContain("Peak Binding");
        expect(result.querySelectorAll("button")).toHaveLength(3);
        expect(document.activeElement).toBe(button("Retry"));
    });

    it("waits for combat playback to finish before showing the story and recording the clear", () => {
        vi.useFakeTimers();
        window.localStorage.setItem("kcq.playbackSpeed", "normal");
        const { sessions } = mount();
        const state = sessions[0]!.engine.getGameState();
        finish(sessions[0]!.engine, "victory", [{
            state: { ...state, turn: { ...state.turn, outcome: "victory" } },
            event: { type: "useMove", actor: "skunkette1", move: "latexSpray", effects: [], targets: [] },
        }]);
        expect(document.querySelector(".kcq-victory-story")).toBeNull();
        expect(document.querySelector(".kcq-battle-result--victory")).toBeNull();
        expect(window.localStorage.getItem("kcq.clears")).toBeNull();
        vi.advanceTimersByTime(499);
        expect(document.querySelector(".kcq-victory-story")).toBeNull();
        vi.advanceTimersByTime(1);
        expect(element(".kcq-victory-story")).toBeDefined();
        expect(JSON.parse(window.localStorage.getItem("kcq.clears")!)).toEqual({ plains_1: "standard" });
    });

    it.each([undefined, "", " \n\t", "...", "  ...  "])("skips directly to statistics with incomplete story text: %s", text => {
        const { sessions } = mount(text === undefined ? {} : { "encounter.plains_1.victory": text });
        finish(sessions[0]!.engine);
        expect(document.querySelector(".kcq-victory-story")).toBeNull();
        expect(element(".kcq-battle-result--victory").querySelector("dl")).not.toBeNull();
        expect(document.activeElement).toBe(button("Retry"));
    });

    it("preserves defeat results and navigation even when victory text exists", () => {
        const { sessions } = mount(); finish(sessions[0]!.engine, "defeat");
        expect(document.querySelector(".kcq-victory-story")).toBeNull();
        expect(element(".kcq-battle-result--defeat").textContent).toContain("Enemy HP Remaining");
        expect(window.localStorage.getItem("kcq.clears")).toBeNull();
        button("View Game Log").click();
        element(".kcq-game-log .kcq-combat-header__back").click();
        expect(element(".kcq-battle-result--defeat")).toBeDefined();
        button("Back to Level Select").click();
        expect(element(".kcq-encounter-picker")).toBeDefined();
    });

    it("shows an authored defeat narrative before statistics without recording a clear", () => {
        const { sessions } = mount({ ...victoryStoryStrings, "encounter.plains_1.defeat": "Defeat narrative fixture." });
        finish(sessions[0]!.engine, "defeat");
        expect(element(".kcq-victory-story h1").textContent).toBe("Defeat");
        expect(element(".kcq-victory-story__narrative").textContent).toBe("Defeat narrative fixture.");
        expect(document.querySelector(".kcq-battle-result--defeat")).toBeNull();
        expect(window.localStorage.getItem("kcq.clears")).toBeNull();
        button("Continue").click();
        expect(element(".kcq-battle-result--defeat").textContent).toContain("Enemy HP Remaining");
        button("View Game Log").click();
        element(".kcq-game-log .kcq-combat-header__back").click();
        expect(document.querySelector(".kcq-victory-story")).toBeNull();
        expect(element(".kcq-battle-result--defeat")).toBeDefined();
    });

    it("keeps a dismissed story dismissed through repeated Game Log visits", () => {
        const { sessions } = mount(); const execute = finish(sessions[0]!.engine);
        button("Continue").click();
        for (let visit = 0; visit < 2; visit += 1) {
            button("View Game Log").click();
            expect(document.querySelector('[role="dialog"]')).toBeNull();
            const back = element<HTMLButtonElement>(".kcq-game-log .kcq-combat-header__back");
            expect(document.activeElement).toBe(back);
            if (visit === 0) back.click(); else key(back, "Escape");
            expect(document.querySelector(".kcq-victory-story")).toBeNull();
            expect(element(".kcq-battle-result--victory")).toBeDefined();
            expect(document.activeElement).toBe(button("View Game Log"));
        }
        expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "endTurn" });
        button("Back to Level Select").click();
        expect(element(".kcq-encounter-picker__best-clear").textContent).toBe("👑 Standard");
        expect(sessions[0]!.dispose).toHaveBeenCalledOnce();
    });

    it("starts a fresh story dismissal state after retrying the encounter", () => {
        const { sessions, prepareBattle } = mount(); finish(sessions[0]!.engine);
        button("Continue").click(); button("Retry").click();
        expect(prepareBattle).toHaveBeenCalledTimes(2);
        expect(sessions[0]!.dispose).toHaveBeenCalledOnce();
        expect(document.querySelector(".kcq-victory-story")).toBeNull();
        expect(document.querySelector(".kcq-battle-result--victory")).toBeNull();
        finish(sessions[1]!.engine);
        expect(element(".kcq-victory-story")).toBeDefined();
    });

    it("labels the dialog, traps focus, permits keyboard reading, and blocks dismissal shortcuts", () => {
        const { sessions } = mount(); const execute = finish(sessions[0]!.engine);
        const story = element(".kcq-victory-story");
        const narrative = element(".kcq-victory-story__narrative");
        const proceed = button("Continue");
        expect(story.getAttribute("role")).toBe("dialog");
        expect(story.getAttribute("aria-modal")).toBe("true");
        expect(story.getAttribute("aria-labelledby")).toBe(story.querySelector("h1")?.id);
        expect(story.getAttribute("aria-describedby")).toBe(narrative.id);
        expect(narrative.tabIndex).toBe(0);
        expect(key(proceed, "Tab").defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(narrative);
        expect(key(narrative, "Tab", true).defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(proceed);
        expect(key(proceed, "Escape").defaultPrevented).toBe(true);
        for (const shortcut of ["-", "Escape", " ", "1"]) key(proceed, shortcut);
        expect(document.querySelector(".kcq-game-log")).toBeNull();
        expect(element(".kcq-victory-story")).toBe(story);
        expect(execute).toHaveBeenCalledTimes(1);
    });
});
