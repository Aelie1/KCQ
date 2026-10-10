import { readFileSync } from "node:fs";
import type { Window as HappyWindow } from "happy-dom";
import { Presentation } from "../../src/ui/presentation/presentation";
import { stockStrings } from "../helpers/stockStrings";
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
    mount(() => createComponent(BattleApp, { engine, presentation: battleOverviewFixture.presentation, playbackSpeed: { value: "instant", onChange: () => {} } }));
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

    it("returns to overview on End Turn and refreshes a surviving enemy when reopened", () => {
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
        expect(document.querySelector(".kcq-enemy-details")).toBeNull();
        press("4");
        expect(element(".kcq-enemy-details__identity").textContent).toContain("123 / 200");
        vi.mocked(engine.getGameState).mockReturnValue({ ...state, enemies: state.enemies.slice(1) });
        press("=");
        expect(document.querySelector(".kcq-enemy-details")).toBeNull();
        expect(document.querySelector(".kcq-battle-overview")).not.toBeNull();
    });
});

describe("compact intention target rows", () => {
    it("hides only participant chips across intention recipients and preserves persistent links", () => {
        const fixture = enemyDetailsFixture;
        const state: GameState = {
            ...fixture.state,
            enemies: fixture.state.enemies.map(enemy => ({
                ...enemy,
                intentions: ["ko", "matsuko"].map(target => ({
                    resolved: false,
                    move: "pounce",
                    targets: [{ target, band: "hit", effects: [
                        { type: "buff", target, operation: "add", buff: {
                            id: "pounce", severity: 3, linkedEntity: enemy.id,
                            statuses: [{ id: "immobilized", value: 1 }, { id: "stunned", value: 1 }],
                            moveList: { addedMoves: ["throwOff"] },
                        } },
                        { type: "buff", target: enemy.id, operation: "add", buff: {
                            id: "pounce", severity: 3, linkedEntity: target, modifiers: { defense: -2, hit: 8 },
                        } },
                        { type: "move", move: "latexSpray" },
                    ] }],
                    effects: [],
                })),
            })),
        };
        const before = JSON.stringify(state);
        mount(() => createComponent(EnemyDetailsPanel, { ...fixture, state }));
        const intentions = [...document.querySelectorAll(".kcq-enemy-details__intention")];
        expect(intentions).toHaveLength(2);
        intentions.forEach((intention, index) => {
            const cards = [...intention.querySelectorAll(".kcq-target-card")];
            expect(cards.map(card => card.querySelector(".kcq-target-header__name")?.textContent))
                .toEqual([index === 0 ? "Ko-chan" : "Matsuko", "Skunkette 1"]);
            const debuff = cards[0]!.querySelector(".kcq-buff-effect")!;
            const buff = cards[1]!.querySelector(".kcq-buff-effect")!;
            expect(debuff.classList.contains("kcq-preview-effect--special")).toBe(true);
            expect(buff.classList.contains("kcq-preview-effect--success")).toBe(true);
            expect(debuff.querySelector(".kcq-buff-effect__tag")?.textContent).toBe("Add Debuff");
            expect(buff.querySelector(".kcq-buff-effect__tag")?.textContent).toBe("Add Buff");
            expect([...intention.querySelectorAll(".kcq-preview-effect .kcq-status-chip")]
                .map(chip => chip.textContent)).toEqual(["Adds Throw Off", "Immobilized", "Stunned"]);
            expect([...intention.querySelectorAll(".kcq-buff-effect .kcq-preview-effect__payload")]
                .map(name => name.textContent)).toEqual(["Pounce III", "Pounce III"]);
            expect([...buff.querySelectorAll(".kcq-effect-modifier strong")]
                .map(value => value.textContent)).toEqual(["-2", "+8"]);
            expect(buff.querySelector(".kcq-buff-effect__details")).toBeNull();
            expect(intention.querySelector(".kcq-status-chip--outcome-hit")?.textContent).toBe("Hit");
            expect(cards[1]!.textContent).toContain("Latex Spray");
        });
        expect(element('.kcq-character-effects .kcq-linked-entity-chip').textContent).toBe("Ko-chan");
        expect(JSON.stringify(state)).toBe(before);
    });

    it.each([320, 390])("keeps localized names and every outcome inline at width %i", width => {
        const viewport = (window as unknown as HappyWindow).happyDOM;
        const originalViewport = { width: window.innerWidth, height: window.innerHeight };
        viewport.setViewport({ width, height: 844 });
        try {
            const style = document.createElement("style");
            style.textContent = readFileSync("src/ui/web/app/app.css", "utf8");
            document.body.append(style);
            const localizedName = "TrèsLongNomDePersonnageLocaliséSansEspaces";
            const presentation = new Presentation({
                ...stockStrings,
                "entity.ko.name": localizedName,
            });
            const state: GameState = {
                ...enemyDetailsFixture.state,
                enemies: enemyDetailsFixture.state.enemies.map(enemy => ({
                    ...enemy,
                    intentions: [{
                        resolved: false,
                        move: "latexSpray",
                        targets: (["miss", "graze", "hit", "crit", "none"] as const).map(band => ({
                            target: "ko", band, effects: [],
                        })),
                        effects: [],
                    }],
                })),
            };
            mount(() => createComponent(EnemyDetailsPanel, { ...enemyDetailsFixture, state, presentation }));
            const cards = [...document.querySelectorAll<HTMLElement>(".kcq-enemy-details__intentions .kcq-target-card")];
            expect(cards).toHaveLength(5);
            for (const [index, card] of cards.entries()) {
                const name = card.querySelector<HTMLElement>(".kcq-target-header__name")!;
                const outcome = card.querySelector(".kcq-status-chip");
                expect(name.textContent).toBe(localizedName);
                expect(name.title).toBe(localizedName);
                expect(card.querySelector(":scope > .kcq-status-chip")).toBeNull();
                if (index < 4) {
                    expect(outcome?.previousElementSibling).toBe(name);
                    expect(outcome?.closest(".kcq-target-header")).not.toBeNull();
                    expect(getComputedStyle(name.parentElement!).display).toBe("inline-flex");
                    expect(getComputedStyle(outcome!).flexShrink).toBe("0");
                } else expect(outcome).toBeNull();
                expect(parseFloat(getComputedStyle(card).minHeight)).toBe(0);
                expect(getComputedStyle(card).gap).toBe("3px");
                expect(getComputedStyle(name).fontSize).toBe("11px");
                expect(getComputedStyle(name).textOverflow).toBe("ellipsis");
            }
            expect(getComputedStyle(element(".kcq-enemy-details__intentions .kcq-selected-command")).minHeight).toBe("24px");
            expect(getComputedStyle(element(".kcq-enemy-details__intentions .kcq-selected-command h2")).fontSize).toBe("12px");
            expect(getComputedStyle(element(".kcq-enemy-details__identity .kcq-target-header__name")).fontSize).toBe("14px");
            expect(getComputedStyle(element(".kcq-enemy-details__intentions .kcq-target-header")).flexWrap).toBe("wrap");
            const summary = element(".kcq-enemy-details__intentions .kcq-target-header__character-state");
            expect(getComputedStyle(summary).marginLeft).toBe("auto");
            expect(getComputedStyle(summary).whiteSpace).toBe("normal");
        } finally {
            viewport.setViewport(originalViewport);
        }
    });
});
