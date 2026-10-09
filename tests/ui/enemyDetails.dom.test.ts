import { createComponent, createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "../../src/engine/public/types";
import { createStockEngine } from "../../src/stock";
import { createBattle } from "../../src/ui/web/app";
import { BattleApp } from "../../src/ui/web/app/BattleApp";
import { battleOverviewFixture } from "../../src/ui/web/app/fixtures/battleOverview";
import { enemyDetailsFixture } from "../../src/ui/web/app/fixtures/enemyDetails";
import { EnemyDetailsPanel } from "../../src/ui/web/app/panels/EnemyDetailsPanel";

let unmount: (() => void) | undefined;
afterEach(() => {
    unmount?.();
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

function mount(view: Parameters<typeof render>[0]): void {
    const host = document.createElement("div");
    document.body.append(host);
    unmount = render(view, host);
}

function element<T extends HTMLElement = HTMLElement>(selector: string): T {
    const found = document.querySelector<T>(selector);
    if (!found) throw new Error("Missing element: " + selector);
    return found;
}

function press(key: string, target: EventTarget = document): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    document.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
    return event;
}

function mountBattle() {
    const engine = createStockEngine(12345);
    createBattle(engine, "plains_1", "standard");
    vi.spyOn(engine, "getGameState").mockReturnValue({ ...battleOverviewFixture.state, turn: { ...battleOverviewFixture.state.turn, phase: "player" } });
    vi.spyOn(engine, "getActionView").mockReturnValue(battleOverviewFixture.actions);
    const execute = vi.spyOn(engine, "executeAction").mockReturnValue({ success: false, reason: "wrongPhase" });
    mount(() => createComponent(BattleApp, { engine, presentation: battleOverviewFixture.presentation }));
    return { engine, execute };
}

describe("Enemy Details navigation and live state", () => {
    it("opens the clicked enemy and returns through the header", () => {
        const { execute } = mountBattle();
        const cards = [...document.querySelectorAll<HTMLElement>(".kcq-enemy-card")];
        cards[1]!.click();
        expect(element(".kcq-enemy-details").getAttribute("aria-label")).toBe("Skunkette 2");
        expect(element(".kcq-enemy-details__identity").textContent).toContain("200 / 200");
        element(".kcq-combat-header__back").click();
        expect(document.querySelector(".kcq-enemy-details")).toBeNull();
        expect(document.querySelector(".kcq-battle-overview")).not.toBeNull();
        expect(execute).not.toHaveBeenCalled();
    });

    it("keeps party shortcuts, adds enemy hints, supports focus activation and Backspace", () => {
        mountBattle();
        expect([...document.querySelectorAll<HTMLElement>(".kcq-party-card")].map(card => card.dataset.kcqShortcut)).toEqual(["1", "2", "3"]);
        const card = element('.kcq-enemy-card[data-kcq-shortcut="5"]');
        expect(card.querySelector(".kcq-shortcut")?.textContent).toBe("5");
        card.focus();
        expect(document.activeElement).toBe(card);
        press("Enter", card);
        expect(element(".kcq-enemy-details").getAttribute("aria-label")).toBe("Skunkette 2");
        expect(element(".kcq-combat-header__back .kcq-shortcut").textContent).toBe("⌫");
        expect(press("Backspace").defaultPrevented).toBe(true);
        expect(press("4").defaultPrevented).toBe(true);
        expect(element(".kcq-enemy-details").getAttribute("aria-label")).toBe("Skunkette 1");
        press("Shift");
        expect(element(".kcq-battle-stage").dataset.kcqHintsVisible).toBe("true");
    });

    it("restores Enemy Details and its scroll position after the game log", () => {
        mountBattle();
        press("4");
        const screen = element(".kcq-enemy-details");
        const body = element(".kcq-screen-layout__body");
        body.scrollTop = 42;
        press("-");
        expect(document.querySelector(".kcq-game-log")).not.toBeNull();
        expect(press("5").defaultPrevented).toBe(false);
        press("Backspace");
        expect(element(".kcq-enemy-details")).toBe(screen);
        expect(body.scrollTop).toBe(42);
    });

    it("reacts to HP, modifiers, buffs, and projected binding changes", () => {
        const [state, setState] = createSignal<GameState>(enemyDetailsFixture.state);
        mount(() => createComponent(EnemyDetailsPanel, {
            ...enemyDetailsFixture,
            get state() { return state(); },
        }));
        setState({
            ...state(),
            characters: state().characters.map(character => character.id === "ko" ? {
                ...character,
                bindings: character.bindings.map(binding => binding.id === "latexArms" ? { ...binding, value: 10, level: "light" } : binding),
            } : character),
            enemies: state().enemies.map(enemy => ({
                ...enemy, currHp: 100, modifiers: { defense: 3 }, buffs: [],
                intentions: [...enemy.intentions, ...enemy.intentions, ...enemy.intentions],
            })),
        });
        expect(element(".kcq-enemy-details__identity .kcq-target-header__value").textContent).toBe("100 / 200");
        expect(element(".kcq-modifier-meter__value").textContent).toBe("+3");
        expect(document.querySelector("#enemy-effects-heading")).toBeNull();
        expect(document.querySelectorAll(".kcq-enemy-details__intention")).toHaveLength(6);
        expect(element(".kcq-binding-meter").getAttribute("aria-valuenow")).toBe("10");
        expect(document.querySelectorAll(".kcq-enemy-details button")).toHaveLength(1);
        expect(document.querySelector("button.kcq-target-card")).toBeNull();
    });

    it("refreshes a surviving selected enemy and returns to overview if it disappears", () => {
        const { engine, execute } = mountBattle();
        const state = { ...battleOverviewFixture.state, turn: { ...battleOverviewFixture.state.turn, phase: "player" as const } };
        vi.mocked(engine.getGameState).mockReturnValue(state);
        execute.mockReturnValue({ success: true, frames: [], actions: battleOverviewFixture.actions });
        press("4");
        vi.mocked(engine.getGameState).mockReturnValue({
            ...state,
            enemies: state.enemies.map(enemy => ({ ...enemy, currHp: 123 })),
        });
        press("=");
        expect(element(".kcq-enemy-details__identity").textContent).toContain("123 / 200");
        vi.mocked(engine.getGameState).mockReturnValue({ ...state, enemies: state.enemies.slice(1) });
        press("=");
        expect(document.querySelector(".kcq-enemy-details")).toBeNull();
        expect(document.querySelector(".kcq-battle-overview")).not.toBeNull();
    });
});
