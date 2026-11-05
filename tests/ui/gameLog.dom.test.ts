import { createComponent, createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCampaignLibrary, createCharacterLibrary, createEngine } from "../../src/content";
import type { ActionResult, DifficultyId, EncounterId, GameState } from "../../src/engine/public/types";
import { createStockEngine } from "../../src/stock";
import { createGameLogEntries, type GameLogPresentationEntry } from "../../src/ui/presentation/gameLog";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createBattle } from "../../src/ui/web/app";
import { GraphicalApp } from "../../src/ui/web/app/GraphicalApp";
import type { FullLogStyle } from "../../src/ui/web/app/gameLogMode";
import { GameLogPanel } from "../../src/ui/web/app/panels/GameLogPanel";
import { createGameLogViewModel } from "../../src/ui/web/app/viewModels/gameLog";
import { stockStrings } from "../helpers/stockStrings";

const presentation = new Presentation(stockStrings);
let unmount: (() => void) | undefined;
beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("kcq.playbackSpeed", "instant");
    vi.stubGlobal("__KCQ_GIT_REVISION__", "test");
});
afterEach(() => {
    unmount?.();
    unmount = undefined;
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
function button(label: string, scope: ParentNode = document): HTMLButtonElement {
    const found = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(button => {
        const content = button.cloneNode(true) as HTMLElement;
        content.querySelectorAll(".kcq-shortcut").forEach(shortcut => shortcut.remove());
        return content.textContent?.trim() === label;
    });
    if (!found) throw new Error("Missing button: " + label);
    return found;
}
function click(selector: string): void {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error("Missing control: " + selector);
    element.click();
}
function chooseEncounter(encounter: string): void {
    const row = [...document.querySelectorAll<HTMLButtonElement>(".kcq-encounter-picker__row")]
        .find(row => row.querySelector("strong")?.textContent === presentation.encounter(encounter));
    if (!row) throw new Error("Missing encounter: " + encounter);
    row.click();
    button("Choose Difficulty").click();
    button("Start Encounter").click();
}
function mountBattle() {
    const alternate = new Presentation({
        ...stockStrings,
        "move.telekinesis.name": "Translated move", "entity.ko.name": "Translated actor",
        "ui.gameLog.chronological": "Translated history",
        "ui.gameLog.hitDamage": "{band}: {amount} translated damage",
    });
    const sessions: { engine: ReturnType<typeof createStockEngine>; dispose: ReturnType<typeof vi.fn> }[] = [];
    const prepareBattle = vi.fn((_campaign: "skunk", encounter: EncounterId, difficulty: DifficultyId) => {
        const engine = createStockEngine(12345 + sessions.length);
        createBattle(engine, encounter, difficulty);
        const session = { engine, dispose: vi.fn() };
        sessions.push(session);
        return session;
    });
    const host = document.createElement("div");
    document.body.append(host);
    unmount = render(() => createComponent(GraphicalApp, {
        characterLibrary: createCharacterLibrary(), createEngine,
        campaigns: ["skunk"], release: "test", presentation, prepareBattle,
        composeCampaign: () => ({
            library: createCampaignLibrary(["ko", "matsuko", "hinari"], "skunk"), presentation,
            languages: [{ id: "en", label: "English", presentation }, { id: "test", label: "Test", presentation: alternate }]
        }),
        languages: [{ id: "en", label: "English", presentation }, { id: "test", label: "Test", presentation: alternate }],
    }), host);
    document.querySelector<HTMLButtonElement>(".kcq-patch-notes__footer button")?.click();
    click(".kcq-title-screen__campaign");
    click('.kcq-encounter-picker__row[data-kcq-shortcut="1"]');
    click(".kcq-encounter-details__footer button");
    chooseEncounter("plains_1");
    return { sessions, prepareBattle, engine: sessions[0]!.engine };
}
function useTelekinesis(): void {
    const card = [...document.querySelectorAll<HTMLElement>(".kcq-party-card")]
        .find(card => card.textContent?.includes(presentation.entity("ko")));
    if (!card) throw new Error("Missing Ko-chan card");
    card.click();
    click('.kcq-command-card[aria-label="Telekinesis"]');
    click("button.kcq-target-card");
}
function logEntries(): HTMLElement[] {
    return [...(document.querySelector(".kcq-game-log__scroll") ?? document).querySelectorAll<HTMLElement>(".kcq-game-log__entry")];
}
function expectHistory(results: readonly ActionResult[], initial: GameState): void {
    const expected = createGameLogViewModel(createGameLogEntries(results.flatMap(result => result.success ? result.frames : []), initial), presentation, initial.characters.map(character => character.id));
    const actual = logEntries();
    expect(actual.map(entry => entry.dataset.kind)).toEqual(expected.map(entry => entry.kind));
    expected.forEach((entry, index) => {
        if (entry.title) expect(actual[index]!.querySelector(".kcq-game-log__title")?.textContent).toBe(entry.title);
        expect([...actual[index]!.querySelectorAll<HTMLElement>("[data-outcome]")].map(row => row.dataset.outcome))
            .toEqual(entry.rows.map(row => row.kind));
        entry.rows.forEach((row, rowIndex) => {
            const actualRow = actual[index]!.querySelectorAll("[data-outcome]")[rowIndex]!;
            expect([...actualRow.querySelectorAll(".kcq-game-log__value")].map(value => value.textContent)).toEqual(row.values.map(value => value.text));
            expect(actualRow.querySelector(".kcq-game-log__target")?.textContent).toBe(row.target);
        });
    });
}

describe("live graphical Game Log history", () => {
    it("updates the overview preview after player and enemy actions and opens the existing full log", () => {
        const { engine } = mountBattle();
        const execute = vi.spyOn(engine, "executeAction");
        const preview = () => document.querySelector<HTMLButtonElement>(".kcq-compact-game-log")!;
        expect(preview().textContent).toContain("No combat events yet.");
        expect(document.querySelector(".kcq-screen-layout__content")!.firstElementChild).toBe(preview().closest(".kcq-battle-section--game-log"));
        useTelekinesis();
        expect(preview().textContent).toContain("Telekinesis");
        preview().click();
        expect(document.querySelector(".kcq-game-log__scroll")).not.toBeNull();
        click(".kcq-combat-header__back");
        expect(document.querySelector(".kcq-battle-overview")).not.toBeNull();
        button("End Turn").click();
        const recent = [...preview().querySelectorAll<HTMLElement>(".kcq-game-log__entry")];
        expect(recent.some(entry => entry.dataset.actor?.startsWith("skunkette"))).toBe(true);
        expect(recent.every(entry => entry.dataset.kind !== "phase")).toBe(true);
        preview().click();
        expect(document.querySelector('.kcq-game-log__scroll [data-kind="phase"]')).not.toBeNull();
        expect(execute).toHaveBeenCalledTimes(2);
    });

    it("allows native Enter activation of the preview", () => {
        const key = "Enter";
        const { engine } = mountBattle();
        const execute = vi.spyOn(engine, "executeAction");
        const preview = document.querySelector<HTMLButtonElement>(".kcq-compact-game-log")!;
        preview.focus();
        const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
        preview.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
        // happy-dom does not synthesize native keyboard clicks; perform the browser default.
        preview.click();
        expect(document.querySelector(".kcq-game-log__scroll")).not.toBeNull();
        expect(execute).not.toHaveBeenCalled();
        click(".kcq-combat-header__back");
        expect(document.querySelector(".kcq-battle-overview")).not.toBeNull();
    });

    it("uses Space for End Turn from Overview even when the log preview has focus", () => {
        const { engine } = mountBattle();
        const execute = vi.spyOn(engine, "executeAction");
        const preview = document.querySelector<HTMLButtonElement>(".kcq-compact-game-log")!;
        preview.focus();
        const event = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
        preview.dispatchEvent(event);
        document.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true }));
        expect(event.defaultPrevented).toBe(true);
        expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "endTurn" });
        expect(document.querySelector(".kcq-game-log__scroll")).toBeNull();
    });

    it("changes preview lines immediately without recreating the battle and keeps full-log access at zero", () => {
        const { prepareBattle } = mountBattle();
        useTelekinesis();
        click(".kcq-combat-header__settings");
        const slider = document.querySelector<HTMLInputElement>('.kcq-battle-settings__log-lines input')!;
        slider.value = "0"; slider.dispatchEvent(new Event("input", { bubbles: true }));
        expect(document.querySelector(".kcq-compact-game-log")).toBeNull();
        button("Resume").click();
        document.querySelector<HTMLButtonElement>(".kcq-battle-overview__secondary-action")!.click();
        expect(document.querySelector(".kcq-game-log__scroll")!.textContent).toContain("Telekinesis");
        click(".kcq-combat-header__back");
        click(".kcq-combat-header__settings");
        const nextSlider = document.querySelector<HTMLInputElement>('.kcq-battle-settings__log-lines input')!;
        expect(nextSlider.value).toBe("0");
        nextSlider.value = "8"; nextSlider.dispatchEvent(new Event("input", { bubbles: true }));
        expect(document.querySelector(".kcq-compact-game-log")!.textContent).toContain("Telekinesis");
        button("Resume").click();
        expect(prepareBattle).toHaveBeenCalledTimes(1);
        expect(window.localStorage.getItem("kcq.overviewGameLogLines")).toBe("8");
    });

    it("preserves player and enemy events across actions and reopening the log without duplication", () => {
        const { engine } = mountBattle();
        const initial = engine.getGameState();
        const execute = vi.spyOn(engine, "executeAction");
        document.querySelector<HTMLButtonElement>(".kcq-battle-overview__secondary-action")!.click();
        expect(logEntries()).toHaveLength(0);
        expect(document.querySelector(".kcq-game-log__empty")?.textContent).toBe("No combat events yet.");
        click(".kcq-combat-header__back");
        useTelekinesis();
        document.querySelector<HTMLButtonElement>(".kcq-battle-overview__secondary-action")!.click();
        expectHistory(execute.mock.results.map(result => result.value), initial);
        expect(logEntries()).toHaveLength(1);
        const firstHTML = document.querySelector(".kcq-game-log__scroll")!.innerHTML;
        click(".kcq-combat-header__back");
        document.querySelector<HTMLButtonElement>(".kcq-battle-overview__secondary-action")!.click();
        expect(document.querySelector(".kcq-game-log__scroll")!.innerHTML).toBe(firstHTML);
        expect(execute).toHaveBeenCalledTimes(1);
        click(".kcq-combat-header__back");
        button("End Turn").click();
        document.querySelector<HTMLButtonElement>(".kcq-battle-overview__secondary-action")!.click();
        expectHistory(execute.mock.results.map(result => result.value), initial);
        expect(logEntries().filter(entry => entry.dataset.actor?.startsWith("skunkette"))).not.toHaveLength(0);
        expect(logEntries().filter(entry => entry.dataset.kind === "phase")).toHaveLength(2);
        expect(document.querySelector('.kcq-game-log__entry[data-actor="ko"] .kcq-game-log__title')?.textContent).toBe("Telekinesis");
        click(".kcq-combat-header__back");
        button("End Turn").click();
        document.querySelector<HTMLButtonElement>(".kcq-battle-overview__secondary-action")!.click();
        expectHistory(execute.mock.results.map(result => result.value), initial);
        expect(execute).toHaveBeenCalledTimes(3);
    });

    it("retains aggregated history while language changes localize past entries again", () => {
        const { engine, prepareBattle } = mountBattle();
        const execute = vi.spyOn(engine, "executeAction");
        useTelekinesis();
        document.querySelector<HTMLButtonElement>(".kcq-battle-overview__secondary-action")!.click();
        const count = logEntries().length;
        expect(document.querySelector(".kcq-game-log__scroll")?.textContent).toContain("Telekinesis");
        click(".kcq-combat-header__back");
        click(".kcq-combat-header__settings");
        const select = document.querySelector<HTMLSelectElement>(".kcq-battle-settings select")!;
        select.value = "test";
        select.dispatchEvent(new Event("change", { bubbles: true }));
        button("Resume").click();
        document.querySelector<HTMLButtonElement>(".kcq-battle-overview__secondary-action")!.click();
        expect(logEntries()).toHaveLength(count);
        expect(document.querySelector(".kcq-game-log__scroll")?.textContent).toContain("Translated move");
        expect(document.querySelector(".kcq-game-log__scroll")?.textContent).toContain("Translated actor");
        expect(document.querySelector(".kcq-full-game-log__viewport")?.getAttribute("aria-label")).toBe("Translated history");
        expect(execute).toHaveBeenCalledTimes(1);
        expect(prepareBattle).toHaveBeenCalledTimes(1);
    });

    it("clears history on retry and replaces it when another encounter begins", () => {
        const { engine, sessions, prepareBattle } = mountBattle();
        useTelekinesis();
        button("End Turn").click();
        document.querySelector<HTMLButtonElement>(".kcq-battle-overview__secondary-action")!.click();
        expect(logEntries().length).toBeGreaterThan(1);
        click(".kcq-combat-header__back");
        click(".kcq-combat-header__settings");
        button("Retry Battle").click();
        expect(sessions[0]!.dispose).toHaveBeenCalledOnce();
        expect(sessions[1]!.engine).not.toBe(engine);
        document.querySelector<HTMLButtonElement>(".kcq-battle-overview__secondary-action")!.click();
        expect(logEntries()).toHaveLength(0);
        click(".kcq-combat-header__back");
        button("End Turn").click();
        document.querySelector<HTMLButtonElement>(".kcq-battle-overview__secondary-action")!.click();
        expect(logEntries().length).toBeGreaterThan(0);
        expect(document.querySelector('.kcq-game-log__entry[data-actor="ko"]')).toBeNull();
        click(".kcq-combat-header__back");
        click(".kcq-combat-header__settings");
        button("Back to Level Select").click();
        expect(sessions[1]!.dispose).toHaveBeenCalledOnce();
        document.querySelector<HTMLInputElement>(".kcq-encounter-picker__show-all input")!.click();
        chooseEncounter("plains_2");
        document.querySelector<HTMLButtonElement>(".kcq-battle-overview__secondary-action")!.click();
        expect(logEntries()).toHaveLength(0);
        expect(sessions[2]!.engine.getGameState().encounter?.id).toBe("plains_2");
        expect(prepareBattle).toHaveBeenCalledTimes(3);
    });

    it("merges consecutive stance actions across player UI executions", () => {
        const { engine } = mountBattle();
        const execute = vi.spyOn(engine, "executeAction");
        click(".kcq-party-card");
        click('.kcq-command-card[aria-label="Change Stance"]');
        click(".kcq-combat-header__back");
        const cards = [...document.querySelectorAll<HTMLElement>(".kcq-party-card")];
        cards[1]!.click();
        click('.kcq-command-card[aria-label="Change Stance"]');
        click(".kcq-combat-header__back");
        document.querySelector<HTMLButtonElement>(".kcq-battle-overview__secondary-action")!.click();
        expect(execute).toHaveBeenCalledTimes(2);
        expect(logEntries()).toHaveLength(1);
        expect(logEntries()[0]!.dataset.kind).toBe("stance");
        expect(document.querySelectorAll('[data-outcome="stance"]')).toHaveLength(2);
        expect(document.querySelector(".kcq-game-log__scroll")?.textContent).toContain("Moving → Standing");
    });
});


