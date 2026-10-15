import { readFileSync } from "node:fs";
import type { Window as HappyWindow } from "happy-dom";
import { createComponent, createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "../../src/engine/public/types";
import { createStockEngine } from "../../src/stock";
import { BattleApp } from "../../src/ui/web/app/BattleApp";
import { ScreenLayout } from "../../src/ui/web/app/components/ScreenLayout";
import { battleOverviewFixture as fixture } from "../../src/ui/web/app/fixtures/battleOverview";
import { COMBAT_SHORTCUTS } from "../../src/ui/web/app/keyboard";
import { BattleOverviewPanel, type BattleOverviewSections } from "../../src/ui/web/app/panels/BattleOverviewPanel";

const viewport = (window as unknown as HappyWindow).happyDOM;
const initialViewport = { width: window.innerWidth, height: window.innerHeight };
let unmount: (() => void) | undefined;
beforeEach(() => { viewport.setViewport({ width: 390, height: 844 }); window.localStorage.clear(); });
afterEach(() => {
    unmount?.(); unmount = undefined;
    document.body.replaceChildren(); viewport.setViewport(initialViewport);
    window.localStorage.clear(); vi.restoreAllMocks();
});
function mount(view: Parameters<typeof render>[0]): HTMLElement {
    const style = document.createElement("style");
    style.textContent = readFileSync("src/ui/web/app/app.css", "utf8");
    const host = document.createElement("div"); host.className = "kcq-graphical-app__background";
    document.body.append(style, host); unmount = render(view, host); return host;
}
function mountBattle(width = 1920, lines = 3) {
    viewport.setViewport({ width, height: 1080 });
    const engine = createStockEngine(12345);
    const state: GameState = structuredClone(fixture.state); state.turn.phase = "player";
    vi.spyOn(engine, "getGameState").mockReturnValue(state);
    vi.spyOn(engine, "getActionView").mockReturnValue([...fixture.actions]);
    const execute = vi.spyOn(engine, "executeAction").mockReturnValue({ success: false, reason: "actorAlreadyActed" });
    const host = mount(() => createComponent(BattleApp, {
        engine, presentation: fixture.presentation, overviewGameLog: { value: lines, onChange: vi.fn() },
    }));
    return { host, execute };
}
function element(selector: string): HTMLElement {
    const result = document.querySelector<HTMLElement>(selector);
    if (!result) throw new Error("Missing " + selector);
    return result;
}
function press(key: string): void {
    document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
}

describe("overview section configuration", () => {
    const selectors: Record<keyof BattleOverviewSections, string> = {
        header: ".kcq-screen-layout__header", log: ".kcq-battle-section--game-log",
        enemies: ".kcq-battle-section--enemies", party: ".kcq-battle-section--party", footer: ".kcq-screen-layout__footer",
    };
    it.each(Object.keys(selectors) as (keyof BattleOverviewSections)[])("omits only the disabled %s section", section => {
        const host = mount(() => createComponent(BattleOverviewPanel, { ...fixture, sections: { [section]: false } }));
        for (const [key, selector] of Object.entries(selectors)) expect(!!host.querySelector(selector)).toBe(key !== section);
        expect(!!host.querySelector(".kcq-battle-overview__divider")).toBe(section !== "enemies" && section !== "party");
    });
    it("does not evaluate disabled enemy slots or mount a disabled log observer", () => {
        const slots = vi.fn(() => []); const observer = vi.spyOn(window, "ResizeObserver");
        const host = mount(() => createComponent(BattleOverviewPanel, {
            ...fixture, sections: { header: false, log: false, enemies: false, party: false, footer: false },
            enemyDefeats: { slots, active: () => false, remaining: () => 0, present: vi.fn() },
        }));
        expect(host.querySelectorAll("button, h1, h2, article")).toHaveLength(0);
        expect(slots).not.toHaveBeenCalled(); expect(observer).not.toHaveBeenCalled();
        expect(getComputedStyle(element(".kcq-screen-layout")).gridTemplateRows).toBe("minmax(0, 1fr)");
    });
    it("uses distinct heading IDs even with multiple instances", () => {
        const host = mount(() => [createComponent(BattleOverviewPanel, fixture), createComponent(BattleOverviewPanel, fixture)]);
        const ids = [...host.querySelectorAll("[id]")].map(node => node.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const section of host.querySelectorAll("section[aria-labelledby]")) {
            expect(section.querySelector("h2")?.id).toBe(section.getAttribute("aria-labelledby"));
        }
    });
    it("keeps End Turn reactive and blocked in the header", () => {
        const [blocked, setBlocked] = createSignal(false); const onEndTurn = vi.fn();
        const host = mount(() => createComponent(BattleOverviewPanel, {
            ...fixture, state: { ...fixture.state, turn: { ...fixture.state.turn, phase: "player" } },
            sections: { footer: false }, endTurnInHeader: true,
            get inputBlocked() { return blocked(); }, onEndTurn,
        }));
        const button = host.querySelector<HTMLButtonElement>(".kcq-combat-header .kcq-battle-overview__primary-action")!;
        expect(button).not.toBeNull(); expect(host.querySelectorAll(".kcq-battle-overview__primary-action")).toHaveLength(1);
        expect(button.classList.contains("is-dimmed")).toBe(true);
        button.click(); expect(onEndTurn).toHaveBeenCalledOnce();
        setBlocked(true); expect(button.disabled).toBe(true); button.click(); expect(onEndTurn).toHaveBeenCalledOnce();
    });
    it.each([false, true])("gives a headerless layout only its body and optional footer (%s)", footer => {
        mount(() => createComponent(ScreenLayout, { body: "content", footer: footer ? "actions" : undefined }));
        expect(document.querySelector(".kcq-screen-layout__header")).toBeNull();
        expect(getComputedStyle(element(".kcq-screen-layout")).gridTemplateRows)
            .toBe(footer ? "minmax(0, 1fr) auto" : "minmax(0, 1fr)");
    });
});

describe("responsive battle overview", () => {
    it.each([390, 1199, 1200, 1920])("mounts only the active arrangement at %ipx", width => {
        const { host } = mountBattle(width); const desktop = width >= 1200;
        const panels = [...host.querySelectorAll(".kcq-battle-overview")];
        expect(panels).toHaveLength(desktop ? 2 : 1);
        expect(host.querySelectorAll(".kcq-party-card")).toHaveLength(fixture.state.characters.length);
        expect(host.querySelectorAll(".kcq-enemy-card")).toHaveLength(fixture.state.enemies.length);
        expect(host.querySelectorAll(".kcq-battle-overview__primary-action")).toHaveLength(1);
        expect(host.querySelectorAll(".kcq-combat-header")).toHaveLength(1);
        expect(host.querySelectorAll(".kcq-battle-overview__footer")).toHaveLength(desktop ? 0 : 1);
        if (desktop) {
            expect(panels[0]!.querySelectorAll(".kcq-party-card")).toHaveLength(3);
            expect(panels[0]!.querySelector(".kcq-enemy-card, .kcq-compact-game-log")).toBeNull();
            expect(panels[1]!.querySelector(".kcq-party-card, .kcq-screen-layout__header, .kcq-screen-layout__footer")).toBeNull();
            expect(panels[1]!.querySelector(".kcq-battle-section--game-log")!.nextElementSibling)
                .toBe(panels[1]!.querySelector(".kcq-battle-section--enemies"));
            expect(getComputedStyle(host).width).toBe("756px");
            expect(getComputedStyle(element(".kcq-battle-overview-columns")).gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))");
        } else {
            expect([...host.querySelectorAll(".kcq-battle-section")].map(section => section.className))
                .toEqual(["game-log", "enemies", "party"].map(name => "kcq-battle-section kcq-battle-section--" + name));
        }
    });
    it("switches repeatedly without duplicate shortcuts, controls, or engine actions", () => {
        const { host, execute } = mountBattle(1199);
        for (const width of [1200, 1199, 1920, 390, 1200]) {
            viewport.setViewport({ width });
            expect(host.querySelectorAll(".kcq-battle-overview")).toHaveLength(width >= 1200 ? 2 : 1);
            const shortcuts = [...host.querySelectorAll<HTMLElement>("[data-kcq-shortcut]")].map(node => node.dataset.kcqShortcut);
            expect(new Set(shortcuts).size).toBe(shortcuts.length);
            const count = execute.mock.calls.length; press(COMBAT_SHORTCUTS.endTurn);
            expect(execute).toHaveBeenCalledTimes(count + 1);
        }
        expect(execute.mock.calls.every(([action]) => action.type === "endTurn")).toBe(true);
    });
    it("retains character, enemy, and log navigation after resizing, including zero log lines", () => {
        const { host } = mountBattle(1920, 0);
        element(".kcq-party-card").click(); expect(host.querySelector(".kcq-character-details")).not.toBeNull();
        press(COMBAT_SHORTCUTS.back); press("4"); expect(host.querySelector(".kcq-enemy-details")).not.toBeNull();
        press(COMBAT_SHORTCUTS.back); expect(host.querySelector(".kcq-compact-game-log")).toBeNull();
        element(".kcq-game-log-heading-action").click(); expect(host.querySelector(".kcq-game-log")).not.toBeNull();
        expect(getComputedStyle(host).width).toBe("366px");
        press(COMBAT_SHORTCUTS.back); viewport.setViewport({ width: 390 });
        press("1"); expect(host.querySelector(".kcq-character-details")).not.toBeNull();
        press(COMBAT_SHORTCUTS.back); viewport.setViewport({ width: 1920 });
        element(".kcq-enemy-card").click(); expect(host.querySelector(".kcq-enemy-details")).not.toBeNull();
        press(COMBAT_SHORTCUTS.back); press(COMBAT_SHORTCUTS.gameLog);
        expect(host.querySelector(".kcq-game-log")).not.toBeNull();
    });
});
