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
import { combatShortcut, COMBAT_SHORTCUTS } from "../../src/ui/web/app/keyboard";

const viewport = (window as unknown as HappyWindow).happyDOM;
const initialViewport = { width: window.innerWidth, height: window.innerHeight };
let unmount: (() => void) | undefined;
afterEach(() => {
    unmount?.();
    unmount = undefined;
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.localStorage.clear();
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
        expect(commands().slice(-2).map(command => command.dataset.kcqShortcut)).toEqual([COMBAT_SHORTCUTS.stance, COMBAT_SHORTCUTS.escape]);
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
        press("1"); press(COMBAT_SHORTCUTS.escape);
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
        press(COMBAT_SHORTCUTS.stance);
        expect(execute).toHaveBeenLastCalledWith({ type: "stance", actor: "ko" });
        press(COMBAT_SHORTCUTS.escape);
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
        press(COMBAT_SHORTCUTS.escape);
        assertBadges(".kcq-escape-choice[data-kcq-shortcut]");
    });

    it.each([320, 390, 480, 481, 1024])("hides only badges at mobile widths and shows them at desktop width %i", width => {
        viewport.setViewport({ width });
        const style = document.createElement("style");
        style.textContent = readFileSync("src/ui/web/app/app.css", "utf8");
        document.body.append(style);
        mountBattle();
        press("Shift");
        const assertVisibility = (): void => {
            const badges = [...document.querySelectorAll<HTMLElement>(".kcq-shortcut")];
            expect(badges.length).toBeGreaterThan(0);
            for (const badge of badges) {
                const computed = getComputedStyle(badge);
                expect(computed.display).toBe(width <= 480 ? "none" : "inline-flex");
                expect(computed.visibility).toBe("visible");
                expect(computed.pointerEvents).toBe("none");
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
        press(COMBAT_SHORTCUTS.escape);
        assertVisibility();
        expect(press("Backspace").defaultPrevented).toBe(true);
    });
});

const hintsVisible = () => document.querySelector(".kcq-battle-stage")?.getAttribute("data-kcq-hints-visible") === "true";
function shiftDown(code = "ShiftLeft", repeat = false): KeyboardEvent {
    return keydown("Shift", { code, shiftKey: true, repeat });
}
function shiftUp(code = "ShiftLeft"): void {
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", code, bubbles: true }));
}
function hintPreference(mode: "always" | "temporary"): void {
    button(".kcq-combat-header__settings").click();
    const select = document.querySelector<HTMLSelectElement>(".kcq-battle-settings__shortcut-hints select")!;
    select.value = mode;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    button(".kcq-battle-result__retry").click();
}
function addShortcutStyles(): void {
    const style = document.createElement("style");
    style.textContent = readFileSync("src/ui/web/app/app.css", "utf8");
    document.body.append(style);
}

