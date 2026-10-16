import { readFileSync } from "node:fs";
import type { Window as HappyWindow } from "happy-dom";
import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionInfo, GameState } from "../../src/engine/public/types";
import { createStockEngine } from "../../src/stock";
import { createBattle } from "../../src/ui/web/app";
import { BattleApp, WIDE_BATTLE_OVERVIEW_BREAKPOINT } from "../../src/ui/web/app/BattleApp";
import { battleOverviewFixture } from "../../src/ui/web/app/fixtures/battleOverview";
import { targetingFixtures } from "../../src/ui/web/app/fixtures/targeting";
import { COMBAT_SHORTCUTS } from "../../src/ui/web/app/keyboard";

const fixture = targetingFixtures.telekinesisChoose;
const viewport = (window as unknown as HappyWindow).happyDOM;
const initialViewport = { width: window.innerWidth, height: window.innerHeight };
let unmount: (() => void) | undefined;
beforeEach(() => {
    viewport.setViewport({ width: 1920, height: 1080 });
    window.localStorage.clear();
    window.localStorage.setItem("kcq.playbackSpeed", "instant");
});
afterEach(() => {
    unmount?.(); unmount = undefined;
    document.body.replaceChildren(); viewport.setViewport(initialViewport);
    window.localStorage.clear(); vi.restoreAllMocks();
});
function mount(engine: ReturnType<typeof createStockEngine>) {
    const style = document.createElement("style");
    style.textContent = readFileSync("src/ui/web/app/app.css", "utf8");
    const host = document.createElement("div"); host.className = "kcq-graphical-app__background";
    document.body.append(style, host);
    unmount = render(() => createComponent(BattleApp, {
        engine, presentation: fixture.presentation,
        overviewGameLog: { value: 0, onChange: vi.fn() },
    }), host);
    return host;
}
function mockBattle(action: ActionInfo = fixture.action) {
    const engine = createStockEngine(12345);
    const state: GameState = structuredClone(fixture.state);
    state.traps = structuredClone(battleOverviewFixture.state.traps);
    const actions = fixture.actions.map(actor => actor.id === "ko"
        ? { ...actor, moves: [action], stance: { available: true },
            escapes: actor.escapes.map(escape => ({ ...escape, available: true })) } : actor);
    vi.spyOn(engine, "getGameState").mockReturnValue(state);
    vi.spyOn(engine, "getActionView").mockReturnValue(actions);
    const execute = vi.spyOn(engine, "executeAction").mockReturnValue({ success: false, reason: "actorAlreadyActed" });
    const host = mount(engine);
    button(".kcq-party-card").click();
    return { host, execute };
}
function element(selector: string): HTMLElement {
    const node = document.querySelector<HTMLElement>(selector);
    if (!node) throw new Error("Missing " + selector);
    return node;
}
function button(selector: string): HTMLButtonElement { return element(selector) as HTMLButtonElement; }
function press(key: string) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
}
const command = () => button('.kcq-command-card[data-kcq-shortcut="1"]');
const targets = () => [...document.querySelectorAll<HTMLButtonElement>("button.kcq-target-card")];

