import { readFileSync } from "node:fs";
import type { Window as HappyWindow } from "happy-dom";
import { createComponent } from "solid-js";
import { insert, render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStockEngine } from "../../src/stock";
import { BattleApp } from "../../src/ui/web/app/BattleApp";
import { App } from "../../src/ui/web/app/App";
import { battleOverviewFixture } from "../../src/ui/web/app/fixtures/battleOverview";
import { targetingFixtures } from "../../src/ui/web/app/fixtures/targeting";
import { LAYOUT_WIDTHS, calculateResponsiveLayout } from "../../src/ui/web/app/responsiveScale";
import { createViewPreferences, ViewPreferencesContext, type BattleColumns, type EnemyCards } from "../../src/ui/web/app/viewPreferences";

const viewport = (window as unknown as HappyWindow).happyDOM;
const initialViewport = { width: window.innerWidth, height: window.innerHeight };
let unmount: (() => void) | undefined;
beforeEach(() => {
    window.localStorage.clear(); viewport.setViewport({ width: 1920, height: 1080 });
    // Happy DOM does not lay out elements; model the unzoomed viewport surfaces.
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
        return this.matches(".kcq-app, .kcq-battle-result__overlay") ? window.innerWidth : 0;
    });
});
afterEach(() => {
    unmount?.(); unmount = undefined; document.body.replaceChildren();
    viewport.setViewport(initialViewport); window.localStorage.clear(); vi.restoreAllMocks();
});
function element<T extends HTMLElement = HTMLElement>(selector: string): T {
    const found = document.querySelector<T>(selector);
    if (!found) throw new Error("Missing " + selector);
    return found;
}
function mount(workspace = false) {
    const preferences = createViewPreferences();
    const engine = createStockEngine(12345);
    const fixture = workspace ? targetingFixtures.telekinesisChoose : battleOverviewFixture;
    const state = structuredClone(fixture.state); state.turn.phase = "player";
    const actions = workspace ? targetingFixtures.telekinesisChoose.actions.map(actor => ({ ...actor,
        moves: actor.moves.map(action => ({ ...action, move: { ...action.move, targets: 2 as const } })),
        escapes: actor.escapes.map(escape => ({ ...escape, available: true })),
    })) : fixture.actions;
    vi.spyOn(engine, "getGameState").mockReturnValue(state);
    vi.spyOn(engine, "getActionView").mockReturnValue(actions);
    const execute = vi.spyOn(engine, "executeAction");
    const style = document.createElement("style"); style.textContent = readFileSync("src/ui/web/app/app.css", "utf8");
    const host = document.createElement("div"); document.body.append(style, host);
    unmount = render(() => createComponent(ViewPreferencesContext.Provider, { value: preferences,
        get children() { return createComponent(App, { get children() {
            const background = document.createElement("div"); background.className = "kcq-graphical-app__background";
            insert(background, createComponent(BattleApp, { engine, presentation: fixture.presentation, viewPreferences: preferences }));
            return background;
        } }); },
    }), host);
    window.dispatchEvent(new Event("resize"));
    return { preferences, state, engine, execute };
}
function assertColumns(columns: number) {
    expect(!!document.querySelector(".kcq-battle-overview-wide, .kcq-character-details-wide")).toBe(columns === 3);
    expect(!!document.querySelector(".kcq-battle-overview-columns")).toBe(columns === 2);
    expect(document.querySelectorAll(".kcq-combat-header")).toHaveLength(1);
}

