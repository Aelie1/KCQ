import { readFileSync } from "node:fs";
import type { Window as HappyWindow } from "happy-dom";
import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionInfo, ActionView, GameState } from "../../src/engine/public/types";
import { createStockEngine } from "../../src/stock";
import { createBattle } from "../../src/ui/web/app";
import { BattleApp } from "../../src/ui/web/app/BattleApp";
import { escapeFixtures } from "../../src/ui/web/app/fixtures/escape";
import { targetingFixtures } from "../../src/ui/web/app/fixtures/targeting";
import { combatShortcut } from "../../src/ui/web/app/keyboard";

const viewport = (window as unknown as HappyWindow).happyDOM;
const initialViewport = { width: window.innerWidth, height: window.innerHeight };
let unmount: (() => void) | undefined;
afterEach(() => {
    unmount?.();
    unmount = undefined;
    document.body.replaceChildren();
    vi.restoreAllMocks();
    viewport.setViewport(initialViewport);
});

function keydown(key: string, options: KeyboardEventInit = {}, target: EventTarget = document): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
    target.dispatchEvent(event);
    return event;
}
function press(key: string): KeyboardEvent {
    const event = keydown(key);
    document.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
    return event;
}
function button(selector: string): HTMLButtonElement {
    const element = document.querySelector<HTMLButtonElement>(selector);
    if (!element) throw new Error("Missing button: " + selector);
    return element;
}
function mountBattle(options: { state?: GameState; actions?: readonly ActionView[]; move?: ActionInfo } = {}) {
    const fixture = escapeFixtures.unselected;
    const engine = createStockEngine(12345);
    createBattle(engine, "plains_1", "standard");
    const state = options.state ?? fixture.state;
    const actions = options.actions ?? fixture.actions.map(action => ({
        ...action,
        moves: [options.move ?? targetingFixtures.telekinesisChoose.action],
    }));
    vi.spyOn(engine, "getGameState").mockReturnValue(state);
    vi.spyOn(engine, "getActionView").mockReturnValue([...actions]);
    const execute = vi.spyOn(engine, "executeAction").mockReturnValue({
        success: false, reason: "actorAlreadyActed",
    });
    const host = document.createElement("div");
    document.body.append(host);
    unmount = render(() => createComponent(BattleApp, { engine, presentation: fixture.presentation }), host);
    return { engine, execute, state, actions };
}
function openTargeting(): void { press("1"); press("1"); }
const commands = () => [...document.querySelectorAll<HTMLButtonElement>(".kcq-command-card")];
const targets = () => [...document.querySelectorAll<HTMLButtonElement>("button.kcq-target-card")];

