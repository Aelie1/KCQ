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
import { createViewPreferences, DEFAULT_MANUAL_ZOOM, ViewPreferencesContext, type BattleColumns, type EnemyCards } from "../../src/ui/web/app/viewPreferences";

const viewport = (window as unknown as HappyWindow).happyDOM;
const initialViewport = { width: window.innerWidth, height: window.innerHeight };
let unmount: (() => void) | undefined;
beforeEach(() => { window.localStorage.clear(); viewport.setViewport({ width: 1920, height: 1080 }); });
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
            preferences.setManualZoom(200); preferences.setAutoZoom(false);
            for (const width of [390, 1200, 1920]) {
                viewport.setViewport({ width });
                const count = columns === "auto" ? width >= 1800 ? 3 : width >= 1200 ? 2 : 1 : Number(columns);
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
                expect(element(".kcq-app").style.getPropertyValue("--kcq-ui-zoom")).toBe("2");
                expect(getComputedStyle(element(".kcq-app")).overflowX).toBe("auto");
                if (count > 1 && columns !== "auto") expect(getComputedStyle(element(".kcq-graphical-app__background")).minWidth).toBe(count === 2 ? "756px" : "1068px");
                const grid = getComputedStyle(element(".kcq-battle-overview__enemies")).gridTemplateColumns;
                expect(grid).toBe(expanded ? "minmax(0, 1fr)" : count === 1 ? "repeat(2, 180px)" : "repeat(auto-fit, 180px)");
            }
            expect(execute).not.toHaveBeenCalled(); expect(engine.getGameState()).toEqual(before);
        },
    );
    it("updates the shell and open portal at manual zoom extremes and restores the stored value", () => {
        const { preferences } = mount();
        element(".kcq-combat-header__settings").click();
        const shell = element(".kcq-app"), overlay = element(".kcq-battle-settings__overlay");
        const slider = element<HTMLInputElement>(".kcq-battle-settings__zoom input");
        const auto = element<HTMLInputElement>(".kcq-battle-settings__auto-zoom input");
        expect(slider.disabled).toBe(true); expect(slider.value).toBe(String(DEFAULT_MANUAL_ZOOM));
        expect(shell.style.getPropertyValue("--kcq-ui-zoom")).toBe("1");
        auto.click(); expect(slider.disabled).toBe(false);
        for (const zoom of [75, 200, 135]) {
            slider.value = String(zoom); slider.dispatchEvent(new Event("input", { bubbles: true }));
            for (const surface of [shell, overlay]) {
                expect(surface.style.getPropertyValue("--kcq-ui-zoom")).toBe(String(zoom / 100));
                expect(parseFloat(surface.style.getPropertyValue("--kcq-ui-height"))).toBeCloseTo((1080 - 24) / (zoom / 100));
            }
            expect(element(".kcq-battle-settings__zoom output").textContent).toBe(`${zoom}%`);
            viewport.setViewport({ height: 480 });
            for (const surface of [shell, overlay]) expect(parseFloat(surface.style.getPropertyValue("--kcq-ui-height"))).toBeCloseTo(456 / (zoom / 100));
            viewport.setViewport({ height: 1080 });
        }
        auto.click(); expect(slider.disabled).toBe(true);
        expect(preferences.manualZoom).toBe(135); expect(shell.style.getPropertyValue("--kcq-ui-zoom")).toBe("1");
        auto.click(); expect(shell.style.getPropertyValue("--kcq-ui-zoom")).toBe("1.35");
        const restored = createViewPreferences(); expect(restored.autoZoom).toBe(false); expect(restored.manualZoom).toBe(135);
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
            preferences.setEnemyCards("compact"); preferences.setAutoZoom(false); preferences.setManualZoom(75);
            expect(element(selected).textContent).toBe(selection);
            expect(document.querySelectorAll(".kcq-combat-header")).toHaveLength(1);
        }
        expect(execute).not.toHaveBeenCalled(); expect(engine.getGameState()).toEqual(before);
    });
    it("validates persisted values and retains changes when storage is unavailable", () => {
        for (const [key, value] of Object.entries({ battleColumns: "4", autoZoom: "no", manualZoom: "202", enemyCards: "huge" })) {
            window.localStorage.setItem(`kcq.${key}`, value);
        }
        const defaults = createViewPreferences();
        expect([defaults.columns, defaults.autoZoom, defaults.manualZoom, defaults.enemyCards]).toEqual(["auto", true, 100, "auto"]);
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("unavailable"); });
        defaults.setColumns("3"); defaults.setAutoZoom(false); defaults.setManualZoom(75); defaults.setEnemyCards("expanded");
        expect([defaults.columns, defaults.autoZoom, defaults.manualZoom, defaults.enemyCards]).toEqual(["3", false, 75, "expanded"]);
        defaults.setManualZoom(151); defaults.setManualZoom(50); defaults.setManualZoom(NaN);
        expect(defaults.manualZoom).toBe(75);
        defaults.reset(); expect(defaults.manualZoom).toBe(DEFAULT_MANUAL_ZOOM);
    });
});

it("restores all view preferences across remounts, including manual zoom stored while Auto is on", () => {
    const { preferences } = mount();
    preferences.setColumns("3"); preferences.setEnemyCards("compact"); preferences.setManualZoom(145);
    expect(preferences.autoZoom).toBe(true);
    unmount?.(); unmount = undefined; document.body.replaceChildren();
    viewport.setViewport({ width: 390 });
    const { preferences: reloaded } = mount();
    assertColumns(3);
    expect(reloaded.enemyCards).toBe("compact"); expect(reloaded.autoZoom).toBe(true); expect(reloaded.manualZoom).toBe(145);
    reloaded.setAutoZoom(false);
    expect(element(".kcq-app").style.getPropertyValue("--kcq-ui-zoom")).toBe("1.45");
    expect(element(".kcq-app").style.getPropertyValue("--kcq-ui-min-width")).toBe("366px");
    element(".kcq-combat-header__settings").click();
    expect(element<HTMLSelectElement>(".kcq-battle-settings__columns select").value).toBe("3");
    expect(element<HTMLSelectElement>(".kcq-battle-settings__enemy-cards select").value).toBe("compact");
    expect(element<HTMLInputElement>(".kcq-battle-settings__zoom input").value).toBe("145");
    expect(getComputedStyle(element(".kcq-battle-settings__overlay")).overflow).toBe("auto");
});