describe("battle view preferences", () => {
    it.each((["auto", "1", "2", "3"] as BattleColumns[]).flatMap(columns =>
        (["auto", "compact", "expanded"] as EnemyCards[]).map(cards => ({ columns, cards }))))(
        "keeps $cards cards independent of $columns columns and zoom through resizing", ({ columns, cards }) => {
            const { preferences, execute, engine } = mount();
            const before = engine.getGameState();
            preferences.setColumns(columns); preferences.setEnemyCards(cards);
            for (const width of [320, 390, 779, 780, 1000, 1169, 1170, 1280, 1920, 779, 780]) {
                viewport.setViewport({ width });
                const count = calculateResponsiveLayout(width - 24, columns).columns;
                assertColumns(count);
                const expanded = cards === "auto" ? count > 1 : cards === "expanded";
                const enemies = [...document.querySelectorAll(".kcq-enemy-card")];
                expect(enemies).toHaveLength(battleOverviewFixture.state.enemies.length);
                for (const enemy of enemies) {
                    expect(enemy.classList.contains("kcq-enemy-card--expanded")).toBe(expanded);
                    expect(!!enemy.querySelector(".kcq-enemy-card__hp-meter")).toBe(expanded);
                    expect(getComputedStyle(enemy).width).toBe(expanded ? "100%" : "180px");
                }
                const expectedIntentions = battleOverviewFixture.state.enemies.reduce((sum, enemy) =>
                    sum + (expanded ? enemy.intentions.length : Math.min(2, enemy.intentions.length)), 0);
                expect(document.querySelectorAll(".kcq-enemy-card__intent-slot")).toHaveLength(expectedIntentions);
                const expectedZoom = Math.max(1, Math.min(1.5, (width - 24) / LAYOUT_WIDTHS[count]));
                expect(Number(element(".kcq-app").style.getPropertyValue("--kcq-ui-zoom"))).toBeCloseTo(expectedZoom);
                expect(getComputedStyle(element(".kcq-app")).overflowX).toBe("auto");
                expect(getComputedStyle(element(".kcq-graphical-app__background")).minWidth).toBe(`${LAYOUT_WIDTHS[count]}px`);
                const grid = getComputedStyle(element(".kcq-battle-overview__enemies")).gridTemplateColumns;
                expect(grid).toBe(expanded ? "minmax(0, 1fr)" : count === 1 ? "repeat(2, 180px)" : "repeat(auto-fit, 180px)");
            }
            expect(execute).not.toHaveBeenCalled(); expect(engine.getGameState()).toEqual(before);
        },
    );
    it("updates the shell and open Settings together when columns or viewport change", () => {
        const { preferences } = mount();
        element(".kcq-combat-header__settings").click();
        const shell = element(".kcq-app"), overlay = element(".kcq-battle-settings__overlay");
        expect(document.querySelector('[aria-label="Zoom"], .kcq-battle-settings__zoom-row')).toBeNull();
        const columns = element<HTMLSelectElement>(".kcq-battle-settings__columns select");
        for (const width of [390, 1000, 1280, 1920]) {
            viewport.setViewport({ width });
            for (const selection of ["1", "2", "3", "auto"] as const) {
                columns.value = selection; columns.dispatchEvent(new Event("change", { bubbles: true }));
                expect(preferences.columns).toBe(selection);
                const count = calculateResponsiveLayout(width - 24, selection).columns;
                assertColumns(count);
                const zoom = Math.max(1, Math.min(1.5, (width - 24) / LAYOUT_WIDTHS[count]));
                for (const surface of [shell, overlay]) {
                    expect(Number(surface.style.getPropertyValue("--kcq-ui-zoom"))).toBeCloseTo(zoom);
                    expect(parseFloat(surface.style.getPropertyValue("--kcq-ui-height"))).toBeCloseTo((1080 - 24) / zoom);
                }
                viewport.setViewport({ height: 480 });
                for (const surface of [shell, overlay]) expect(parseFloat(surface.style.getPropertyValue("--kcq-ui-height"))).toBeCloseTo(456 / zoom);
                viewport.setViewport({ height: 1080 });
            }
        }
    });
    it("shares the shell's unzoomed available width with the battle and Settings portal", () => {
        mount();
        const shell = element(".kcq-app");
        let shellWidth = 1000;
        Object.defineProperty(shell, "clientWidth", { get: () => shellWidth });
        window.dispatchEvent(new Event("resize"));
        assertColumns(2);
        expect(Number(shell.style.getPropertyValue("--kcq-ui-zoom"))).toBeCloseTo(976 / 756);
        element(".kcq-combat-header__settings").click();
        const overlay = element(".kcq-battle-settings__overlay");
        for (const width of [780, 1170, 1280, 1169, 779, 1280]) {
            shellWidth = width;
            window.dispatchEvent(new Event("resize"));
            assertColumns(width >= 1170 ? 3 : width >= 780 ? 2 : 1);
            expect(overlay.style.getPropertyValue("--kcq-ui-zoom")).toBe(shell.style.getPropertyValue("--kcq-ui-zoom"));
        }
        expect(Number(shell.style.getPropertyValue("--kcq-ui-zoom"))).toBeCloseTo((1280 - 24) / LAYOUT_WIDTHS[3]);
    });
    it.each(["targeting", "escape", "enemy", "character"] as const)("preserves the %s screen and its choices while changing columns", screen => {
        const { preferences, execute, engine } = mount(true);
        const before = engine.getGameState();
        if (screen === "enemy") element(".kcq-enemy-card").click();
        else {
            element(".kcq-party-card").click();
            if (screen === "targeting") {
                element('.kcq-command-card[data-kcq-shortcut="1"]').click();
                element("button.kcq-target-card").click();
            } else if (screen === "escape") {
                element('.kcq-command-card[data-kcq-shortcut="0"]').click();
                element('.kcq-escape-choice[data-kcq-shortcut="1"]').click();
            }
        }
        const selected = screen === "targeting" ? 'button.kcq-target-card[aria-pressed="true"]'
            : screen === "escape" ? '.kcq-escape-choice[aria-pressed="true"]'
            : screen === "enemy" ? '.kcq-enemy-details__identity .kcq-target-header' : '.kcq-character-roster__card[aria-pressed="true"]';
        const selection = element(selected).textContent;
        for (const columns of ["2", "1", "3", "auto", "1", "2", "3"] as const) {
            preferences.setColumns(columns);
            preferences.setEnemyCards("compact");
            expect(element(selected).textContent).toBe(selection);
            expect(document.querySelectorAll(".kcq-combat-header")).toHaveLength(1);
        }
        expect(execute).not.toHaveBeenCalled(); expect(engine.getGameState()).toEqual(before);
    });
    it("validates persisted values and retains changes when storage is unavailable", () => {
        window.localStorage.setItem("kcq.battleColumns", "4");
        window.localStorage.setItem("kcq.enemyCards", "huge");
        const defaults = createViewPreferences();
        expect([defaults.columns, defaults.enemyCards]).toEqual(["auto", "auto"]);
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("unavailable"); });
        defaults.setColumns("3"); defaults.setEnemyCards("expanded");
        expect([defaults.columns, defaults.enemyCards]).toEqual(["3", "expanded"]);
        defaults.reset(); expect([defaults.columns, defaults.enemyCards]).toEqual(["auto", "auto"]);
    });
});

