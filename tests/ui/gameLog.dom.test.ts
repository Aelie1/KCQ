import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult, DifficultyId, EncounterId, GameState } from "../../src/engine/public/types";
import { createStockEngine } from "../../src/stock";
import { createGameLogEntries } from "../../src/ui/presentation/gameLog";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createBattle } from "../../src/ui/web/app";
import { GraphicalApp } from "../../src/ui/web/app/GraphicalApp";
import { createGameLogViewModel } from "../../src/ui/web/app/viewModels/gameLog";
import { stockStrings } from "../helpers/stockStrings";

const presentation = new Presentation(stockStrings);
let unmount: (() => void) | undefined;
beforeEach(() => vi.stubGlobal("__KCQ_GIT_REVISION__", "test"));
afterEach(() => {
    unmount?.();
    unmount = undefined;
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
function button(label: string, scope: ParentNode = document): HTMLButtonElement {
    const found = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === label);
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
    click(".kcq-targeting__execute");
}
function logEntries(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>(".kcq-game-log__entry")];
}
function expectHistory(results: readonly ActionResult[], initial: GameState): void {
    const expected = createGameLogViewModel(createGameLogEntries(results.flatMap(result => result.success ? result.frames : []), initial), presentation);
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
        click('.kcq-command-card[aria-label="Change Stance"]');
        click(".kcq-combat-header__back");
        const cards = [...document.querySelectorAll<HTMLElement>(".kcq-party-card")];
        cards[1]!.click();
        click('.kcq-command-card[aria-label="Change Stance"]');
        click(".kcq-combat-header__back");
        button("Game Log").click();
        expect(execute).toHaveBeenCalledTimes(2);
        expect(logEntries()).toHaveLength(1);
        expect(logEntries()[0]!.dataset.kind).toBe("stance");
        expect(document.querySelectorAll('[data-outcome="stance"]')).toHaveLength(2);
        expect(document.querySelector(".kcq-game-log__scroll")?.textContent).toContain("Moving → Standing");
    });
});