function mountScrollingLog(initialStyle: FullLogStyle = "game") {
    let nextFrame = 0;
    const pending = new Map<number, FrameRequestCallback>();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { pending.set(++nextFrame, callback); return nextFrame; });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => pending.delete(id));
    let resize!: () => void;
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
        constructor(callback: () => void) { resize = callback; }
        observe = observe;
        disconnect = disconnect;
    });
    const entry = (round: number): GameLogPresentationEntry => ({ kind: "phase", phase: "player", round, outcomes: [] });
    const [entries, setEntries] = createSignal<GameLogPresentationEntry[]>([entry(1), entry(2)]);
    const [state, setState] = createSignal(createStockEngine().getGameState());
    const [language, setLanguage] = createSignal(presentation);
    const [style, setStyle] = createSignal(initialStyle);
    const host = document.createElement("div");
    document.body.append(host);
    unmount = render(() => createComponent(GameLogPanel, {
        get entries() { return entries(); }, get state() { return state(); }, get presentation() { return language(); }, get style() { return style(); },
    }), host);
    const viewport = host.querySelector<HTMLElement>(".kcq-full-game-log__viewport")!;
    let height = 1000;
    let client = 200;
    Object.defineProperties(viewport, {
        scrollHeight: { configurable: true, get: () => height }, clientHeight: { configurable: true, get: () => client },
    });
    const flush = () => { for (const [id, callback] of [...pending]) { pending.delete(id); callback(0); } };
    const scroll = (top: number) => { viewport.scrollTop = top; viewport.dispatchEvent(new Event("scroll")); };
    const append = () => { height += 100; setEntries(previous => [...previous, entry(previous.length + 1)]); };
    return {
        host, setStyle, viewport, flush, scroll, append, resize: () => resize(), setEntries, entry, setState, state, setLanguage, disconnect, observe,
        setHeight: (value: number) => { height = value; }, setClient: (value: number) => { client = value; }, pending
    };
}

