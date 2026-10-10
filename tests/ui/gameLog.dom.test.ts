import { createComponent, createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult, DifficultyId, EncounterId, GameState } from "../../src/engine/public/types";
import { createStockEngine } from "../../src/stock";
import { createGameLogEntries, type GameLogPresentationEntry } from "../../src/ui/presentation/gameLog";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createBattle } from "../../src/ui/web/app";
import { GraphicalApp } from "../../src/ui/web/app/GraphicalApp";
import { GameLogPanel } from "../../src/ui/web/app/panels/GameLogPanel";
import { createGameLogViewModel } from "../../src/ui/web/app/viewModels/gameLog";
import { stockStrings } from "../helpers/stockStrings";

const presentation = new Presentation(stockStrings);
let unmount: (() => void) | undefined;
beforeEach(() => {
    window.localStorage.clear();
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
    const alternate = new Presentation({ ...stockStrings,
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
        campaigns: ["skunk"], release: "test", presentation, prepareBattle,
        composeCampaign: () => ({ engine: createStockEngine(), presentation,
            languages: [{ id: "en", label: "English", presentation }, { id: "test", label: "Test", presentation: alternate }] }),
        languages: [{ id: "en", label: "English", presentation }, { id: "test", label: "Test", presentation: alternate }],
    }), host);
    click(".kcq-title-screen__campaign");
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
    return [...document.querySelectorAll<HTMLElement>(".kcq-game-log__entry")];
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
    it("preserves player and enemy events across actions and reopening the log without duplication", () => {
        const { engine } = mountBattle();
        const initial = engine.getGameState();
        const execute = vi.spyOn(engine, "executeAction");
        button("Game Log").click();
        expect(logEntries()).toHaveLength(0);
        expect(document.querySelector(".kcq-game-log__empty")?.textContent).toBe("No combat events yet.");
        click(".kcq-combat-header__back");
        useTelekinesis();
        button("Game Log").click();
        expectHistory(execute.mock.results.map(result => result.value), initial);
        expect(logEntries()).toHaveLength(1);
        const firstHTML = document.querySelector(".kcq-game-log__scroll")!.innerHTML;
        click(".kcq-combat-header__back");
        button("Game Log").click();
        expect(document.querySelector(".kcq-game-log__scroll")!.innerHTML).toBe(firstHTML);
        expect(execute).toHaveBeenCalledTimes(1);
        click(".kcq-combat-header__back");
        button("End Turn").click();
        button("Game Log").click();
        expectHistory(execute.mock.results.map(result => result.value), initial);
        expect(logEntries().filter(entry => entry.dataset.actor?.startsWith("skunkette"))).not.toHaveLength(0);
        expect(logEntries().filter(entry => entry.dataset.kind === "phase")).toHaveLength(2);
        expect(document.querySelector('.kcq-game-log__entry[data-actor="ko"] .kcq-game-log__title')?.textContent).toBe("Telekinesis");
        click(".kcq-combat-header__back");
        button("End Turn").click();
        button("Game Log").click();
        expectHistory(execute.mock.results.map(result => result.value), initial);
        expect(execute).toHaveBeenCalledTimes(3);
    });

    it("retains aggregated history while language changes localize past entries again", () => {
        const { engine, prepareBattle } = mountBattle();
        const execute = vi.spyOn(engine, "executeAction");
        useTelekinesis();
        button("Game Log").click();
        const count = logEntries().length;
        expect(document.querySelector(".kcq-game-log__scroll")?.textContent).toContain("Telekinesis");
        click(".kcq-combat-header__back");
        click(".kcq-combat-header__settings");
        const select = document.querySelector<HTMLSelectElement>(".kcq-battle-settings select")!;
        select.value = "test";
        select.dispatchEvent(new Event("change", { bubbles: true }));
        button("Resume").click();
        button("Game Log").click();
        expect(logEntries()).toHaveLength(count);
        expect(document.querySelector(".kcq-game-log__scroll")?.textContent).toContain("Translated move");
        expect(document.querySelector(".kcq-game-log__scroll")?.textContent).toContain("Translated actor");
        expect(document.querySelector(".kcq-game-log__scroll")?.getAttribute("aria-label")).toBe("Translated history");
        expect(execute).toHaveBeenCalledTimes(1);
        expect(prepareBattle).toHaveBeenCalledTimes(1);
    });

    it("clears history on retry and replaces it when another encounter begins", () => {
        const { engine, sessions, prepareBattle } = mountBattle();
        useTelekinesis();
        button("End Turn").click();
        button("Game Log").click();
        expect(logEntries().length).toBeGreaterThan(1);
        click(".kcq-combat-header__back");
        click(".kcq-combat-header__settings");
        button("Retry Battle").click();
        expect(sessions[0]!.dispose).toHaveBeenCalledOnce();
        expect(sessions[1]!.engine).not.toBe(engine);
        button("Game Log").click();
        expect(logEntries()).toHaveLength(0);
        click(".kcq-combat-header__back");
        button("End Turn").click();
        button("Game Log").click();
        expect(logEntries().length).toBeGreaterThan(0);
        expect(document.querySelector('.kcq-game-log__entry[data-actor="ko"]')).toBeNull();
        click(".kcq-combat-header__back");
        click(".kcq-combat-header__settings");
        button("Back to Level Select").click();
        expect(sessions[1]!.dispose).toHaveBeenCalledOnce();
        chooseEncounter("plains_2");
        button("Game Log").click();
        expect(logEntries()).toHaveLength(0);
        expect(sessions[2]!.engine.getGameState().encounter?.id).toBe("plains_2");
        expect(prepareBattle).toHaveBeenCalledTimes(3);
    });

    it("merges consecutive stance actions across player UI executions", () => {
        const { engine } = mountBattle();
        const execute = vi.spyOn(engine, "executeAction");
        click(".kcq-party-card");
        click('.kcq-command-card[aria-label^="Change Stance:"]');
        click(".kcq-combat-header__back");
        const cards = [...document.querySelectorAll<HTMLElement>(".kcq-party-card")];
        cards[1]!.click();
        click('.kcq-command-card[aria-label^="Change Stance:"]');
        click(".kcq-combat-header__back");
        button("Game Log").click();
        expect(execute).toHaveBeenCalledTimes(2);
        expect(logEntries()).toHaveLength(1);
        expect(logEntries()[0]!.dataset.kind).toBe("stance");
        expect(document.querySelectorAll('[data-outcome="stance"]')).toHaveLength(2);
        expect(document.querySelector(".kcq-game-log__scroll")?.textContent).toContain("Moving → Standing");
    });
});