describe("combat keyboard navigation", () => {
    it.each([1, 2, 3])("selects overview character %i in current party order", number => {
        const fixture = escapeFixtures.unselected;
        const state = { ...fixture.state, characters: [...fixture.state.characters].reverse() };
        mountBattle({ state });
        const cards = [...document.querySelectorAll<HTMLElement>(".kcq-party-card")];
        expect(cards.map(card => card.dataset.kcqShortcut)).toEqual(["1", "2", "3"]);
        expect(cards[number - 1]!.querySelector(".kcq-shortcut")?.textContent).toBe(String(number));
        expect(press(String(number)).defaultPrevented).toBe(true);
        const focused = button(".kcq-character-roster__card--focused");
        expect(focused.textContent).toContain(fixture.presentation.entity(state.characters[number - 1]!.id));
        press("Backspace");
        expect(document.querySelector(".kcq-battle-overview")).not.toBeNull();
    });

    it("uses all eight digits then QWERTY letters, preserving ordinary move order and variants", () => {
        const fixture = escapeFixtures.unselected;
        const base = targetingFixtures.telekinesisChoose.action;
        const keys = "12345678qwertyuiopasdfghjklzxcvbnm".split("");
        const moves = keys.map((_, index) => ({ ...base, move: { ...base.move, id: "variant" + index } }));
        mountBattle({ actions: fixture.actions.map(action => ({ ...action, moves })) });
        press("1");
        expect(commands().slice(0, keys.length).map(command => command.dataset.kcqShortcut)).toEqual(keys);
        for (const [index, key] of keys.entries()) {
            expect(commands()[index]!.querySelector(".kcq-shortcut")?.textContent).toContain(key.toUpperCase());
            press(key.toUpperCase());
            expect(document.querySelector(".kcq-targeting")?.getAttribute("aria-label")).toBe(fixture.presentation.move("variant" + index));
            press("Backspace");
        }
        expect(commands().slice(-2).map(command => command.dataset.kcqShortcut)).toEqual(["0", "9"]);
        expect(combatShortcut(keys.length)).toBeUndefined();
    });

    it("skips invalid targets and immediately submits the valid numbered single target", () => {
        const base = targetingFixtures.telekinesisChoose.action;
        const move = { ...base, targets: [{ ...base.targets[0]!, valid: false as const, reason: "invalidTarget" as const }, ...base.targets.slice(1)] };
        const { execute } = mountBattle({ move });
        openTargeting();
        expect(execute).not.toHaveBeenCalled();
        expect(targets().map(target => target.dataset.kcqShortcut)).toEqual([undefined, "1", "2"]);
        expect(targets()[0]!.disabled).toBe(true);
        press("1");
        expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "move", actor: "ko", move: base.move.id, targets: ["skunketteQueen"] });
        expect(targets()[1]!.getAttribute("aria-pressed")).toBe("true");
    });

    it("carries target numbering into QWERTY without occupying globals", () => {
        const base = targetingFixtures.telekinesisChoose.action;
        const state = targetingFixtures.telekinesisChoose.state;
        const enemies = Array.from({ length: 10 }, (_, index) => ({ ...state.enemies[0]!, id: "skunkette" + (index + 1) }));
        const move = { ...base, targets: enemies.map(enemy => ({ ...base.targets[0]!, target: enemy.id })) };
        const { execute } = mountBattle({ move, state: { ...state, enemies } });
        openTargeting();
        expect(targets().map(target => target.dataset.kcqShortcut)).toEqual("12345678qw".split(""));
        press("Q");
        expect(execute).toHaveBeenLastCalledWith({ type: "move", actor: "ko", move: base.move.id, targets: ["skunkette9"] });
    });

    it("keeps multiple target toggling and requires Enter confirmation", () => {
        const base = targetingFixtures.telekinesisChoose.action;
        const { execute } = mountBattle({ move: { ...base, move: { ...base.move, targets: 2 } } });
        openTargeting();
        expect(press("Enter").defaultPrevented).toBe(false);
        press("1"); press("2"); press("1");
        expect(targets()[0]!.getAttribute("aria-pressed")).toBe("false");
        expect(button(".kcq-targeting__execute").disabled).toBe(true);
        press("3");
        expect(execute).not.toHaveBeenCalled();
        press("Enter");
        expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "move", actor: "ko", move: base.move.id, targets: ["skunketteQueen", "skunkette2"] });
    });

    it.each([0, "all"] as const)("confirms predetermined %s target moves with Enter", count => {
        const base = targetingFixtures.allTargets.action;
        const { execute } = mountBattle({ move: { ...base, move: { ...base.move, targets: count } } });
        openTargeting();
        expect(targets()).toHaveLength(0);
        expect(execute).not.toHaveBeenCalled();
        press("Enter");
        expect(execute).toHaveBeenLastCalledWith({ type: "move", actor: "ko", move: base.move.id, targets: [] });
    });

    it("opens escape, carries choices across groups and confirms an assist", () => {
        const { execute } = mountBattle();
        press("1"); press("9");
        const choices = [...document.querySelectorAll<HTMLButtonElement>(".kcq-escape-choice[data-kcq-shortcut]")];
        expect(choices.map(choice => choice.dataset.kcqShortcut)).toEqual("12345678qwer".split(""));
        press("8");
        expect(button('[data-kcq-shortcut="8"]').getAttribute("aria-pressed")).toBe("true");
        expect(execute).not.toHaveBeenCalled();
        press("Enter");
        expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "escape", actor: "ko", target: "matsuko", binding: "latexLegs" });
        press("Backspace");
        expect(document.querySelector(".kcq-character-commands")).not.toBeNull();
    });

    it("preserves native Enter activation on a focused target", () => {
        const { execute } = mountBattle();
        openTargeting();
        const target = targets()[1]!;
        target.focus();
        expect(keydown("Enter", {}, target).defaultPrevented).toBe(false);
        expect(execute).not.toHaveBeenCalled();
        target.click();
        expect(execute).toHaveBeenLastCalledWith({ type: "move", actor: "ko", move: "telekinesis", targets: ["skunketteQueen"] });
    });

    it("uses globals from selected-character subscreens and ends a dimmed turn", () => {
        const fixture = escapeFixtures.unselected;
        const { execute } = mountBattle({ actions: fixture.actions.map(action => ({ ...action, available: true, stance: { available: true }, moves: [targetingFixtures.telekinesisChoose.action] })) });
        expect(button(".kcq-battle-overview__primary-action").classList.contains("is-dimmed")).toBe(true);
        press("=");
        expect(execute).toHaveBeenLastCalledWith({ type: "endTurn" });
        openTargeting();
        press("0");
        expect(execute).toHaveBeenLastCalledWith({ type: "stance", actor: "ko" });
        press("9");
        expect(document.querySelector(".kcq-escape")).not.toBeNull();
        press("=");
        expect(execute).toHaveBeenLastCalledWith({ type: "endTurn" });
    });

    it("ignores unavailable actions without consuming their keys", () => {
        const fixture = escapeFixtures.unselected;
        const actions = fixture.actions.map(action => ({ ...action, available: false,
            stance: { available: false }, escape: { available: false }, moves: action.moves.map(move => ({ ...move, available: false })) }));
        const { execute } = mountBattle({ actions });
        expect(press("0").defaultPrevented).toBe(false);
        expect(press("8").defaultPrevented).toBe(false);
        expect(press("9").defaultPrevented).toBe(false);
        press("1");
        for (const key of ["1", "0", "8", "9", "x"]) expect(press(key).defaultPrevented).toBe(false);
        expect(execute).not.toHaveBeenCalled();
        expect(document.querySelector(".kcq-targeting")).toBeNull();
    });

    it("does not select targets when the move is unavailable", () => {
        const { execute } = mountBattle({ move: { ...targetingFixtures.telekinesisChoose.action, available: false } });
        press("1");
        expect(press("1").defaultPrevented).toBe(false);
        expect(execute).not.toHaveBeenCalled();
    });

    it("restricts End Turn outside the player phase and blocks combat shortcuts behind modals", () => {
        const fixture = escapeFixtures.unselected;
        const { execute } = mountBattle({ state: { ...fixture.state, turn: { ...fixture.state.turn, phase: "enemy" } } });
        expect(press("=").defaultPrevented).toBe(false);
        button(".kcq-combat-header__settings").click();
        for (const key of ["1", "Backspace", "0", "8", "9", "="]) expect(press(key).defaultPrevented).toBe(false);
        expect(execute).not.toHaveBeenCalled();
    });

    it.each(["input", "textarea", "select", "editable", "editable-child"])("suppresses shortcuts while typing in %s", kind => {
        const { execute } = mountBattle();
        const field = document.createElement(kind.startsWith("editable") ? "div" : kind);
        if (kind.startsWith("editable")) field.setAttribute("contenteditable", "true");
        const child = document.createElement("span");
        field.append(child);
        document.body.append(field);
        for (const key of ["1", "Backspace", "0", "9", "="]) expect(keydown(key, {}, kind === "editable-child" ? child : field).defaultPrevented).toBe(false);
        expect(execute).not.toHaveBeenCalled();
        expect(document.querySelector(".kcq-battle-overview")).not.toBeNull();
    });

    it.each([{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { isComposing: true }])("ignores modified or composing keydown: %j", options => {
        const { execute } = mountBattle();
        expect(keydown("=", options).defaultPrevented).toBe(false);
        expect(execute).not.toHaveBeenCalled();
    });

    it("blocks held and reentrant keys across screen transitions until release", () => {
        const { execute } = mountBattle();
        keydown("1"); keydown("1"); keydown("1", { repeat: true });
        expect(document.querySelector(".kcq-character-commands")).not.toBeNull();
        expect(document.querySelector(".kcq-targeting")).toBeNull();
        document.dispatchEvent(new KeyboardEvent("keyup", { key: "1" }));
        press("1");
        execute.mockImplementation(() => {
            keydown("=");
            return { success: false, reason: "actorAlreadyActed" };
        });
        keydown("="); keydown("="); keydown("=", { repeat: true });
        expect(execute).toHaveBeenCalledOnce();
        document.dispatchEvent(new KeyboardEvent("keyup", { key: "=" }));
        press("=");
        expect(execute).toHaveBeenCalledTimes(2);
    });

    it("executes a real single-target move once and reads fresh state after End Turn", () => {
        const engine = createStockEngine(12345);
        createBattle(engine, "plains_1", "standard");
        const execute = vi.spyOn(engine, "executeAction");
        const host = document.createElement("div");
        document.body.append(host);
        unmount = render(() => createComponent(BattleApp, {
            engine, presentation: escapeFixtures.unselected.presentation,
        }), host);
        press("1");
        const telekinesis = commands().find(command => command.getAttribute("aria-label") === "Telekinesis");
        expect(telekinesis).toBeDefined();
        press(telekinesis!.dataset.kcqShortcut!);
        keydown("1");
        keydown("1", { repeat: true });
        keydown("1");
        expect(execute).toHaveBeenCalledOnce();
        expect(execute.mock.results[0]!.value.success).toBe(true);
        expect(engine.getGameState().characters[0]!.acted).toBe(true);
        expect(document.querySelector(".kcq-targeting")).toBeNull();
        expect(document.querySelector(".kcq-battle-overview")).not.toBeNull();
        document.dispatchEvent(new KeyboardEvent("keyup", { key: "1" }));
        keydown("="); keydown("=", { repeat: true }); keydown("=");
        expect(execute).toHaveBeenCalledTimes(2);
        expect(execute.mock.results[1]!.value.success).toBe(true);
        expect(engine.getGameState().characters[0]!.acted).toBe(false);
        document.dispatchEvent(new KeyboardEvent("keyup", { key: "=" }));
        openTargeting();
        expect(targets().some(target => !target.disabled)).toBe(true);
        expect(execute).toHaveBeenCalledTimes(2);
    });

    it("removes listeners on unmount and handles a fresh battle once", () => {
        const first = mountBattle();
        unmount?.(); unmount = undefined;
        expect(press("=").defaultPrevented).toBe(false);
        expect(first.execute).not.toHaveBeenCalled();
        const second = mountBattle();
        press("=");
        expect(second.execute).toHaveBeenCalledOnce();
        expect(first.execute).not.toHaveBeenCalled();
    });

    it("uses Backspace for cancellation, suppresses browser navigation only when handled, and ignores held or modified keys", () => {
        const { execute } = mountBattle();
        expect(press("Backspace").defaultPrevented).toBe(false);
        openTargeting();
        expect(keydown("Backspace", { ctrlKey: true }).defaultPrevented).toBe(false);
        expect(keydown("Backspace", { altKey: true }).defaultPrevented).toBe(false);
        expect(keydown("Backspace", { metaKey: true }).defaultPrevented).toBe(false);
        expect(keydown("Backspace", { repeat: true }).defaultPrevented).toBe(false);
        expect(document.querySelector(".kcq-targeting")).not.toBeNull();
        expect(keydown("Backspace").defaultPrevented).toBe(true);
        expect(document.querySelector(".kcq-character-commands")).not.toBeNull();
        keydown("Backspace");
        expect(document.querySelector(".kcq-character-commands")).not.toBeNull();
        document.dispatchEvent(new KeyboardEvent("keyup", { key: "Backspace" }));
        expect(press("Backspace").defaultPrevented).toBe(true);
        expect(document.querySelector(".kcq-battle-overview")).not.toBeNull();
        expect(execute).not.toHaveBeenCalled();
    });

    it("places unbracketed badges directly on party, command, target and escape controls", () => {
        mountBattle();
        const assertBadges = (selector: string): void => {
            const cards = [...document.querySelectorAll<HTMLElement>(selector)];
            expect(cards.length).toBeGreaterThan(0);
            for (const card of cards) {
                expect(card.classList.contains("kcq-shortcut-host")).toBe(true);
                const badge = card.querySelector<HTMLElement>(":scope > .kcq-shortcut");
                expect(badge).not.toBeNull();
                expect(badge!.textContent).not.toMatch(/[\[\]]/);
                const key = card.dataset.kcqShortcut;
                if (key) expect(badge!.textContent).toBe(key.toUpperCase());
            }
        };
        assertBadges(".kcq-party-card");
        press("1");
        assertBadges(".kcq-command-card");
        expect(button(".kcq-character-details__back").querySelector(".kcq-shortcut")?.textContent).toBe("⌫");
        expect(document.querySelector(".kcq-command-card__heading .kcq-shortcut")).toBeNull();
        press("1");
        assertBadges("button.kcq-target-card");
        press("9");
        assertBadges(".kcq-escape-choice[data-kcq-shortcut]");
    });

    it.each([320, 390, 480, 481, 1024])("hides only badges at mobile widths and shows them at desktop width %i", width => {
        viewport.setViewport({ width });
        const style = document.createElement("style");
        style.textContent = readFileSync("src/ui/web/app/app.css", "utf8");
        document.body.append(style);
        mountBattle();
        const assertVisibility = (): void => {
            const badges = [...document.querySelectorAll<HTMLElement>(".kcq-shortcut")];
            expect(badges.length).toBeGreaterThan(0);
            for (const badge of badges) {
                const computed = getComputedStyle(badge);
                expect(computed.display).toBe(width <= 480 ? "none" : "inline-flex");
                expect(computed.position).toBe("absolute");
                expect(getComputedStyle(badge.parentElement!).position).toBe("relative");
                expect(getComputedStyle(badge.parentElement!).display).not.toBe("none");
            }
        };
        assertVisibility();
        expect(press("1").defaultPrevented).toBe(true);
        assertVisibility();
        press("1");
        assertVisibility();
        press("Backspace");
        press("9");
        assertVisibility();
        expect(press("Backspace").defaultPrevented).toBe(true);
    });
});
