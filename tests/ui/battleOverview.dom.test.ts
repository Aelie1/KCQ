import type { Window as HappyWindow } from "happy-dom";
import { readFileSync } from "node:fs";
import { createComponent, createSignal } from "solid-js";
import { insert, render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "../../src/engine/public/types";
import { createStockEngine } from "../../src/stock";
import { App } from "../../src/ui/web/app/App";
import { BattleApp } from "../../src/ui/web/app/BattleApp";
import { ScreenLayout } from "../../src/ui/web/app/components/ScreenLayout";
import { battleOverviewFixture as fixture } from "../../src/ui/web/app/fixtures/battleOverview";
import { COMBAT_SHORTCUTS } from "../../src/ui/web/app/keyboard";
import { BattleOverviewPanel, type BattleOverviewSections } from "../../src/ui/web/app/panels/BattleOverviewPanel";
import { AUTO_MEDIUM_BREAKPOINT, AUTO_WIDE_BREAKPOINT, LAYOUT_WIDTHS } from "../../src/ui/web/app/responsiveScale";

const viewport = (window as unknown as HappyWindow).happyDOM;
const initialViewport = { width: window.innerWidth, height: window.innerHeight };
let unmount: (() => void) | undefined;
beforeEach(() => {
    viewport.setViewport({ width: 390, height: 844 }); window.localStorage.clear();
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
        return this.matches(".kcq-app") ? window.innerWidth : 0;
    });
});
afterEach(() => {
    unmount?.(); unmount = undefined;
    document.body.replaceChildren(); viewport.setViewport(initialViewport);
    window.localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function mount(view: Parameters<typeof render>[0], responsive = false): HTMLElement {
    const style = document.createElement("style");
    style.textContent = readFileSync("src/ui/web/app/app.css", "utf8");
    const host = document.createElement("div"); host.className = "kcq-graphical-app__background";
    document.body.append(style);
    if (responsive) {
        const root = document.createElement("div");
        document.body.append(root);
        unmount = render(() => createComponent(App, {
            get children() { insert(host, view()); return host; },
        }), root);
    } else {
        document.body.append(host);
        unmount = render(view, host);
    }
    return host;
}
function mountBattle(width = 1920, lines = 3, initialState: GameState = fixture.state) {
    viewport.setViewport({ width, height: 1080 });
    const engine = createStockEngine(12345);
    const state: GameState = structuredClone(initialState); state.turn.phase = "player";
    vi.spyOn(engine, "getGameState").mockReturnValue(state);
    vi.spyOn(engine, "getActionView").mockReturnValue([...fixture.actions]);
    const execute = vi.spyOn(engine, "executeAction").mockReturnValue({ success: false, reason: "actorAlreadyActed" });
    const host = mount(() => createComponent(BattleApp, {
        engine, presentation: fixture.presentation, overviewGameLog: { value: lines, onChange: vi.fn() },
    }), true);
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
        expect(host.querySelector(".kcq-screen-layout__body")).toBeNull();
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
    it.each([390, 1024, 1920])("keeps temporary and permanent status indicators inline in expanded cards (%ipx)", width => {
        const state: GameState = structuredClone(fixture.state);
        state.enemies = [{
            ...state.enemies[0]!, id: "queen", buffs: [
                { id: "starlightBindings", duration: 3, icon: "shield-off", modifiers: { defense: -2 } },
                { id: "subspaceClutter", duration: 2, icon: "sword", modifiers: { hit: -2 } },
                { id: "difficulty", icon: "crown", modifiers: { hit: 2 } },
            ]
        }];
        const { host } = mountBattle(width, 3, state);
        const card = host.querySelector(".kcq-enemy-card")!;
        const header = card.querySelector(".kcq-enemy-card__header")!;
        const name = header.querySelector(".kcq-enemy-card__name")!;
        const statuses = header.querySelector(".kcq-enemy-card__debuffs")!;
        const temporary = statuses.querySelector(".kcq-enemy-card__temporary-effects")!;
        const permanent = statuses.querySelector(".kcq-enemy-card__permanent-effects")!;
        const expanded = width >= AUTO_MEDIUM_BREAKPOINT;
        expect(card.querySelectorAll(".kcq-enemy-card__debuffs")).toHaveLength(1);
        expect(name.nextElementSibling).toBe(statuses);
        expect([...statuses.children]).toEqual([permanent, temporary]);
        expect(temporary.querySelectorAll('[data-icon="shield-off"]')).toHaveLength(3);
        expect(temporary.querySelectorAll('[data-icon="sword"]')).toHaveLength(2);
        expect(permanent.querySelector('[data-icon="crown"]')).not.toBeNull();
        expect(permanent.textContent).toBe("+2");
        for (const indicator of statuses.querySelectorAll('[role="img"]')) {
            expect(indicator.getAttribute("aria-label")).toBeTruthy();
            expect(indicator.getAttribute("title")).toBe(indicator.getAttribute("aria-label"));
        }
        expect(getComputedStyle(statuses).position).toBe(expanded ? "static" : "absolute");
        expect(getComputedStyle(statuses).flexWrap).toBe(expanded ? "nowrap" : "wrap");
        expect(getComputedStyle(permanent).flexWrap).toBe(expanded ? "nowrap" : "wrap");
        expect(getComputedStyle(header.querySelector(".kcq-enemy-card__hp")!).whiteSpace).toBe("nowrap");
        if (expanded) {
            const meter = header.querySelector(".kcq-enemy-card__hp-meter")!;
            expect(statuses.nextElementSibling).toBe(meter);
            expect(getComputedStyle(name).whiteSpace).toBe("nowrap");
            expect(getComputedStyle(name).flexBasis).toBe("auto");
            expect(getComputedStyle(meter).flexBasis).toMatch(/^0(px)?$/);
            expect(getComputedStyle(meter).minWidth).toMatch(/^0(px)?$/);
            expect(getComputedStyle(meter).maxWidth).toBe("90px");
            expect(getComputedStyle(temporary).alignItems).toBe("center");
        } else {
            expect(getComputedStyle(statuses).top).toBe("-1px");
            expect(getComputedStyle(statuses).left).toBe("16px");
            expect(getComputedStyle(name).whiteSpace).toBe("normal");
            expect(header.querySelector(".kcq-enemy-card__hp-meter")).toBeNull();
        }
    });
    it.each([390, 1024, 1920])("adds the HP meter and moves linked icons left in expanded mode at %ipx", width => {
        const state: GameState = structuredClone(fixture.state);
        const enemy = state.enemies[0]!;
        enemy.currHp = 50; enemy.maxHp = 200;
        enemy.buffs = [{ id: "pounce", linkedEntity: "ko" }, { id: "pounce", linkedEntity: "matsuko" }];
        const { host } = mountBattle(width, 3, state);
        const header = host.querySelector(".kcq-enemy-card__header")!;
        const links = [...header.querySelectorAll(".kcq-linked-entity-chip")];
        const expanded = width >= AUTO_MEDIUM_BREAKPOINT;
        expect(links).toHaveLength(2);
        for (const link of links) expect(link.compareDocumentPosition(header.querySelector(".kcq-enemy-card__name")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        const meter = header.querySelector<HTMLElement>(".kcq-enemy-card__hp-meter");
        expect(!!meter).toBe(expanded);
        if (meter) {
            expect(meter.querySelector<HTMLElement>("span")!.style.width).toBe("25%");
            expect(meter.nextElementSibling?.querySelector(".kcq-enemy-card__hp")?.textContent).toBe("50 / 200");
            expect(getComputedStyle(meter).maxWidth).toBe("90px");
        }
    });
    it.each([
        390, AUTO_MEDIUM_BREAKPOINT - 1, AUTO_MEDIUM_BREAKPOINT, AUTO_MEDIUM_BREAKPOINT + 1,
        AUTO_WIDE_BREAKPOINT - 1, AUTO_WIDE_BREAKPOINT, AUTO_WIDE_BREAKPOINT + 1, 1920, 2560,
    ])("mounts only the active arrangement at %ipx", width => {
        const { host } = mountBattle(width); const nonNarrow = width >= AUTO_MEDIUM_BREAKPOINT;
        const wide = width >= AUTO_WIDE_BREAKPOINT;
        const panels = [...host.querySelectorAll(".kcq-battle-overview")];
        expect(panels).toHaveLength(wide ? 4 : nonNarrow ? 2 : 1);
        expect(host.querySelectorAll(".kcq-party-card")).toHaveLength(fixture.state.characters.length);
        expect(host.querySelectorAll(".kcq-enemy-card")).toHaveLength(fixture.state.enemies.length);
        expect(host.querySelectorAll(".kcq-battle-overview__primary-action")).toHaveLength(1);
        expect(host.querySelectorAll(".kcq-combat-header")).toHaveLength(1);
        expect(host.querySelectorAll(".kcq-battle-overview__footer")).toHaveLength(nonNarrow ? 0 : 1);
        if (wide) {
            expect(panels[0]!.querySelector(".kcq-combat-header")).not.toBeNull();
            expect(panels[0]!.querySelector(".kcq-screen-layout__body")).toBeNull();
            expect(getComputedStyle(panels[0]!).gridColumn).toBe("1 / -1");
            expect(getComputedStyle(host).width).toBe(`${LAYOUT_WIDTHS[3]}px`);
            expect(getComputedStyle(element(".kcq-battle-overview-wide")).gridTemplateColumns)
                .toBe("366px 366px 366px");
            expect([...host.querySelectorAll(".kcq-battle-section")].map(section => section.className))
                .toEqual(["party", "enemies", "game-log"].map(name => "kcq-battle-section kcq-battle-section--" + name));
            for (const panel of panels.slice(1)) expect(panel.querySelectorAll(".kcq-battle-section")).toHaveLength(1);
            expect(getComputedStyle(element(".kcq-party-card")).width).toBe("366px");
            expect(getComputedStyle(element(".kcq-enemy-card")).width).toBe("100%");
            expect(getComputedStyle(element(".kcq-battle-overview__enemies")).gridTemplateColumns).toBe("minmax(0, 1fr)");
            const log = element(".kcq-overview-game-log-history");
            expect(getComputedStyle(log).overflowY).toBe("auto");
            expect(log.getAttribute("role")).toBe("log"); expect(log.tabIndex).toBe(0);
            expect(host.querySelector(".kcq-compact-game-log")).toBeNull();
            const heading = element(".kcq-battle-section--game-log .kcq-battle-section__heading");
            expect(heading.querySelector("h2")!.textContent).toBe("Game Log");
            expect(heading.querySelector("[data-kcq-shortcut]")).toBeNull();
            expect(heading.querySelector(".kcq-game-log-heading-action--full")).not.toBeNull();
            heading.click();
            expect(document.querySelector(".kcq-game-log")).toBeNull();
            expect(getComputedStyle(panels[2]!.querySelector(".kcq-screen-layout__body")!).overflowY).toBe("auto");
        } else if (nonNarrow) {
            expect(panels[0]!.querySelectorAll(".kcq-party-card")).toHaveLength(3);
            expect(panels[0]!.querySelector(".kcq-enemy-card, .kcq-compact-game-log")).toBeNull();
            expect(panels[1]!.querySelector(".kcq-party-card, .kcq-screen-layout__header, .kcq-screen-layout__footer")).toBeNull();
            expect(panels[1]!.querySelector(".kcq-battle-section--game-log")!.nextElementSibling)
                .toBe(panels[1]!.querySelector(".kcq-battle-section--enemies"));
            expect(getComputedStyle(host).width).toBe("756px");
            expect(getComputedStyle(element(".kcq-battle-overview-medium")).gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))");
        } else {
            expect([...host.querySelectorAll(".kcq-battle-section")].map(section => section.className))
                .toEqual(["game-log", "enemies", "party"].map(name => "kcq-battle-section kcq-battle-section--" + name));
        }
    });
    it("shows every intention only in expanded mode and restores existing summaries after resizing", () => {
        const { host } = mountBattle(AUTO_MEDIUM_BREAKPOINT - 1);
        const fullCount = fixture.state.enemies.reduce((count, enemy) => count + enemy.intentions.length, 0);
        const summaryCount = fixture.state.enemies.reduce((count, enemy) => count + Math.min(2, enemy.intentions.length), 0);
        for (const width of [1920, 1024, 390, 1600]) {
            viewport.setViewport({ width });
            const expanded = width >= AUTO_MEDIUM_BREAKPOINT;
            expect(host.querySelectorAll(".kcq-enemy-card__intent-slot"), String(width)).toHaveLength(expanded ? fullCount : summaryCount);
            expect(host.querySelectorAll(".kcq-enemy-card__overflow")).toHaveLength(expanded ? 0 : 1);
            expect(host.querySelectorAll(".kcq-intent-row--expanded").length > 0).toBe(expanded);
            const cardStyle = getComputedStyle(element(".kcq-enemy-card"));
            expect(cardStyle.width).toBe(expanded ? "100%" : "180px");
            expect(cardStyle.height).toBe("auto");
            expect(getComputedStyle(element(".kcq-battle-overview__enemies")).gridTemplateColumns)
                .toBe(expanded ? "minmax(0, 1fr)" : "repeat(2, 180px)");
            if (expanded) {
                expect(getComputedStyle(element(".kcq-enemy-card__intent-slot")).flexDirection).toBe("column");
                expect(getComputedStyle(element(".kcq-intent-row__move")).whiteSpace).toBe("normal");
                expect(getComputedStyle(element(".kcq-intent-row__targets")).overflow).toBe("visible");
                expect(getComputedStyle(element(".kcq-intent-row--expanded")).overflowWrap).toBe("anywhere");
            }
        }
    });
    it("keeps per-attack targets, outcomes and multiple consequences visible in wide cards", () => {
        const state: GameState = structuredClone(fixture.state);
        const arms = state.characters[0]!.bindings.find(binding => binding.id === "latexArms")!;
        arms.value = 95; arms.level = "overwhelming";
        state.enemies[0]!.intentions = [{
            move: "latexSpray", resolved: false, effects: [], targets: [
                {
                    target: "ko", band: "hit", effects: [
                        { type: "binding", target: "ko", binding: "latexArms", amount: 34 },
                        { type: "damage", target: "ko", amount: 12 },
                    ]
                },
                { target: "ko", band: "crit", effects: [{ type: "binding", target: "ko", binding: "latexLegs", amount: 17 }] },
                { target: "matsuko", band: "graze", effects: [{ type: "binding", target: "matsuko", binding: "latexArms", amount: 4 }] },
                { target: "hinari", band: "miss", effects: [] },
            ],
        }];
        const { host } = mountBattle(1920, 3, state);
        const card = host.querySelector(".kcq-enemy-card")!;
        const rows = [...card.querySelectorAll(".kcq-intent-row")];
        expect(rows).toHaveLength(4);
        expect(rows.map(row => row.querySelector(".kcq-intent-row__target")?.textContent))
            .toEqual(["Ko-chan", "Ko-chan", "Matsuko", "Hinari"]);
        for (const [index, band] of ["hit", "crit", "graze", "miss"].entries()) {
            expect(rows[index]!.querySelector(".kcq-status-chip--outcome-" + band)).not.toBeNull();
        }
        expect(rows[0]!.querySelector(".kcq-intent-row__consequences")?.textContent).toContain("Arms +5 \u00b7 12 damage");
        expect(rows[1]!.textContent).toContain("Legs +17");
        expect(rows[2]!.textContent).toContain("Arms +4");
        expect(rows[3]!.querySelector(".kcq-intent-row__consequences")).toBeNull();
        expect(card.querySelector(".kcq-enemy-card__overflow")).toBeNull();
        card.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        expect(host.querySelector(".kcq-enemy-details")).not.toBeNull();
    });
    it("shows self buffs, healing and summons without accuracy chips when none are provided", () => {
        const state: GameState = structuredClone(fixture.state);
        const enemy = state.enemies[0]!;
        enemy.intentions = [
            {
                move: "skunkPerfume", resolved: false, targets: [{
                    target: enemy.id, band: "none", effects: [
                        { type: "buff", target: enemy.id, operation: "add", buff: { id: "latexMist", severity: 4, modifiers: { hit: 2 } } },
                    ]
                }], effects: []
            },
            {
                move: "healingMagic", resolved: false, targets: [{
                    target: enemy.id, band: "none", effects: [
                        { type: "damage", target: enemy.id, amount: -50 },
                    ]
                }], effects: []
            },
            { move: "callReinforcements", resolved: false, targets: [], effects: [{ type: "enemy", target: "fairy", operation: "spawn" }] },
        ];
        const { host } = mountBattle(1920, 3, state);
        const card = host.querySelector(".kcq-enemy-card")!;
        expect(card.querySelectorAll(".kcq-enemy-card__intent-slot")).toHaveLength(3);
        expect(card.querySelectorAll(".kcq-enemy-card__overflow, .kcq-status-chip")).toHaveLength(0);
        const consequences = [...card.querySelectorAll(".kcq-intent-row__consequences")].map(row => row.textContent);
        expect(consequences[0]).toContain("Latex Mist IV");
        expect(consequences[1]).toContain("Healing +50");
        expect(consequences[2]).toContain("Spawn Fairy");
        expect(card.querySelector(".kcq-intent-row__target")?.textContent).toBe("Skunkette 1");
    });
    it("switches repeatedly without duplicate shortcuts, controls, or engine actions", () => {
        const { host, execute } = mountBattle(AUTO_MEDIUM_BREAKPOINT - 1);
        for (const width of [AUTO_MEDIUM_BREAKPOINT, AUTO_MEDIUM_BREAKPOINT - 1, AUTO_WIDE_BREAKPOINT - 1, AUTO_WIDE_BREAKPOINT, 1920, 1024, 390, AUTO_MEDIUM_BREAKPOINT + 1]) {
            viewport.setViewport({ width });
            expect(host.querySelectorAll(".kcq-battle-overview")).toHaveLength(width >= AUTO_WIDE_BREAKPOINT ? 4 : width >= AUTO_MEDIUM_BREAKPOINT ? 2 : 1);
            const ids = [...host.querySelectorAll("[id]")].map(node => node.id);
            expect(new Set(ids).size).toBe(ids.length);
            const shortcuts = [...host.querySelectorAll<HTMLElement>("[data-kcq-shortcut]")].map(node => node.dataset.kcqShortcut);
            expect(new Set(shortcuts).size).toBe(shortcuts.length);
            const count = execute.mock.calls.length; press(COMBAT_SHORTCUTS.endTurn);
            expect(execute).toHaveBeenCalledTimes(count + 1);
        }
        expect(execute.mock.calls.every(([action]) => action.type === "endTurn")).toBe(true);
    });
    it.each([390, 1024, AUTO_WIDE_BREAKPOINT - 1])("preserves full Game Log navigation below the wide breakpoint at %ipx", width => {
        const { host } = mountBattle(width);
        element(width < AUTO_MEDIUM_BREAKPOINT ? ".kcq-compact-game-log" : ".kcq-game-log-heading-action").click();
        expect(document.querySelector(".kcq-game-log")).not.toBeNull();
        press(COMBAT_SHORTCUTS.back);
        expect(document.querySelector(".kcq-game-log")).toBeNull();
        expect(host.querySelector(".kcq-battle-overview")).not.toBeNull();
    });
    it.each([390, 1024, AUTO_WIDE_BREAKPOINT - 1])("keeps the %ipx battle mounted while presenting full history", async width => {
        const { host, execute } = mountBattle(width);
        const battle = element(width < AUTO_MEDIUM_BREAKPOINT ? ".kcq-battle-overview" : ".kcq-battle-overview-medium");
        const background = element(".kcq-battle-stage__background");
        const trigger = element(width < AUTO_MEDIUM_BREAKPOINT ? ".kcq-compact-game-log" : ".kcq-game-log-heading-action");
        trigger.focus(); trigger.click();
        const panel = element(".kcq-game-log");
        const body = panel.querySelector<HTMLElement>(".kcq-screen-layout__body")!;
        const back = panel.querySelector<HTMLButtonElement>(".kcq-combat-header__back");
        expect(background.hidden).toBe(width < AUTO_MEDIUM_BREAKPOINT);
        expect(background.hasAttribute("inert")).toBe(true);
        expect(background.getAttribute("aria-hidden")).toBe("true");
        expect(battle.isConnected).toBe(true);
        await Promise.resolve();
        expect(document.activeElement).toBe(width < AUTO_MEDIUM_BREAKPOINT ? back : body);
        expect(getComputedStyle(panel).width).toBe("366px");
        expect(body.tabIndex).toBe(0);
        expect(getComputedStyle(body).overflowY).toBe("auto");
        const modal = document.querySelector<HTMLElement>('[role="dialog"]');
        expect(!!modal).toBe(width >= AUTO_MEDIUM_BREAKPOINT);
        if (modal) {
            expect(modal.getAttribute("aria-modal")).toBe("true");
            expect(modal.getAttribute("aria-label")).toBe("Game Log");
            expect(back).toBeNull();
            expect(getComputedStyle(panel.querySelector(".kcq-combat-header")!).gridTemplateColumns).toBe("minmax(0, 1fr) 88px");
            const overlay = getComputedStyle(modal);
            expect(overlay.position).toBe("fixed");
            expect(overlay.inset).toBe("0");
            expect(overlay.display).toBe("grid");
            expect(overlay.placeItems).toBe("safe center");
            expect(Number(overlay.zIndex)).toBeGreaterThan(5);
            expect(host.contains(modal)).toBe(false);
            expect(modal.style.getPropertyValue("--kcq-ui-zoom")).toBe(element(".kcq-app").style.getPropertyValue("--kcq-ui-zoom"));
            expect(getComputedStyle(panel).minWidth).toBe("366px");
            expect(getComputedStyle(panel).maxWidth).toBe("none");
            expect(element(".kcq-game-log-heading-action")).toBe(trigger);
            const tab = (target: HTMLElement, shiftKey = false) => {
                const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true });
                target.dispatchEvent(event); return event;
            };
            const combat = panel.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')!;
            expect(tab(body, true).defaultPrevented).toBe(false);
            combat.focus();
            expect(tab(combat, true).defaultPrevented).toBe(true);
            expect(document.activeElement).toBe(body);
            expect(tab(body).defaultPrevented).toBe(true);
            expect(document.activeElement).toBe(combat);
        }
        for (const key of ["1", COMBAT_SHORTCUTS.endTurn]) press(key);
        expect(execute).not.toHaveBeenCalled();
        body.scrollTop = 120;
        if (back) back.click();
        else press(COMBAT_SHORTCUTS.back);
        await Promise.resolve();
        expect(document.querySelector(".kcq-game-log")).toBeNull();
        expect(background.hidden).toBe(false);
        expect(background.hasAttribute("inert")).toBe(false);
        expect(background.hasAttribute("aria-hidden")).toBe(false);
        expect(element(width < AUTO_MEDIUM_BREAKPOINT ? ".kcq-battle-overview" : ".kcq-battle-overview-medium")).toBe(battle);
        expect(document.activeElement).toBe(width < AUTO_MEDIUM_BREAKPOINT ? element(".kcq-compact-game-log") : trigger);
    });

    it("preserves the open panel, following, scroll position, and focus between narrow and medium", async () => {
        let nextFrame = 0;
        const pending = new Map<number, FrameRequestCallback>();
        const resizes: (() => void)[] = [];
        vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { pending.set(++nextFrame, callback); return nextFrame; });
        vi.stubGlobal("cancelAnimationFrame", (id: number) => pending.delete(id));
        vi.stubGlobal("ResizeObserver", class {
            constructor(callback: () => void) { resizes.push(callback); }
            observe = vi.fn();
            disconnect = vi.fn();
        });
        const flush = () => { for (const [id, callback] of [...pending]) { pending.delete(id); callback(0); } };
        mountBattle(1024);
        element(".kcq-game-log-heading-action").click();
        const panel = element(".kcq-game-log");
        const body = panel.querySelector<HTMLElement>(".kcq-screen-layout__body")!;
        let height = 1000;
        Object.defineProperties(body, {
            scrollHeight: { get: () => height }, clientHeight: { get: () => 200 },
        });
        flush();
        expect(body.scrollTop).toBe(800);
        body.scrollTop = 123;
        body.dispatchEvent(new Event("scroll"));
        body.focus();
        for (const width of [390, AUTO_MEDIUM_BREAKPOINT, AUTO_WIDE_BREAKPOINT - 1, 390, 1024]) {
            viewport.setViewport({ width });
            window.dispatchEvent(new Event("resize"));
            height += 100;
            resizes.forEach(callback => callback());
            flush();
            await Promise.resolve();
            expect(element(".kcq-game-log")).toBe(panel);
            expect(getComputedStyle(panel).width).toBe("366px");
            expect(!!panel.querySelector(".kcq-combat-header__back")).toBe(width < AUTO_MEDIUM_BREAKPOINT);
            expect(body.scrollTop).toBe(123);
            expect(document.activeElement).toBe(body);
            expect(!!document.querySelector('[role="dialog"]')).toBe(width >= AUTO_MEDIUM_BREAKPOINT);
            expect(element(".kcq-battle-stage__background").hidden).toBe(width < AUTO_MEDIUM_BREAKPOINT);
        }
        body.scrollTop = height - 200;
        body.dispatchEvent(new Event("scroll"));
        height += 100;
        resizes.forEach(callback => callback());
        flush();
        expect(body.scrollTop).toBe(height - 200);
        press(COMBAT_SHORTCUTS.back);
        expect(document.querySelector(".kcq-game-log")).toBeNull();
        flush(); // Unmount cancels the panel's pending follow work.
    });

    it("dismisses the medium modal with the backdrop and log shortcut", async () => {
        mountBattle(1024);
        const trigger = element(".kcq-game-log-heading-action");
        trigger.focus(); trigger.click();
        element(".kcq-battle-log--modal").click();
        await Promise.resolve();
        expect(document.activeElement).toBe(trigger);
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        press(COMBAT_SHORTCUTS.gameLog);
        expect(document.querySelector('[role="dialog"]')).not.toBeNull();
        press(COMBAT_SHORTCUTS.gameLog);
        await Promise.resolve();
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(document.activeElement).toBe(trigger);
    });

    it.each([AUTO_WIDE_BREAKPOINT, 1920])("keeps wide history inline with its scroll state at %ipx", async width => {
        const { host, execute } = mountBattle(width, 0);
        const history = element(".kcq-overview-game-log-history");
        const battle = element(".kcq-battle-overview-wide");
        history.scrollTop = 43;
        history.dispatchEvent(new Event("scroll"));
        const trigger = element(".kcq-combat-header__settings");
        trigger.focus();
        press(COMBAT_SHORTCUTS.gameLog);
        await Promise.resolve();
        expect(host.querySelector(".kcq-game-log, .kcq-battle-log, [role=dialog]")).toBeNull();
        expect(element(".kcq-overview-game-log-history")).toBe(history);
        expect(history.scrollTop).toBe(43);
        expect(document.activeElement).toBe(history);
        expect(battle.closest("[hidden], [inert], [aria-hidden=true]")).toBeNull();
        expect(getComputedStyle(battle).gridTemplateColumns).toBe("366px 366px 366px");
        press(COMBAT_SHORTCUTS.endTurn);
        expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "endTurn" });
        press(COMBAT_SHORTCUTS.back);
        await Promise.resolve();
        expect(document.activeElement).toBe(trigger);
        expect(element(".kcq-overview-game-log-history")).toBe(history);
    });

    it.each(["2", "3"])("uses forced %s presentation on a narrow physical viewport", async columns => {
        window.localStorage.setItem("kcq.battleColumns", columns);
        mountBattle(390);
        press(COMBAT_SHORTCUTS.gameLog);
        await Promise.resolve();
        expect(!!document.querySelector(".kcq-battle-log--modal")).toBe(columns === "2");
        expect(!!document.querySelector(".kcq-game-log")).toBe(columns === "2");
        expect(!!document.querySelector(".kcq-overview-game-log-history")).toBe(columns === "3");
    });

    it.each([390, 1024, 1920])("returns from history to the completed result at %ipx", async width => {
        const state: GameState = structuredClone(fixture.state);
        state.turn.outcome = "defeat";
        mountBattle(width, 0, state);
        document.querySelector<HTMLButtonElement>(".kcq-victory-story__continue")?.click();
        const resultText = element(".kcq-battle-result-panel").textContent;
        for (const dismiss of width >= AUTO_MEDIUM_BREAKPOINT ? ["back", "backdrop", "shortcut"] : ["back", "button"]) {
            element(".kcq-battle-result__log").click();
            await Promise.resolve();
            expect(document.querySelector(".kcq-battle-result-panel")).toBeNull();
            expect(document.querySelector(".kcq-game-log")).not.toBeNull();
            expect(!!document.querySelector(".kcq-battle-log--modal")).toBe(width >= AUTO_MEDIUM_BREAKPOINT);
            expect(element(".kcq-battle-stage__background").hasAttribute("inert")).toBe(true);
            if (width >= AUTO_MEDIUM_BREAKPOINT) {
                const modal = element(".kcq-battle-log--modal");
                expect(modal.getAttribute("role")).toBe("dialog");
                expect(modal.getAttribute("aria-modal")).toBe("true");
                const body = element(".kcq-game-log .kcq-screen-layout__body");
                expect(document.activeElement).toBe(body);
                const combat = modal.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')!;
                const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
                body.dispatchEvent(tab);
                expect(tab.defaultPrevented).toBe(true);
                expect(document.activeElement).toBe(combat);
                const backTab = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
                combat.dispatchEvent(backTab);
                expect(backTab.defaultPrevented).toBe(true);
                expect(document.activeElement).toBe(body);
            }
            if (dismiss === "backdrop") element(".kcq-battle-log--modal").click();
            else if (dismiss === "button") element(".kcq-game-log .kcq-combat-header__back").click();
            else press(dismiss === "shortcut" ? COMBAT_SHORTCUTS.gameLog : COMBAT_SHORTCUTS.back);
            await Promise.resolve();
            expect(document.querySelector(".kcq-game-log")).toBeNull();
            expect(element(".kcq-battle-result-panel").textContent).toBe(resultText);
            expect(document.activeElement).toBe(element(".kcq-battle-result__log"));
        }
    });

    it("retains character, enemy, and log navigation after resizing, including zero log lines", () => {
        const { host } = mountBattle(1920, 0);
        element(".kcq-party-card").click(); expect(host.querySelector(".kcq-character-details")).not.toBeNull();
        press(COMBAT_SHORTCUTS.back); press("4"); expect(host.querySelector(".kcq-enemy-details")).not.toBeNull();
        press(COMBAT_SHORTCUTS.back); expect(host.querySelector(".kcq-compact-game-log")).toBeNull();
        press(COMBAT_SHORTCUTS.gameLog); expect(document.querySelector(".kcq-game-log")).toBeNull();
        expect(host.querySelector(".kcq-overview-game-log-history")).not.toBeNull();
        expect(getComputedStyle(host).width).toBe(`${LAYOUT_WIDTHS[3]}px`);
        press(COMBAT_SHORTCUTS.back); viewport.setViewport({ width: 390 });
        press("1"); expect(host.querySelector(".kcq-character-details")).not.toBeNull();
        press(COMBAT_SHORTCUTS.back); viewport.setViewport({ width: 1920 });
        element(".kcq-enemy-card").click(); expect(host.querySelector(".kcq-enemy-details")).not.toBeNull();
        press(COMBAT_SHORTCUTS.back); press(COMBAT_SHORTCUTS.gameLog);
        expect(document.querySelector(".kcq-game-log")).toBeNull();
        expect(host.querySelector(".kcq-overview-game-log-history")).not.toBeNull();
    });
});