describe("keyboard shortcut hint visibility", () => {
    it("defaults to temporary hints and keeps hidden shortcuts and mouse activation working", () => {
        addShortcutStyles();
        const { execute } = mountBattle();
        expect(hintsVisible()).toBe(false);
        expect(getComputedStyle(document.querySelector(".kcq-shortcut")!).visibility).toBe("hidden");
        button(".kcq-combat-header__settings").click();
        const select = document.querySelector<HTMLSelectElement>(".kcq-battle-settings__shortcut-hints select")!;
        expect(select.value).toBe("temporary");
        expect(select.labels?.[0]?.textContent).toContain("Keyboard Shortcut Hints");
        expect([...select.options].map(option => option.text)).toEqual(["Always Show", "Show Temporarily"]);
        button(".kcq-battle-result__retry").click();
        press("1");
        expect(document.querySelector(".kcq-character-commands")).not.toBeNull();
        button('.kcq-command-card[data-kcq-shortcut="1"]').click();
        expect(document.querySelector(".kcq-targeting")).not.toBeNull();
        expect(hintsVisible()).toBe(false);
        press("1");
        expect(execute).toHaveBeenCalledOnce();
        press("Backspace"); press("Backspace"); press("=");
        expect(execute).toHaveBeenCalledTimes(2);
    });

    it.each(["ShiftLeft", "ShiftRight"])("reveals on %s, stays visible while held and hides exactly three seconds after release", code => {
        vi.useFakeTimers();
        const { execute } = mountBattle();
        expect(shiftDown(code).defaultPrevented).toBe(false);
        expect(hintsVisible()).toBe(true);
        expect(execute).not.toHaveBeenCalled();
        vi.advanceTimersByTime(10000);
        shiftDown(code, true);
        vi.advanceTimersByTime(10000);
        expect(hintsVisible()).toBe(true);
        shiftUp(code);
        vi.advanceTimersByTime(2999);
        expect(hintsVisible()).toBe(true);
        vi.advanceTimersByTime(1);
        expect(hintsVisible()).toBe(false);
    });

    it("waits until both Shift keys are released before starting the timeout", () => {
        vi.useFakeTimers();
        mountBattle();
        shiftDown(); shiftDown("ShiftRight"); shiftUp();
        vi.advanceTimersByTime(5000);
        expect(hintsVisible()).toBe(true);
        shiftUp("ShiftRight");
        vi.advanceTimersByTime(3000);
        expect(hintsVisible()).toBe(false);
    });

    it("resets the release timeout on a new Shift press and ignores repeats", () => {
        vi.useFakeTimers();
        mountBattle();
        shiftDown(); shiftUp();
        vi.advanceTimersByTime(2500);
        shiftDown();
        vi.advanceTimersByTime(5000);
        expect(hintsVisible()).toBe(true);
        shiftUp();
        vi.advanceTimersByTime(2000);
        shiftDown("ShiftLeft", true);
        vi.advanceTimersByTime(1000);
        expect(hintsVisible()).toBe(false);
    });

    it("clears active timers when changing modes and persists Always Show across remounts", () => {
        vi.useFakeTimers();
        mountBattle();
        shiftDown(); shiftUp();
        vi.advanceTimersByTime(1000);
        hintPreference("always");
        expect(window.localStorage.getItem("kcq.keyboardShortcutHints")).toBe("always");
        vi.advanceTimersByTime(10000);
        expect(hintsVisible()).toBe(true);
        unmount!();
        mountBattle();
        expect(hintsVisible()).toBe(true);
        hintPreference("temporary");
        expect(hintsVisible()).toBe(false);
        expect(window.localStorage.getItem("kcq.keyboardShortcutHints")).toBe("temporary");
        unmount!();
        mountBattle();
        expect(hintsVisible()).toBe(false);
    });

    it("keeps a held Shift visible when switching to temporary mode", () => {
        vi.useFakeTimers();
        mountBattle();
        hintPreference("always");
        shiftDown();
        hintPreference("temporary");
        vi.advanceTimersByTime(5000);
        expect(hintsVisible()).toBe(true);
        shiftUp();
        vi.advanceTimersByTime(3000);
        expect(hintsVisible()).toBe(false);
    });

    it.each(["held", "released"])("clears %s Shift state and its timeout on blur", state => {
        vi.useFakeTimers();
        mountBattle();
        shiftDown();
        if (state === "released") shiftUp();
        window.dispatchEvent(new Event("blur"));
        expect(hintsVisible()).toBe(false);
        shiftUp();
        vi.advanceTimersByTime(5000);
        expect(hintsVisible()).toBe(false);
        shiftDown();
        expect(hintsVisible()).toBe(true);
        shiftUp();
        vi.advanceTimersByTime(3000);
        expect(hintsVisible()).toBe(false);
    });

    it("removes keyboard listeners and pending hint timers when disposed", () => {
        vi.useFakeTimers();
        const listen = vi.spyOn(document, "addEventListener");
        const remove = vi.spyOn(document, "removeEventListener");
        mountBattle();
        const timers = vi.getTimerCount();
        shiftDown(); shiftUp();
        expect(vi.getTimerCount()).toBe(timers + 1);
        const stage = document.querySelector(".kcq-battle-stage")!;
        unmount!(); unmount = undefined;
        expect(vi.getTimerCount()).toBe(timers);
        for (const type of ["keydown", "keyup"]) {
            const listeners = listen.mock.calls.filter(call => call[0] === type);
            expect(listeners).toHaveLength(1);
            expect(remove).toHaveBeenCalledWith(type, listeners[0]![1]);
        }
        vi.advanceTimersByTime(5000);
        expect(stage.getAttribute("data-kcq-hints-visible")).toBe("true");
    });

    it.each(["temporary", "always"] as const)("suppresses %s hints on phones and updates when resizing", mode => {
        addShortcutStyles();
        viewport.setViewport({ width: 1024 });
        mountBattle();
        hintPreference(mode);
        shiftDown();
        for (const navigate of [() => {}, () => press("1"), () => press("1"), () => press(COMBAT_SHORTCUTS.escape)]) {
            navigate();
            const badges = [...document.querySelectorAll(".kcq-shortcut")];
            expect(badges.length).toBeGreaterThan(0);
            for (const width of [480, 390, 320, 481, 1024]) {
                viewport.setViewport({ width });
                // Happy DOM does not invalidate computed-style caches on viewport changes.
                document.body.setAttribute("data-test-viewport", String(width));
                for (const badge of badges) {
                    expect(getComputedStyle(badge).display).toBe(width <= 480 ? "none" : "inline-flex");
                    expect(getComputedStyle(badge).visibility).toBe("visible");
                }
            }
        }
    });

    it("keeps card content styles and nodes fixed while revealing and hiding overlays", () => {
        addShortcutStyles();
        mountBattle();
        const capture = () => [...document.querySelectorAll<HTMLElement>(
            ".kcq-shortcut-host, .kcq-party-card__header, .kcq-command-card__heading, .kcq-target-header, .kcq-party-card__bindings"
        )].map(element => {
            const style = getComputedStyle(element);
            return { element, width: style.width, height: style.height, padding: style.padding, gap: style.gap, position: style.position };
        });
        for (const navigate of [() => {}, () => press("1"), () => press("1")]) {
            navigate();
            window.dispatchEvent(new Event("blur"));
            const hidden = capture();
            shiftDown();
            expect(capture()).toEqual(hidden);
            for (const badge of document.querySelectorAll<HTMLElement>(".kcq-shortcut")) {
                const style = getComputedStyle(badge);
                expect(style.position).toBe("absolute");
                expect(style.pointerEvents).toBe("none");
                expect(style.transform).toBe("translateY(-50%)");
                expect(style.zIndex).toBe("1");
                expect(getComputedStyle(badge.parentElement!).overflow).toBe("visible");
            }
            window.dispatchEvent(new Event("blur"));
            expect(capture()).toEqual(hidden);
        }
    });
});