describe("Game Log bottom following", () => {
    it("renders grouped misses with localized colored names and a separate successful buff recipient", () => {
        const log = mountScrollingLog();
        log.setEntries(createGameLogEntries([{
            type: "useMove", actor: "queen1", move: "skunkPerfume", effects: [], targets: [
                { target: "ko", result: "miss", effects: [] },
                { target: "matsuko", result: "miss", effects: [] },
                { target: "hinari", result: "hit", effects: [{ type: "buffAdded", target: "hinari", buff: "escapePerfume" }] },
            ]
        }]));
        const rows = () => [...log.viewport.querySelectorAll('[data-outcome="damage"]')];
        expect(rows()).toHaveLength(2);
        expect(rows()[0]!.querySelector('.kcq-game-log__target')!.textContent).toBe("Ko-chan, Matsuko");
        expect(rows()[0]!.querySelector('.kcq-game-log__value--entity-ko')!.textContent).toBe("Ko-chan");
        expect(rows()[0]!.querySelector('.kcq-game-log__value--entity-matsuko')!.textContent).toBe("Matsuko");
        expect(rows()[0]!.querySelector(':scope > .kcq-game-log__values')!.textContent).toBe("Miss");
        expect(rows()[1]!.querySelector('.kcq-game-log__value--entity-hinari')!.textContent).toBe("Hinari");
        expect(rows()[1]!.querySelector(':scope > .kcq-game-log__values')!.textContent).toBe("HitEscape Perfume Added");
        log.setLanguage(new Presentation({
            ...stockStrings, "ui.gameLog.targetList": "{second} / {first}",
            "entity.ko.name": "Localized Ko", "entity.matsuko.name": "Localized Matsuko",
        }));
        expect(rows()).toHaveLength(2);
        expect(rows()[0]!.querySelector('.kcq-game-log__target')!.textContent).toBe("Localized Matsuko / Localized Ko");
        expect(rows()[0]!.querySelector('.kcq-game-log__value--entity-ko')!.textContent).toBe("Localized Ko");
        expect(rows()[0]!.querySelector('.kcq-game-log__value--entity-matsuko')!.textContent).toBe("Localized Matsuko");
    });

    it("keeps activation consequences nested and relocalizes the live activation heading", () => {
        const log = mountScrollingLog();
        log.setEntries(createGameLogEntries([{
            type: "changePhase", phase: "player", effects: [
                { type: "bindingTickStart", target: "ko", binding: "latexCollar" },
                { type: "bondageChanged", target: "ko", binding: "latexHead", amount: 10 },
                { type: "bondageChanged", target: "ko", binding: "latexArms", amount: 2 },
                { type: "buffAdded", target: "ko", buff: "latexMist" },
                { type: "bindingTickEnd", target: "ko", binding: "latexCollar" },
                { type: "actionRefreshed", target: "hinari" },
            ]
        }]));
        const activation = log.viewport.querySelector('[data-outcome="bindingTick"]')!;
        expect(activation.querySelector(':scope > .kcq-game-log__tick-outcomes > [data-outcome="binding"]')).not.toBeNull();
        expect(log.viewport.querySelectorAll('[data-outcome="binding"]')).toHaveLength(1);
        expect(log.viewport.querySelectorAll('.kcq-game-log__outcomes > .kcq-game-log__row')).toHaveLength(2);
        expect(activation.textContent?.match(/Ko-chan/g)).toHaveLength(1);
        expect(activation.textContent).toContain("Skunk Collar Activated");
        expect(activation.querySelector(':scope > .kcq-game-log__values')).toBeNull();
        const bindings = activation.querySelector('.kcq-game-log__values--bindings')!;
        expect(bindings.children).toHaveLength(2);
        expect(activation.querySelector(':scope > .kcq-game-log__tick-outcomes > [data-outcome="buff"]')!.textContent).toBe("Latex Mist Added");
        expect(bindings.closest('[data-outcome="binding"]')!.querySelector('.kcq-game-log__recipient')).toBeNull();
        expect(activation.querySelector('.kcq-game-log__recipient')!.textContent).toBe("Ko-chan—Skunk Collar Activated");
        log.setLanguage(new Presentation({ ...stockStrings, "ui.gameLog.activated": "Translated activation" }));
        expect(log.viewport.querySelector('[data-outcome="bindingTick"]')?.textContent).toContain("Skunk Collar Translated activation");
    });

    it("keeps target, accuracy, and binding transitions in one flowing container per AoE recipient", () => {
        const log = mountScrollingLog();
        log.setEntries(createGameLogEntries([{
            type: "useMove", actor: "rainmaker1", move: "latexRain", effects: [], targets: [
                {
                    target: "ko", result: "hit", effects: [
                        { type: "bondageAdded", target: "ko", binding: "latexHead", amount: 10 },
                        { type: "bondageAdded", target: "ko", binding: "latexArms", amount: 15 },
                    ]
                },
                {
                    target: "hinari", result: "crit", effects: [
                        { type: "bondageAdded", target: "hinari", binding: "latexArms", amount: 20 },
                        { type: "bondageAdded", target: "hinari", binding: "latexLegs", amount: 30 },
                    ]
                },
            ]
        }]));
        const rows = [...log.viewport.querySelectorAll('.kcq-game-log__row--compactBindings')];
        expect(rows).toHaveLength(2);
        expect(rows.map(row => row.querySelector('.kcq-game-log__target')!.textContent)).toEqual(["Ko-chan", "Hinari"]);
        for (const row of rows) {
            const flowing = row.querySelector(':scope > .kcq-game-log__values--bindings')!;
            expect(row.querySelectorAll(':scope > .kcq-game-log__values')).toHaveLength(1);
            expect(row.querySelector(':scope > .kcq-game-log__recipient')).toBeNull();
            expect(flowing.children).toHaveLength(4);
            expect(flowing.children[0]!.querySelector('.kcq-game-log__target')).not.toBeNull();
            expect(flowing.children[1]!.textContent).toBe(row === rows[0] ? "Hit" : "Crit");
            expect(flowing.children[1]!.className).toContain(row === rows[0] ? "kcq-game-log__value--hit" : "kcq-game-log__value--crit");
            expect(flowing.children[2]!.querySelector('.kcq-game-log__value--binding-none')).not.toBeNull();
            expect(flowing.textContent).not.toMatch(/Skunk|None|Light|Moderate/);
            expect(row.querySelectorAll('.kcq-game-log__recipient')).toHaveLength(1);
        }
    });

    it("preserves multi-hit accuracy in the compact flow and leaves single-zone rows unchanged", () => {
        const log = mountScrollingLog();
        log.setEntries(createGameLogEntries([{
            type: "useMove", actor: "rainmaker1", move: "arbitraryMove", effects: [], targets: [
                { target: "ko", result: "hit", effects: [{ type: "bondageAdded", target: "ko", binding: "latexHead", amount: 10 }] },
                { target: "ko", result: "graze", effects: [{ type: "bondageAdded", target: "ko", binding: "latexArms", amount: 5 }] },
                { target: "ko", result: "miss", effects: [] },
                { target: "hinari", result: "hit", effects: [{ type: "bondageAdded", target: "hinari", binding: "latexHead", amount: 10 }] },
            ]
        }]));
        const rows = [...log.viewport.querySelectorAll('[data-outcome="damage"]')];
        const compact = rows[0]!.querySelector(':scope > .kcq-game-log__values--bindings')!;
        expect([...compact.children].map(value => value.textContent)).toEqual(["Ko-chan", "Hit", "Graze", "Miss", "Head 0 → 10", "Arms 0 → 5"]);
        expect(compact.querySelectorAll('.kcq-game-log__target')).toHaveLength(1);
        expect(rows[1]!.querySelector(':scope > .kcq-game-log__values--bindings')).toBeNull();
        expect(rows[1]!.querySelector(':scope > .kcq-game-log__recipient')!.textContent).toBe("Hinari");
        expect(rows[1]!.querySelector(':scope > .kcq-game-log__values')!.textContent).toBe("HitSkunk Head 0 (None) → 10");
    });

    it("follows new entries at the bottom and pauses even for small scrollback", () => {
        const log = mountScrollingLog();
        log.flush();
        expect(log.viewport.scrollTop).toBe(800);
        log.append();
        log.flush();
        expect(log.viewport.scrollTop).toBe(900);
        log.scroll(880);
        log.append();
        log.flush();
        expect(log.viewport.scrollTop).toBe(880);
        log.scroll(1000);
        log.append();
        log.flush();
        expect(log.viewport.scrollTop).toBe(1100);
        expect(log.observe).toHaveBeenCalledTimes(2);
    });

    it("preserves user scrollback, including a scroll before a queued follow, and resumes at the bottom", () => {
        const log = mountScrollingLog();
        log.flush();
        log.append();
        log.scroll(200);
        log.flush();
        expect(log.viewport.scrollTop).toBe(200);
        log.append();
        log.flush();
        expect(log.viewport.scrollTop).toBe(200);
        log.scroll(1000);
        log.append();
        log.flush();
        expect(log.viewport.scrollTop).toBe(1100);
    });

    it("responds to layout and localization changes without interrupting scrollback", () => {
        const log = mountScrollingLog();
        log.flush();
        log.setClient(300);
        log.resize();
        log.flush();
        expect(log.viewport.scrollTop).toBe(700);
        log.scroll(100);
        log.setHeight(1400);
        log.setLanguage(new Presentation({ ...stockStrings, "ui.battleOverview.round": "Long translated round {round}" }));
        log.resize();
        log.flush();
        expect(log.viewport.scrollTop).toBe(100);
        log.scroll(1100);
        log.setClient(200);
        log.resize();
        log.flush();
        expect(log.viewport.scrollTop).toBe(1200);
    });

    it("preserves scrollback when Pass 1 collapses a stance entry within the same battle", () => {
        const log = mountScrollingLog();
        log.flush();
        log.scroll(100);
        log.setEntries(previous => previous.slice(0, 1));
        log.resize();
        log.flush();
        expect(log.viewport.scrollTop).toBe(100);
    });

    it("reanchors after clearing battle history and changing encounters", () => {
        const log = mountScrollingLog();
        log.flush();
        log.scroll(100);
        log.setHeight(0);
        log.setEntries([]);
        log.flush();
        expect(log.viewport.scrollTop).toBe(0);
        log.setHeight(900);
        log.setEntries([log.entry(1)]);
        log.flush();
        expect(log.viewport.scrollTop).toBe(700);
        log.scroll(100);
        log.setState(previous => ({ ...previous, encounter: { id: "plains_2", enemies: [], bindings: [], traps: [] } }));
        log.setHeight(1200);
        log.flush();
        expect(log.viewport.scrollTop).toBe(1000);
    });

    it("reanchors on round resets and disconnects observers and queued work on unmount", () => {
        const log = mountScrollingLog();
        log.setState(previous => ({ ...previous, turn: { ...previous.turn, round: 4 } }));
        log.flush();
        log.scroll(100);
        log.setState(previous => ({ ...previous, turn: { ...previous.turn, round: 1 } }));
        log.flush();
        expect(log.viewport.scrollTop).toBe(800);
        log.append();
        expect(log.pending.size).toBe(1);
        unmount!();
        unmount = undefined;
        expect(log.pending.size).toBe(0);
        expect(log.disconnect).toHaveBeenCalledOnce();
        log.viewport.scrollTop = 100;
        log.flush();
        expect(log.viewport.scrollTop).toBe(100);
    });
});