it.each([390, 1024, 1920])("provides Story in the full log at %ipx while retaining the mechanical overview", async width => {
    const { execute } = mountBattle(width);
    const history = width >= AUTO_WIDE_BREAKPOINT ? element('.kcq-overview-game-log-history') : undefined;
    const trigger = element(width >= AUTO_WIDE_BREAKPOINT ? '.kcq-game-log-heading-action--full'
        : width >= AUTO_MEDIUM_BREAKPOINT ? '.kcq-game-log-heading-action' : '.kcq-compact-game-log');
    trigger.focus(); trigger.click();
    await Promise.resolve();
    const panel = element('.kcq-game-log');
    expect(panel.querySelectorAll('[role="tab"]')).toHaveLength(2);
    const tabs = [...panel.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    tabs[1]!.click();
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('true');
    expect(!!document.querySelector('.kcq-battle-log--modal')).toBe(width >= AUTO_MEDIUM_BREAKPOINT);
    if (history) {
        expect(element('.kcq-overview-game-log-history')).toBe(history);
        expect(history.querySelector('.kcq-game-log__story-text')).toBeNull();
    }
    press(COMBAT_SHORTCUTS.endTurn);
    expect(execute).not.toHaveBeenCalled();
    press(COMBAT_SHORTCUTS.back);
    await Promise.resolve();
    expect(document.querySelector('.kcq-game-log')).toBeNull();
    expect(document.activeElement).toBe(trigger.isConnected ? trigger : element('.kcq-compact-game-log'));
});
