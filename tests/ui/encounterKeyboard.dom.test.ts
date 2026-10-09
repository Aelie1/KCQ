import { readFileSync } from "node:fs";
import type { Window as HappyWindow } from "happy-dom";
import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStockEngine } from "../../src/stock";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createBattle } from "../../src/ui/web/app";
import { GraphicalApp } from "../../src/ui/web/app/GraphicalApp";
import { EncounterPickerPanel } from "../../src/ui/web/app/components/EncounterPickerPanel";
import { combatShortcut, useCombatKeyboard } from "../../src/ui/web/app/keyboard";
import { createEncounterPickerViewModel } from "../../src/ui/web/app/viewModels/encounters";
import { stockStrings } from "../helpers/stockStrings";
import type { DifficultyId, EncounterId } from "../../src/engine/public/types";

const presentation = new Presentation(stockStrings);
const viewport = (window as unknown as HappyWindow).happyDOM;
const initialViewport = { width: window.innerWidth, height: window.innerHeight };
let unmount: (() => void) | undefined;
beforeEach(() => vi.stubGlobal("__KCQ_GIT_REVISION__", "test"));
afterEach(() => {
    unmount?.();
    unmount = undefined;
    document.body.replaceChildren();
    document.body.removeAttribute("data-test-viewport");
    window.localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    viewport.setViewport(initialViewport);
});
function keydown(key: string, options: KeyboardEventInit = {}, target: EventTarget = document): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
    target.dispatchEvent(event);
    return event;
}
function release(key: string): void { document.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true })); }
function press(key: string): KeyboardEvent { const event = keydown(key); release(key); return event; }
function button(selector: string): HTMLButtonElement {
    const found = document.querySelector<HTMLButtonElement>(selector);
    if (!found) throw new Error("Missing button: " + selector);
    return found;
}
function mountApp() {
    const catalog = createStockEngine().getLibrary();
    const prepareBattle = vi.fn((_campaign: "skunk", encounter: EncounterId, difficulty: DifficultyId) => {
        const engine = createStockEngine(12345);
        createBattle(engine, encounter, difficulty);
        return { engine, dispose: vi.fn() };
    });
    const host = document.createElement("div");
    document.body.append(host);
    unmount = render(() => createComponent(GraphicalApp, {
        campaigns: ["skunk"], release: "test", presentation, prepareBattle,
        composeCampaign: () => ({ engine: createStockEngine(), presentation }),
    }), host);
    button(".kcq-title-screen__campaign").click();
    return { prepareBattle, catalog };
}
function assertBadges(visible: boolean, mobile = false): void {
    expect(document.querySelector(".kcq-graphical-app__background")?.getAttribute("data-kcq-hints-visible")).toBe(String(visible));
    const badges = [...document.querySelectorAll<HTMLElement>(".kcq-shortcut")];
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) {
        // Happy DOM can retain stale descendant selector matches after ancestor attribute changes.
        badge.classList.toggle("test-hints-visible", visible);
        const style = getComputedStyle(badge);
        expect(style.visibility).toBe(visible ? "visible" : "hidden");
        expect(style.display).toBe(mobile ? "none" : "inline-flex");
        expect(style.position).toBe("absolute");
        expect(style.pointerEvents).toBe("none");
        expect(getComputedStyle(badge.parentElement!).position).toBe("relative");
        expect(getComputedStyle(badge.parentElement!).overflow).toBe("visible");
    }
}