describe("full log styles", () => {
    it("renders Game, Story, and Both without tabs or battle state changes", () => {
        const log = mountScrollingLog("both");
        log.setEntries(createGameLogEntries([{
            type: "useMove", actor: "ko", move: "telekinesis", effects: [], targets: [
                { target: "skunkette1", result: "hit", effects: [{ type: "enemyDamaged", target: "skunkette1", amount: 10 }] },
            ]
        }]));
        const saved = JSON.stringify(log.state());
        const panels = () => [...log.host.querySelectorAll<HTMLElement>('[role="log"]')];
        expect(panels()).toHaveLength(2);
        expect(log.host.querySelector(".kcq-full-game-log h2")).toBeNull();
        expect(panels().map(panel => panel.getAttribute("aria-label"))).toEqual(["Chronological game events", "Story Log"]);
        expect(panels()[0]!.querySelector("[data-outcome]")).not.toBeNull();
        expect(panels()[1]!.textContent).toContain("Ko-chan launches a rock at Skunkette A");
        expect(panels()[1]!.querySelector("[data-outcome]")).toBeNull();
        const mechanical = panels()[0]!.innerHTML;
        log.setStyle("story");
        expect(panels()).toHaveLength(1);
        expect(panels()[0]!.querySelector(".kcq-game-log__story-text")).not.toBeNull();
        log.setStyle("game");
        expect(panels()).toHaveLength(1);
        expect(panels()[0]!.innerHTML).toBe(mechanical);
        expect(log.host.querySelector('[role="tab"], [role="tablist"], [role="tabpanel"]')).toBeNull();
        expect(JSON.stringify(log.state())).toBe(saved);
    });
    it("shares bottom-follow state, preserves scrollback, and cancels queued updates", () => {
        const log = mountScrollingLog("both");
        const story = log.host.querySelectorAll<HTMLElement>('[role="log"]')[1]!;
        let storyHeight = 1200;
        Object.defineProperties(story, { scrollHeight: { get: () => storyHeight }, clientHeight: { value: 200 } });
        log.flush();
        expect(log.viewport.scrollTop).toBe(800); expect(story.scrollTop).toBe(1000);
        log.scroll(140);
        storyHeight += 100; log.append(); log.flush();
        expect(log.viewport.scrollTop).toBe(140); expect(story.scrollTop).toBe(1000);
        story.scrollTop = 260; story.dispatchEvent(new Event("scroll"));
        log.scroll(900);
        storyHeight += 100; log.append(); log.flush();
        expect(log.viewport.scrollTop).toBe(1000); expect(story.scrollTop).toBe(1200);
        log.setLanguage(new Presentation({ ...stockStrings, "ui.gameLog.storyLog": "Translated Story" }));
        log.flush();
        expect(story.scrollTop).toBe(1200);
        expect(story.getAttribute("aria-label")).toBe("Translated Story");
        log.setEntries([]); log.setHeight(0); storyHeight = 0; log.flush();
        expect(log.viewport.scrollTop).toBe(0); expect(story.scrollTop).toBe(0);
        log.append(); expect(log.pending.size).toBe(1);
        unmount!(); unmount = undefined;
        expect(log.pending.size).toBe(0); expect(log.disconnect).toHaveBeenCalledTimes(2);
    });
});
describe("independent log styles through Settings", () => {
    it("applies preferences across navigation, another encounter, and app recreation", () => {
        mountBattle(); useTelekinesis();
        click(".kcq-combat-header__settings");
        const change = (kind: string, value: string) => {
            const select = document.querySelector<HTMLSelectElement>(`.kcq-battle-settings__${kind}-log-style select`)!;
            select.value = value; select.dispatchEvent(new Event("change", { bubbles: true }));
        };
        change("full", "game"); change("compact", "story");
        expect(window.localStorage.getItem("kcq.fullLogStyle")).toBe("game");
        expect(window.localStorage.getItem("kcq.compactLogStyle")).toBe("story");
        button("Resume").click();
        expect(document.querySelector(".kcq-compact-game-log .kcq-game-log__story-text")).not.toBeNull();
        click(".kcq-compact-game-log");
        expect(document.querySelectorAll('[role="log"]')).toHaveLength(1);
        expect(document.querySelector(".kcq-game-log__story-text")).toBeNull();
        click(".kcq-combat-header__back");
        click(".kcq-combat-header__settings"); button("Back to Level Select").click();
        document.querySelector<HTMLInputElement>(".kcq-encounter-picker__show-all input")!.click();
        chooseEncounter("plains_2");
        click(".kcq-combat-header__settings");
        expect(document.querySelector<HTMLSelectElement>(".kcq-battle-settings__full-log-style select")!.value).toBe("game");
        expect(document.querySelector<HTMLSelectElement>(".kcq-battle-settings__compact-log-style select")!.value).toBe("story");
        button("Resume").click();
        unmount?.(); unmount = undefined; document.body.replaceChildren();
        mountBattle();
        click(".kcq-combat-header__settings");
        expect(document.querySelector<HTMLSelectElement>(".kcq-battle-settings__full-log-style select")!.value).toBe("game");
        expect(document.querySelector<HTMLSelectElement>(".kcq-battle-settings__compact-log-style select")!.value).toBe("story");
        button("Reset to Defaults").click(); button("Resume").click();
        useTelekinesis();
        expect(document.querySelector(".kcq-compact-game-log .kcq-game-log__story-text")).toBeNull();
        click(".kcq-compact-game-log"); expect(document.querySelectorAll('[role="log"]')).toHaveLength(2);
    });
});