describe("wide character workspace", () => {
    it.each([390, 1199, 1200, WIDE_BATTLE_OVERVIEW_BREAKPOINT - 1, WIDE_BATTLE_OVERVIEW_BREAKPOINT, 1920, 2560])(
        "uses the new arrangement only at the existing wide breakpoint (%ipx)", width => {
            viewport.setViewport({ width });
            const { host } = mockBattle();
            const wide = width >= WIDE_BATTLE_OVERVIEW_BREAKPOINT;
            expect(!!host.querySelector(".kcq-character-details-wide")).toBe(wide);
            expect(host.querySelectorAll(".kcq-character-roster")).toHaveLength(1);
            expect(host.querySelectorAll(".kcq-combat-header")).toHaveLength(1);
            expect(!!host.querySelector('[role="log"]')).toBe(wide);
            expect(!!host.querySelector(".kcq-combat-header__settings")).toBe(wide);
            expect(getComputedStyle(element(".kcq-character-commands__grid")).gridTemplateColumns)
                .toBe("repeat(2, minmax(0, 1fr))");
            expect(!!host.querySelector("#character-commands-heading")).toBe(!wide);
            if (wide) {
                expect(getComputedStyle(element(".kcq-character-details-wide")).gridTemplateColumns).toBe("366px 366px 288px");
                expect(element(".kcq-character-information").contains(element(".kcq-character-bindings"))).toBe(true);
                expect(element(".kcq-character-information").contains(element(".kcq-character-effects"))).toBe(true);
                expect(element(".kcq-character-workspace").contains(command())).toBe(true);
                expect(getComputedStyle(host).width).toBe("100%");
                expect(element(".kcq-combat-header__title").textContent).toBe(fixture.presentation.encounter(fixture.state.encounter!.id));
                const headings = [...host.querySelectorAll(".kcq-battle-section__heading h2")];
                expect(headings.map(heading => heading.textContent)).toEqual(["Character / Ko-chan", "Commands / Ko-chan", "Game Log"]);
                for (const heading of headings) {
                    expect(getComputedStyle(heading).textTransform).toBe("uppercase");
                    expect(getComputedStyle(heading.parentElement!).height).toBe("16px");
                }
                expect(host.querySelector(".kcq-character-commands h2")).toBeNull();
                const logHeading = element(".kcq-battle-section--game-log .kcq-battle-section__heading");
                expect(logHeading.querySelector("button, a, [data-kcq-shortcut]")).toBeNull();
                logHeading.click();
                expect(host.querySelector(".kcq-game-log")).toBeNull();
                expect(element(".kcq-combat-header__trap-meter").getAttribute("role")).toBe("meter");
            }
            command().click();
            expect(!!host.querySelector(".kcq-character-details-wide")).toBe(wide);
            expect(!!host.querySelector('[role="log"]')).toBe(wide);
            expect(element(".kcq-targeting")).toBeDefined();
        },
    );
    it("retains the header, character information, and log through targeting and both Back levels", () => {
        mockBattle();
        const info = element(".kcq-character-information"), roster = element(".kcq-character-roster");
        const log = element('[role="log"]'), header = element(".kcq-combat-header");
        log.scrollTop = 43;
        command().click();
        expect(document.querySelector(".kcq-character-commands")).toBeNull();
        expect(element(".kcq-character-workspace").contains(element(".kcq-targeting"))).toBe(true);
        expect(element(".kcq-selected-command").textContent).toContain("Telekinesis");
        expect(element(".kcq-combat-header")).toBe(header);
        expect(element(".kcq-combat-header__title").textContent).toBe(fixture.presentation.encounter(fixture.state.encounter!.id));
        expect(element(".kcq-character-details-wide__information h2").textContent).toBe("Character / Ko-chan");
        expect(element(".kcq-character-details-wide__workspace h2").textContent).toBe("Targeting / Ko-chan");
        expect(element(".kcq-character-information")).toBe(info);
        expect(element(".kcq-character-roster")).toBe(roster);
        expect(element('[role="log"]')).toBe(log); expect(log.scrollTop).toBe(43);
        button(".kcq-combat-header__back").click();
        expect(document.querySelector(".kcq-targeting")).toBeNull(); expect(command()).toBeDefined();
        expect(element(".kcq-character-details-wide__workspace h2").textContent).toBe("Commands / Ko-chan");
        expect(element('[role="log"]')).toBe(log);
        press(COMBAT_SHORTCUTS.back);
        expect(element(".kcq-battle-overview-wide")).toBeDefined();
    });
    it("switches characters from targeting and inspects an incapacitated party member", () => {
        mockBattle(); command().click();
        const log = element('[role="log"]');
        const roster = [...document.querySelectorAll<HTMLButtonElement>(".kcq-character-roster__card")];
        roster[1]!.click();
        expect(document.querySelector(".kcq-targeting")).toBeNull();
        expect(element(".kcq-combat-header__title").textContent).toBe(fixture.presentation.encounter(fixture.state.encounter!.id));
        expect(element(".kcq-character-details-wide__information h2").textContent).toBe("Character / Matsuko");
        expect(element(".kcq-character-details-wide__workspace h2").textContent).toBe("Commands / Matsuko");
        expect(roster[1]!.getAttribute("aria-pressed")).toBe("true"); expect(roster[1]!.disabled).toBe(false);
        expect(element('[role="log"]')).toBe(log);
        roster[0]!.click(); expect(command().disabled).toBe(false);
    });
    it("preserves targeting while resizing without duplicate controls or actions", () => {
        const { execute } = mockBattle({ ...fixture.action, move: { ...fixture.action.move, targets: 2 } });
        command().click(); targets()[0]!.click();
        for (const width of [1799, 1800, 390, 1920]) {
            viewport.setViewport({ width });
            expect(element(".kcq-targeting")).toBeDefined();
            expect(targets()[0]!.getAttribute("aria-pressed")).toBe("true");
            expect(document.querySelectorAll(".kcq-combat-header")).toHaveLength(1);
            expect(document.querySelectorAll(".kcq-character-roster")).toHaveLength(1);
            expect(document.querySelectorAll(".kcq-targeting__execute")).toHaveLength(1);
            const shortcuts = [...document.querySelectorAll<HTMLElement>("[data-kcq-shortcut]")].map(node => node.dataset.kcqShortcut);
            expect(new Set(shortcuts).size).toBe(shortcuts.length);
        }
        press(COMBAT_SHORTCUTS.back); expect(command()).toBeDefined();
        command().click();
        expect(targets().every(target => target.getAttribute("aria-pressed") === "false")).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });
    it("keeps escape and stance in the grid and escape choices in the middle", () => {
        const { execute } = mockBattle();
        const grid = element(".kcq-character-commands__grid");
        expect(grid.contains(button('.kcq-command-card[data-kcq-shortcut="0"]'))).toBe(true);
        expect(grid.contains(button('.kcq-command-card[data-kcq-shortcut="9"]'))).toBe(true);
        press(COMBAT_SHORTCUTS.stance);
        expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "stance", actor: "ko" });
        const log = element('[role="log"]'); press(COMBAT_SHORTCUTS.escape);
        expect(element(".kcq-character-workspace").contains(element(".kcq-escape"))).toBe(true);
        expect(element(".kcq-character-details-wide__workspace h2").textContent).toBe("Escape / Ko-chan");
        expect(element('[role="log"]')).toBe(log);
        button('.kcq-escape-choice[data-kcq-shortcut="1"]').click();
        const selected = element('.kcq-escape-choice[aria-pressed="true"]').textContent;
        for (const width of [1799, 1800]) {
            viewport.setViewport({ width });
            expect(element('.kcq-escape-choice[aria-pressed="true"]').textContent).toBe(selected);
        }
        button(".kcq-escape__back").click(); expect(command()).toBeDefined();
        press(COMBAT_SHORTCUTS.escape);
        expect(document.querySelector('.kcq-escape-choice[aria-pressed="true"]')).toBeNull();
    });
    it.each([1, 2, 0, "all"] as const)("preserves %s target execution and previews", count => {
        const action = count === 0 || count === "all" ? targetingFixtures.allTargets.action : fixture.action;
        const { execute } = mockBattle({ ...action, move: { ...action.move, targets: count } });
        press("1"); expect(execute).not.toHaveBeenCalled();
        if (count !== 0) expect(element(".kcq-targeting__targets").children.length).toBeGreaterThan(0);
        if (count === 1) press("1");
        else {
            if (count === 2) {
                targets()[0]!.click(); expect(button(".kcq-targeting__execute").disabled).toBe(true);
                targets()[1]!.click(); targets()[0]!.click();
                expect(button(".kcq-targeting__execute").disabled).toBe(true);
                targets()[0]!.click();
            }
            expect(execute).not.toHaveBeenCalled(); press("Enter");
        }
        expect(execute).toHaveBeenCalledOnce();
        expect(execute.mock.calls[0]![0]).toMatchObject({ type: "move", actor: "ko", move: action.move.id });
    });
    it.each([false, true])("runs End Turn from the header or shortcut (%s)", shortcut => {
        const { execute } = mockBattle();
        if (!shortcut) command().click();
        if (shortcut) press(COMBAT_SHORTCUTS.endTurn);
        else button(".kcq-combat-header .kcq-battle-overview__primary-action").click();
        expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "endTurn" });
    });
    it("opens Settings, Library, and full history without losing the targeting workspace", async () => {
        mockBattle(); command().click();
        const workspace = element(".kcq-targeting"), log = element('[role="log"]');
        const settings = button(".kcq-combat-header__settings");
        settings.focus(); settings.click();
        const dialog = element('[role="dialog"]');
        dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        await Promise.resolve();
        expect(document.activeElement === settings).toBe(true);
        button(".kcq-combat-header__library").click();
        expect(element(".kcq-library")).toBeDefined();
        button(".kcq-library__header-back").click();
        expect(element(".kcq-targeting")).toBe(workspace);
        press(COMBAT_SHORTCUTS.gameLog);
        expect(element(".kcq-game-log")).toBeDefined();
        press(COMBAT_SHORTCUTS.back);
        expect(document.querySelector(".kcq-game-log")).toBeNull();
        expect(element(".kcq-targeting")).toBe(workspace);
        expect(element('[role="log"]')).toBe(log);
    });
    it("retains Space confirmation priority while the new End Turn control is present", () => {
        const { execute } = mockBattle({ ...fixture.action, move: { ...fixture.action.move, targets: 2 } });
        command().click(); press(COMBAT_SHORTCUTS.endTurn);
        expect(execute).not.toHaveBeenCalled();
        targets()[0]!.click(); targets()[1]!.click(); press(COMBAT_SHORTCUTS.endTurn);
        expect(execute).toHaveBeenCalledOnce();
        expect(execute.mock.calls[0]![0]).toMatchObject({ type: "move", actor: "ko" });
    });
    it("updates the real battle and graphical log after stance and a move", () => {
        const engine = createStockEngine(12345); createBattle(engine, "plains_1", "standard");
        const execute = vi.spyOn(engine, "executeAction"); mount(engine);
        button(".kcq-party-card").click(); press(COMBAT_SHORTCUTS.stance);
        expect(engine.getGameState().characters[0]!.standing).toBe(true);
        expect(element('[role="log"]').textContent).toContain("Ko-chan");
        command().click(); targets()[0]!.click();
        expect(execute).toHaveBeenCalledTimes(2); expect(execute.mock.results[1]!.value.success).toBe(true);
        expect(element(".kcq-battle-overview-wide")).toBeDefined();
        expect(element('[role="log"]').textContent).toContain("Telekinesis");
        expect(engine.getGameState().characters[0]!.acted).toBe(true);
    });
});