describe("encounter keyboard navigation", () => {
    it("selects every encounter in visible catalog order without an extra confirmation step", () => {
        const { catalog, prepareBattle } = mountApp();
        const encounters = Object.values(catalog.encounters);
        const rows = [...document.querySelectorAll<HTMLButtonElement>(".kcq-encounter-picker__row")];
        expect(rows).toHaveLength(encounters.length);
        expect(press("Enter").defaultPrevented).toBe(false);
        for (const [index, encounter] of encounters.entries()) {
            const row = button('.kcq-encounter-picker__row[data-kcq-shortcut="' + combatShortcut(index) + '"]');
            expect(row.querySelector(".kcq-shortcut")?.textContent).toBe(combatShortcut(index)?.toUpperCase());
            expect(press(combatShortcut(index)!).defaultPrevented).toBe(true);
            expect(document.querySelector(".kcq-encounter-details h1")?.textContent).toBe(presentation.encounter(encounter.id));
            press("Backspace");
        }
        expect(prepareBattle).not.toHaveBeenCalled();
    });

    it("supports QWERTY carryover and skips disabled encounters without renumbering", () => {
        const base = createEncounterPickerViewModel(createStockEngine().getLibrary(), presentation);
        const model = { ...base, encounters: Array.from({ length: 12 }, (_, index) => ({ ...base.encounters[0]!, id: "test" + index, name: "Encounter " + index })) };
        const onSelect = vi.fn();
        const host = document.createElement("div");
        document.body.append(host);
        unmount = render(() => {
            useCombatKeyboard(() => host, () => true, () => false, () => "always");
            return createComponent(EncounterPickerPanel, { model, onSelect });
        }, host);
        const rows = [...host.querySelectorAll<HTMLButtonElement>(".kcq-encounter-picker__row")];
        expect(rows.map(row => row.dataset.kcqShortcut)).toEqual("12345678qwer".split(""));
        rows[1]!.disabled = true;
        rows[2]!.setAttribute("aria-disabled", "true");
        expect(press("2").defaultPrevented).toBe(false);
        expect(press("3").defaultPrevented).toBe(false);
        expect(onSelect).not.toHaveBeenCalled();
        press("Q"); press("r");
        expect(onSelect.mock.calls).toEqual([["test8"], ["test11"]]);
        expect(rows[1]!.querySelector(".kcq-shortcut")?.textContent).toBe("2");
        expect(press("Backspace").defaultPrevented).toBe(false);
    });

    it("reuses Back navigation on difficulty, details and picker and does nothing at title", () => {
        const { prepareBattle } = mountApp();
        press("1"); press("Enter");
        expect(document.querySelector(".kcq-difficulty-select")).not.toBeNull();
        expect(press("Backspace").defaultPrevented).toBe(true);
        expect(document.querySelector(".kcq-encounter-details")).not.toBeNull();
        expect(press("Backspace").defaultPrevented).toBe(true);
        expect(document.querySelector(".kcq-encounter-picker")).not.toBeNull();
        expect(press("Backspace").defaultPrevented).toBe(true);
        expect(document.querySelector(".kcq-title-screen")).not.toBeNull();
        expect(press("Backspace").defaultPrevented).toBe(false);
        expect(prepareBattle).not.toHaveBeenCalled();
    });

    it("confirms details and difficulty with Enter, respecting the selected difficulty", () => {
        const { prepareBattle, catalog } = mountApp();
        press("2");
        expect(button('[data-kcq-shortcut="enter"]').querySelector(".kcq-shortcut")?.textContent).toBe("↵");
        expect(press("Enter").defaultPrevented).toBe(true);
        const mythic = [...document.querySelectorAll<HTMLButtonElement>(".kcq-difficulty-select__choice")].find(choice => choice.textContent === "Mythic")!;
        mythic.click();
        expect(prepareBattle).not.toHaveBeenCalled();
        press("Enter");
        expect(prepareBattle).toHaveBeenCalledExactlyOnceWith("skunk", Object.values(catalog.encounters)[1]!.id, "mythic");
        expect(document.querySelector(".kcq-battle-overview")).not.toBeNull();
    });

    it("respects disabled confirmations and suppresses held Enter across screen transitions", () => {
        const { prepareBattle } = mountApp();
        press("1");
        const confirm = button('[data-kcq-shortcut="enter"]');
        confirm.disabled = true;
        expect(press("Enter").defaultPrevented).toBe(false);
        expect(document.querySelector(".kcq-encounter-details")).not.toBeNull();
        confirm.disabled = false;
        confirm.focus();
        expect(keydown("Enter", {}, confirm).defaultPrevented).toBe(true);
        keydown("Enter"); keydown("Enter", { repeat: true });
        expect(document.querySelector(".kcq-difficulty-select")).not.toBeNull();
        expect(prepareBattle).not.toHaveBeenCalled();
        release("Enter");
        const start = button('[data-kcq-shortcut="enter"]');
        start.disabled = true;
        expect(press("Enter").defaultPrevented).toBe(false);
        expect(prepareBattle).not.toHaveBeenCalled();
        start.disabled = false;
        start.focus();
        keydown("Enter", {}, start);
        keydown("Enter", { repeat: true }); keydown("Enter");
        expect(prepareBattle).toHaveBeenCalledOnce();
    });

    it("does not cascade held encounter or Backspace keys across screens", () => {
        mountApp();
        keydown("1"); keydown("1", { repeat: true }); keydown("1");
        expect(document.querySelector(".kcq-encounter-details")).not.toBeNull();
        release("1");
        keydown("Backspace"); keydown("Backspace", { repeat: true }); keydown("Backspace");
        expect(document.querySelector(".kcq-encounter-picker")).not.toBeNull();
        release("Backspace");
        press("Backspace");
        expect(document.querySelector(".kcq-title-screen")).not.toBeNull();
    });

    it.each(["input", "textarea", "select", "editable"])("suppresses selection, Back and Enter while typing in %s", kind => {
        const { prepareBattle } = mountApp();
        const field = document.createElement(kind === "editable" ? "div" : kind);
        if (kind === "editable") field.setAttribute("contenteditable", "true");
        document.body.append(field);
        for (const key of ["1", "Backspace", "Enter", "-"]) expect(keydown(key, {}, field).defaultPrevented).toBe(false);
        expect(document.querySelector(".kcq-encounter-picker")).not.toBeNull();
        press("1");
        for (const key of ["Backspace", "Enter"]) expect(keydown(key, {}, field).defaultPrevented).toBe(false);
        expect(document.querySelector(".kcq-encounter-details")).not.toBeNull();
        expect(prepareBattle).not.toHaveBeenCalled();
    });

    it("blocks navigation behind settings and registers one listener through battle and retry", () => {
        const listen = vi.spyOn(document, "addEventListener");
        const remove = vi.spyOn(document, "removeEventListener");
        const { prepareBattle } = mountApp();
        button(".kcq-combat-header__settings").click();
        for (const key of ["1", "Backspace", "Enter"]) expect(press(key).defaultPrevented).toBe(false);
        button(".kcq-battle-result__retry").click();
        press("1"); press("Enter"); press("Enter");
        expect(prepareBattle).toHaveBeenCalledOnce();
        button(".kcq-combat-header__settings").click();
        button(".kcq-battle-settings .kcq-battle-result__back").click();
        press("-"); press("Backspace");
        const listeners = listen.mock.calls.filter(call => call[0] === "keydown" && call[2] !== true);
        expect(listeners).toHaveLength(1);
        expect(listen.mock.calls.filter(call => call[0] === "keyup")).toHaveLength(1);
        unmount!(); unmount = undefined;
        expect(remove).toHaveBeenCalledWith("keydown", listeners[0]![1]);
    });

    it.each(["temporary", "always"] as const)("uses shared %s hints on every pre-combat screen and the log at desktop and phone widths", mode => {
        vi.useFakeTimers();
        viewport.setViewport({ width: 1024 });
        window.localStorage.setItem("kcq.keyboardShortcutHints", mode);
        const style = document.createElement("style");
        style.textContent = readFileSync("src/ui/web/app/app.css", "utf8");
        document.body.append(style);
        mountApp();
        assertBadges(mode === "always");
        keydown("Shift");
        assertBadges(true);
        release("Shift");
        press("1");
        assertBadges(true);
        vi.advanceTimersByTime(3000);
        assertBadges(mode === "always");
        keydown("Shift");
        for (const navigate of [() => {}, () => press("Enter"), () => press("Enter"), () => press("-")]) {
            navigate();
            assertBadges(true);
            viewport.setViewport({ width: 390 });
            // Invalidate Happy DOM's computed-style cache after changing viewport size.
            document.body.setAttribute("data-test-viewport", "390");
            assertBadges(true, true);
            viewport.setViewport({ width: 1024 });
            document.body.setAttribute("data-test-viewport", "1024");
            assertBadges(true);
        }
    });
});
