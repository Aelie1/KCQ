import { readFileSync } from "node:fs";
import type { Window as HappyWindow } from "happy-dom";
import { createComponent, createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "../../src/engine/public/types";
import { createStockEngine } from "../../src/stock";
import { BattleApp, WIDE_BATTLE_OVERVIEW_BREAKPOINT } from "../../src/ui/web/app/BattleApp";
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
function mountBattle(width = 1920, lines = 3, initialState: GameState = fixture.state) {
    viewport.setViewport({ width, height: 1080 });
    const engine = createStockEngine(12345);
    const state: GameState = structuredClone(initialState); state.turn.phase = "player";
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
    it.each([390, 1799, 1920])("keeps temporary and permanent status indicators inline only at wide width (%ipx)", width => {
        const state: GameState = structuredClone(fixture.state);
        state.enemies = [{ ...state.enemies[0]!, id: "queen", buffs: [
            { id: "starlightBindings", duration: 3, icon: "shield-off", modifiers: { defense: -2 } },
            { id: "subspaceClutter", duration: 2, icon: "sword", modifiers: { hit: -2 } },
            { id: "difficulty", icon: "crown", modifiers: { hit: 2 } },
        ] }];
        const { host } = mountBattle(width, 3, state);
        const card = host.querySelector(".kcq-enemy-card")!;
        const header = card.querySelector(".kcq-enemy-card__header")!;
        const name = header.querySelector(".kcq-enemy-card__name")!;
        const statuses = header.querySelector(".kcq-enemy-card__debuffs")!;
        const temporary = statuses.querySelector(".kcq-enemy-card__temporary-effects")!;
        const permanent = statuses.querySelector(".kcq-enemy-card__permanent-effects")!;
        const wide = width >= WIDE_BATTLE_OVERVIEW_BREAKPOINT;
        expect(card.querySelectorAll(".kcq-enemy-card__debuffs")).toHaveLength(1);
        expect(name.nextElementSibling).toBe(statuses);
        expect([...statuses.children]).toEqual([temporary, permanent]);
        expect(temporary.querySelectorAll('[data-icon="shield-off"]')).toHaveLength(3);
        expect(temporary.querySelectorAll('[data-icon="sword"]')).toHaveLength(2);
        expect(permanent.querySelector('[data-icon="crown"]')).not.toBeNull();
        expect(permanent.textContent).toBe("+2");
        for (const indicator of statuses.querySelectorAll('[role="img"]')) {
            expect(indicator.getAttribute("aria-label")).toBeTruthy();
            expect(indicator.getAttribute("title")).toBe(indicator.getAttribute("aria-label"));
        }
        expect(getComputedStyle(statuses).position).toBe(wide ? "static" : "absolute");
        expect(getComputedStyle(statuses).flexWrap).toBe(wide ? "nowrap" : "wrap");
        expect(getComputedStyle(permanent).flexWrap).toBe(wide ? "nowrap" : "wrap");
        expect(getComputedStyle(header.querySelector(".kcq-enemy-card__hp")!).whiteSpace).toBe("nowrap");
        if (wide) {
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
    it.each([390, 1799, 1920])("adds the HP meter and moves linked icons left only in wide mode at %ipx", width => {
        const state: GameState = structuredClone(fixture.state);
        const enemy = state.enemies[0]!;
        enemy.currHp = 50; enemy.maxHp = 200;
        enemy.buffs = [{ id: "pounce", linkedEntity: "ko" }, { id: "pounce", linkedEntity: "matsuko" }];
        const { host } = mountBattle(width, 3, state);
        const header = host.querySelector(".kcq-enemy-card__header")!;
        const links = [...header.querySelectorAll(".kcq-linked-entity-chip")];
        const wide = width >= WIDE_BATTLE_OVERVIEW_BREAKPOINT;
        expect(links).toHaveLength(2);
        for (const link of links) expect(getComputedStyle(link).order === "-1").toBe(wide);
        const meter = header.querySelector<HTMLElement>(".kcq-enemy-card__hp-meter");
        expect(!!meter).toBe(wide);
        if (meter) {
            expect(meter.querySelector<HTMLElement>("span")!.style.width).toBe("25%");
            expect(meter.nextElementSibling?.querySelector(".kcq-enemy-card__hp")?.textContent).toBe("50 / 200");
            expect(getComputedStyle(meter).maxWidth).toBe("90px");
        }
    });
    it.each([390, 1199, 1200, 1799, 1800, 1920, 2560])("mounts only the active arrangement at %ipx", width => {
        const { host } = mountBattle(width); const desktop = width >= 1200;
        const wide = width >= WIDE_BATTLE_OVERVIEW_BREAKPOINT;
        const panels = [...host.querySelectorAll(".kcq-battle-overview")];
        expect(panels).toHaveLength(wide ? 4 : desktop ? 2 : 1);
        expect(host.querySelectorAll(".kcq-party-card")).toHaveLength(fixture.state.characters.length);
        expect(host.querySelectorAll(".kcq-enemy-card")).toHaveLength(fixture.state.enemies.length);
        expect(host.querySelectorAll(".kcq-battle-overview__primary-action")).toHaveLength(1);
        expect(host.querySelectorAll(".kcq-combat-header")).toHaveLength(1);
        expect(host.querySelectorAll(".kcq-battle-overview__footer")).toHaveLength(desktop ? 0 : 1);
        if (wide) {
            expect(panels[0]!.querySelector(".kcq-combat-header")).not.toBeNull();
            expect(panels[0]!.querySelector(".kcq-screen-layout__body")).toBeNull();
            expect(getComputedStyle(panels[0]!).gridColumn).toBe("1 / -1");
            expect(getComputedStyle(host).width).toBe("100%");
            expect(getComputedStyle(element(".kcq-battle-overview-wide")).gridTemplateColumns)
                .toBe("366px 366px 288px");
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
            expect(getComputedStyle(panels[2]!.querySelector(".kcq-screen-layout__body")!).overflowY).toBe("auto");
        } else if (desktop) {
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
    it("shows every intention only in wide mode and restores existing summaries after resizing", () => {
        const { host } = mountBattle(1199);
        const fullCount = fixture.state.enemies.reduce((count, enemy) => count + enemy.intentions.length, 0);
        const summaryCount = fixture.state.enemies.reduce((count, enemy) => count + Math.min(2, enemy.intentions.length), 0);
        for (const width of [1920, 1799, 390, 1800]) {
            viewport.setViewport({ width });
            const wide = width >= WIDE_BATTLE_OVERVIEW_BREAKPOINT;
            expect(host.querySelectorAll(".kcq-enemy-card__intent-slot"), String(width)).toHaveLength(wide ? fullCount : summaryCount);
            expect(host.querySelectorAll(".kcq-enemy-card__overflow")).toHaveLength(wide ? 0 : 1);
            expect(host.querySelectorAll(".kcq-intent-row--expanded").length > 0).toBe(wide);
            const cardStyle = getComputedStyle(element(".kcq-enemy-card"));
            expect(cardStyle.width).toBe(wide ? "100%" : "180px");
            expect(cardStyle.height).toBe("auto");
            expect(getComputedStyle(element(".kcq-battle-overview__enemies")).gridTemplateColumns)
                .toBe(wide ? "minmax(0, 1fr)" : "repeat(2, 180px)");
            if (wide) {
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
                { target: "ko", band: "hit", effects: [
                    { type: "binding", target: "ko", binding: "latexArms", amount: 34 },
                    { type: "damage", target: "ko", amount: 12 },
                ] },
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
        expect(rows[0]!.querySelector(".kcq-intent-row__consequences")?.textContent).toContain("Arms +4 \u00b7 12 damage");
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
            { move: "skunkPerfume", resolved: false, targets: [{ target: enemy.id, band: "none", effects: [
                { type: "buff", target: enemy.id, operation: "add", buff: { id: "latexMist", severity: 4, modifiers: { hit: 2 } } },
            ] }], effects: [] },
            { move: "healingMagic", resolved: false, targets: [{ target: enemy.id, band: "none", effects: [
                { type: "damage", target: enemy.id, amount: -50 },
            ] }], effects: [] },
            { move: "callReinforcements", resolved: false, targets: [], effects: [{ type: "enemy", target: "fairy", operation: "spawn" }] },
        ];
        const { host } = mountBattle(1920, 3, state);
        const card = host.querySelector(".kcq-enemy-card")!;
        expect(card.querySelectorAll(".kcq-enemy-card__intent-slot")).toHaveLength(3);
        expect(card.querySelectorAll(".kcq-enemy-card__overflow, .kcq-status-chip")).toHaveLength(0);
        const consequences = [...card.querySelectorAll(".kcq-intent-row__consequences")].map(row => row.textContent);
        expect(consequences[0]).toContain("Latex Mist IV");
        expect(consequences[0]).toContain("Accuracy +2");
        expect(consequences[1]).toContain("Healing +50");
        expect(consequences[2]).toContain("Spawn Fairy");
        expect(card.querySelector(".kcq-intent-row__target")?.textContent).toBe("Skunkette 1");
    });
    it("switches repeatedly without duplicate shortcuts, controls, or engine actions", () => {
        const { host, execute } = mountBattle(1199);
        for (const width of [1200, 1199, 1799, 1800, 1920, 1799, 390, 1200]) {
            viewport.setViewport({ width });
            expect(host.querySelectorAll(".kcq-battle-overview")).toHaveLength(width >= WIDE_BATTLE_OVERVIEW_BREAKPOINT ? 4 : width >= 1200 ? 2 : 1);
            const ids = [...host.querySelectorAll("[id]")].map(node => node.id);
            expect(new Set(ids).size).toBe(ids.length);
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