function mountScrollingLog() {
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
    const host = document.createElement("div");
    document.body.append(host);
    unmount = render(() => createComponent(GameLogPanel, {
        get entries() { return entries(); }, get state() { return state(); }, get presentation() { return language(); },
    }), host);
    const viewport = host.querySelector<HTMLElement>(".kcq-screen-layout__body")!;
    let height = 1000;
    let client = 200;
    Object.defineProperties(viewport, {
        scrollHeight: { configurable: true, get: () => height }, clientHeight: { configurable: true, get: () => client },
    });
    const flush = () => { for (const [id, callback] of [...pending]) { pending.delete(id); callback(0); } };
    const scroll = (top: number) => { viewport.scrollTop = top; viewport.dispatchEvent(new Event("scroll")); };
    const append = () => { height += 100; setEntries(previous => [...previous, entry(previous.length + 1)]); };
    return { viewport, flush, scroll, append, resize: () => resize(), setEntries, entry, setState, state, setLanguage, disconnect, observe,
        setHeight: (value: number) => { height = value; }, setClient: (value: number) => { client = value; }, pending };
}

describe("Game Log bottom following", () => {
    it("renders grouped misses with localized colored names and a separate successful buff recipient", () => {
        const log = mountScrollingLog();
        log.setEntries(createGameLogEntries([{ type: "useMove", actor: "queen1", move: "skunkPerfume", effects: [], targets: [
            { target: "ko", result: "miss", effects: [] },
            { target: "matsuko", result: "miss", effects: [] },
            { target: "hinari", result: "hit", effects: [{ type: "buffAdded", target: "hinari", buff: "escapePerfume" }] },
        ] }]));
        const rows = () => [...log.viewport.querySelectorAll('[data-outcome="damage"]')];
        expect(rows()).toHaveLength(2);
        expect(rows()[0]!.querySelector('.kcq-game-log__target')!.textContent).toBe("Ko-chan, Matsuko");
        expect(rows()[0]!.querySelector('.kcq-game-log__value--entity-ko')!.textContent).toBe("Ko-chan");
        expect(rows()[0]!.querySelector('.kcq-game-log__value--entity-matsuko')!.textContent).toBe("Matsuko");
        expect(rows()[0]!.querySelector(':scope > .kcq-game-log__values')!.textContent).toBe("Miss");
        expect(rows()[1]!.querySelector('.kcq-game-log__value--entity-hinari')!.textContent).toBe("Hinari");
        expect(rows()[1]!.querySelector(':scope > .kcq-game-log__values')!.textContent).toBe("HitEscape Perfume Added");
        log.setLanguage(new Presentation({ ...stockStrings, "ui.gameLog.targetList": "{second} / {first}",
            "entity.ko.name": "Localized Ko", "entity.matsuko.name": "Localized Matsuko",
        }));
        expect(rows()).toHaveLength(2);
        expect(rows()[0]!.querySelector('.kcq-game-log__target')!.textContent).toBe("Localized Matsuko / Localized Ko");
        expect(rows()[0]!.querySelector('.kcq-game-log__value--entity-ko')!.textContent).toBe("Localized Ko");
        expect(rows()[0]!.querySelector('.kcq-game-log__value--entity-matsuko')!.textContent).toBe("Localized Matsuko");
    });

    it("keeps activation consequences nested and relocalizes the live activation heading", () => {
        const log = mountScrollingLog();
        log.setEntries(createGameLogEntries([{ type: "changePhase", phase: "player", effects: [
            { type: "bindingTickStart", target: "ko", binding: "latexCollar" },
            { type: "bondageChanged", target: "ko", binding: "latexHead", amount: 10 },
            { type: "bondageChanged", target: "ko", binding: "latexArms", amount: 2 },
            { type: "buffAdded", target: "ko", buff: "latexMist" },
            { type: "bindingTickEnd", target: "ko", binding: "latexCollar" },
            { type: "actionRefreshed", target: "hinari" },
        ] }]));
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
        log.setEntries(createGameLogEntries([{ type: "useMove", actor: "rainmaker1", move: "latexRain", effects: [], targets: [
            { target: "ko", result: "hit", effects: [
                { type: "bondageAdded", target: "ko", binding: "latexHead", amount: 10 },
                { type: "bondageAdded", target: "ko", binding: "latexArms", amount: 15 },
            ] },
            { target: "hinari", result: "crit", effects: [
                { type: "bondageAdded", target: "hinari", binding: "latexArms", amount: 20 },
                { type: "bondageAdded", target: "hinari", binding: "latexLegs", amount: 30 },
            ] },
        ] }]));
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
        log.setEntries(createGameLogEntries([{ type: "useMove", actor: "rainmaker1", move: "arbitraryMove", effects: [], targets: [
            { target: "ko", result: "hit", effects: [{ type: "bondageAdded", target: "ko", binding: "latexHead", amount: 10 }] },
            { target: "ko", result: "graze", effects: [{ type: "bondageAdded", target: "ko", binding: "latexArms", amount: 5 }] },
            { target: "ko", result: "miss", effects: [] },
            { target: "hinari", result: "hit", effects: [{ type: "bondageAdded", target: "hinari", binding: "latexHead", amount: 10 }] },
        ] }]));
        const rows = [...log.viewport.querySelectorAll('[data-outcome="damage"]')];
        const compact = rows[0]!.querySelector(':scope > .kcq-game-log__values--bindings')!;
        expect([...compact.children].map(value => value.textContent)).toEqual(["Ko-chan", "Hit", "Graze", "Miss", "Head 0 → 10", "Arms 0 → 5"]);
        expect(compact.querySelectorAll('.kcq-game-log__target')).toHaveLength(1);
        expect(rows[1]!.querySelector(':scope > .kcq-game-log__values--bindings')).toBeNull();
        expect(rows[1]!.querySelector(':scope > .kcq-game-log__recipient')!.textContent).toBe("Hinari");
        expect(rows[1]!.querySelector(':scope > .kcq-game-log__values')!.textContent).toBe("HitSkunk Head 0 (None) → 10");
    });

    it("starts at the bottom and follows new entries while at or near the bottom", () => {
        const log = mountScrollingLog();
        log.flush();
        expect(log.viewport.scrollTop).toBe(800);
        log.append();
        log.flush();
        expect(log.viewport.scrollTop).toBe(900);
        log.scroll(880);
        log.append();
        log.flush();
        expect(log.viewport.scrollTop).toBe(1000);
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