it("restores columns and enemy cards across remounts and ignores obsolete zoom settings", () => {
    window.localStorage.setItem("kcq.autoZoom", "false");
    window.localStorage.setItem("kcq.manualZoom", "75");
    const { preferences } = mount();
    preferences.setColumns("3"); preferences.setEnemyCards("compact");
    unmount?.(); unmount = undefined; document.body.replaceChildren();
    viewport.setViewport({ width: 390 });
    const { preferences: reloaded } = mount();
    assertColumns(3);
    expect(reloaded.enemyCards).toBe("compact");
    expect(element(".kcq-app").style.getPropertyValue("--kcq-ui-zoom")).toBe("1");
    expect(element(".kcq-app").style.getPropertyValue("--kcq-ui-min-width")).toBe("366px");
    element(".kcq-combat-header__settings").click();
    expect(element<HTMLSelectElement>(".kcq-battle-settings__columns select").value).toBe("3");
    expect(element<HTMLSelectElement>(".kcq-battle-settings__enemy-cards select").value).toBe("compact");
    expect(document.querySelector('[aria-label="Zoom"], .kcq-battle-settings__zoom-row')).toBeNull();
    expect(getComputedStyle(element(".kcq-battle-settings__overlay")).overflow).toBe("auto");
    // Column changes and Reset never write the retired preferences.
    reloaded.reset();
    expect(window.localStorage.getItem("kcq.autoZoom")).toBe("false");
    expect(window.localStorage.getItem("kcq.manualZoom")).toBe("75");
    expect([createViewPreferences().columns, createViewPreferences().enemyCards]).toEqual(["auto", "auto"]);
});
