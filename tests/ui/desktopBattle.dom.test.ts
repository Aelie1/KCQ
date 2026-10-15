import { readFileSync } from "node:fs";
import type { Window as HappyWindow } from "happy-dom";
import { createComponent, createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getThresholds } from "../../src/engine/public/mechanics";
import type { ActionResult, Engine } from "../../src/engine/public/types";
import { createStockEngine } from "../../src/stock";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createBattle } from "../../src/ui/web/app";
import { App } from "../../src/ui/web/app/App";
import { BattleApp } from "../../src/ui/web/app/BattleApp";
import { GraphicalApp } from "../../src/ui/web/app/GraphicalApp";
import { DesktopBattleActions } from "../../src/ui/web/app/panels/DesktopBattlePanel";
import { createBattleOverviewViewModel } from "../../src/ui/web/app/viewModels/battleOverview";
import { readSave } from "../../src/ui/web/app/savePersistence";
import { createCharacterDetailsViewModel } from "../../src/ui/web/app/viewModels/characterDetails";
import { incomingBindingBattle } from "../helpers/incomingBindingBattle";
import { stockStrings } from "../helpers/stockStrings";

const presentation = new Presentation(stockStrings);
const viewport = (window as unknown as HappyWindow).happyDOM;
const initialViewport = { width: window.innerWidth, height: window.innerHeight };
let unmount: (() => void) | undefined;
function resize(width = 1600, height = 1100) {
    viewport.setViewport({ width, height }); window.dispatchEvent(new Event("resize"));
}
function element<T extends HTMLElement = HTMLElement>(selector: string): T {
    const found = document.querySelector<T>(selector);
    if (!found) throw new Error("Missing " + selector);
    return found;
}
const click = (selector: string) => element(selector).click();
const rows = () => [...document.querySelectorAll<HTMLElement>(".kcq-desktop-character")];
const select = (id: string) => click(`[data-actor-id="${id}"] .kcq-desktop-character__identity`);
const endTurn = () => click(".kcq-desktop-battle__actions .kcq-battle-overview__primary-action");
function command(name: string): HTMLButtonElement {
    const found = [...document.querySelectorAll<HTMLButtonElement>(".kcq-desktop-battle__commands .kcq-command-card")]
        .find(button => button.querySelector(".kcq-command-card__name")?.textContent === name);
    if (!found) throw new Error("Missing command " + name);
    return found;
}
function key(key: string) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
}
function saved() {
    const result = readSave();
    if (result.status !== "loaded") throw new Error("Missing autosave");
    return result.save;
}
function host() {
    const style = document.createElement("style");
    style.textContent = readFileSync("src/ui/web/app/tokens.css", "utf8") + readFileSync("src/ui/web/app/app.css", "utf8");
    const host = document.createElement("div"); document.body.append(style, host); return host;
}
function mount(engine?: Engine, speed: "normal" | "instant" = "instant") {
    if (!engine) { engine = createStockEngine(12345); createBattle(engine, "plains_1", "standard"); }
    const onAction = vi.fn(), onOutcome = vi.fn(), execute = vi.spyOn(engine, "executeAction");
    const battleEngine = engine;
    unmount = render(() => createComponent(App, {
        get children() { return createComponent(BattleApp, { engine: battleEngine, presentation,
            playbackSpeed: { value: speed, onChange: vi.fn() }, observer: { onAction }, onOutcome }); },
    }), host());
    return { engine, execute, onAction, onOutcome };
}
beforeEach(() => {
    vi.useFakeTimers(); vi.stubGlobal("__KCQ_GIT_REVISION__", "desktop-test");
    window.localStorage.clear(); window.localStorage.setItem("kcq.playbackSpeed", "instant"); resize();
});
afterEach(() => {
    unmount?.(); unmount = undefined; document.body.replaceChildren();
    vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); window.localStorage.clear();
    resize(initialViewport.width, initialViewport.height);
});
describe("desktop battle", () => {
    it.each([0, 11, 14])("keeps End Turn in the shared grid and preserves all %i commands", count => {
        const engine = createStockEngine(12345); createBattle(engine, "plains_1", "standard");
        const state = engine.getGameState(), actions = engine.getActionView(), thresholds = getThresholds();
        const model = createCharacterDetailsViewModel(state, actions, "ko", thresholds, presentation);
        const commands = Array.from({ length: count }, (_, index) => ({ ...model.focused.commands[0]!,
            id: `command-${index}`, name: `Command ${index}`, available: index !== 1 }));
        const [blocked, setBlocked] = createSignal(false);
        const onSelectCommand = vi.fn(), onEndTurn = vi.fn();
        unmount = render(() => createComponent(DesktopBattleActions, {
            model: count ? { ...model, focused: { ...model.focused, commands } } : undefined,
            overview: createBattleOverviewViewModel(state, actions, thresholds, presentation), presentation,
            shortcuts: true, get blocked() { return blocked(); }, onSelectCommand, onEndTurn,
        }), host());
        const grid = element(".kcq-character-commands__grid");
        expect(getComputedStyle(grid).gridTemplateColumns).toBe("repeat(6, minmax(0, 1fr))");
        const cards = [...grid.querySelectorAll<HTMLButtonElement>(".kcq-command-card")];
        expect(cards.map(card => card.querySelector(".kcq-command-card__name")?.textContent))
            .toEqual(commands.map(command => command.name));
        if (count) {
            cards[count - 1]!.click();
            expect(onSelectCommand).toHaveBeenCalledExactlyOnceWith("ko", `command-${count - 1}`);
            expect(cards[1]!.disabled).toBe(true);
        }
        const end = element<HTMLButtonElement>(".kcq-battle-overview__primary-action");
        expect(end.parentElement).toBe(grid);
        expect(getComputedStyle(end).gridColumn).toBe("6");
        expect(getComputedStyle(end).gridRow).toBe("2");
        expect(getComputedStyle(element(".kcq-desktop-battle__commands")).overflowY).toBe("auto");
        end.click(); expect(onEndTurn).toHaveBeenCalledOnce();
        setBlocked(true); expect(end.disabled).toBe(true);
        end.click(); expect(onEndTurn).toHaveBeenCalledOnce();
    });
    it("keeps three real party rows, all capabilities and empty zones at native CSS scale", () => {
        const { engine } = mount(); expect(rows()).toHaveLength(3);
        for (const [index, row] of rows().entries()) {
            expect(row.textContent).toContain(presentation.entity(engine.getGameState().characters[index]!.id));
            expect(row.querySelectorAll(".kcq-modifier-meter")).toHaveLength(10);
            expect(row.querySelectorAll(".kcq-pip-meter__pip")).toHaveLength(80);
            expect(row.querySelectorAll(".kcq-character-binding")).toHaveLength(engine.getGameState().encounter!.bindings.length);
            expect(getComputedStyle(row).height).toBe("218px");
        }
        expect(getComputedStyle(element(".kcq-app>div")).zoom).toBe("1");
        expect(document.querySelectorAll('[role="log"]')).toHaveLength(1);
        Object.defineProperty(element(".kcq-app"), "clientWidth", { configurable: true, value: 1600 });
        window.dispatchEvent(new Event("resize"));
        expect(element(".kcq-app").style.getPropertyValue("--kcq-ui-zoom")).toBe("1.5");
        expect(getComputedStyle(element(".kcq-app>div")).zoom).toBe("1");
    });
    it("updates commands for each actor, expands enemies inline, and cancels targeting", () => {
        const { engine, execute } = mount(), initialRows = rows();
        for (const actor of engine.getGameState().characters) {
            select(actor.id);
            expect(element("#desktop-character-commands-heading").textContent).toContain(presentation.entity(actor.id));
            expect(rows()).toEqual(initialRows);
        }
        click(".kcq-desktop-battle__enemies .kcq-enemy-card");
        expect(document.querySelector(".kcq-enemy-details")).not.toBeNull();
        expect(element(".kcq-desktop-battle__enemies").hidden).toBe(false);
        select("ko"); command(presentation.move("telekinesis")).click();
        expect(element(".kcq-desktop-battle__enemies").hidden).toBe(true); expect(rows()).toEqual(initialRows);
        click(".kcq-targeting__back");
        expect(element(".kcq-desktop-battle__enemies").hidden).toBe(false);
        expect(document.querySelector(".kcq-targeting")).toBeNull(); expect(execute).not.toHaveBeenCalled();
    });
    it("preserves partial multi-target selection and the active panel across viewport changes", () => {
        const engine = createStockEngine(12345); createBattle(engine, "forest_3", "standard");
        const actions = engine.getActionView().map(action => ({ ...action, moves: action.moves.map(info =>
            info.move.id === "telekinesis" ? { ...info, move: { ...info.move, targets: 2 } } : info) }));
        vi.spyOn(engine, "getActionView").mockReturnValue(actions);
        const { execute } = mount(engine); select("ko"); command(presentation.move("telekinesis")).click();
        click("button.kcq-target-card");
        const panel = element(".kcq-targeting"), selected = element("button.kcq-target-card[aria-pressed=true]");
        resize(390, 844);
        expect(document.querySelector(".kcq-battle-stage--desktop")).toBeNull();
        expect(element(".kcq-targeting")).toBe(panel);
        expect(element("button.kcq-target-card[aria-pressed=true]")).toBe(selected);
        resize(); expect(element(".kcq-targeting")).toBe(panel);
        expect(element("button.kcq-target-card[aria-pressed=true]")).toBe(selected);
        expect(element<HTMLButtonElement>(".kcq-targeting__execute").disabled).toBe(true);
        expect(execute).not.toHaveBeenCalled();
    });
    it("executes escape and stance and preserves escape selection on resize", () => {
        const { engine } = incomingBindingBattle(), battle = mount(engine);
        select("ko"); command(presentation.ui("characterDetails.escape")).click();
        click(".kcq-escape-choice:not(:disabled)");
        const panel = element(".kcq-escape"), choice = element(".kcq-escape-choice[aria-pressed=true]");
        resize(390, 844); resize(); expect(element(".kcq-escape")).toBe(panel);
        expect(element(".kcq-escape-choice[aria-pressed=true]")).toBe(choice);
        click(".kcq-escape__execute"); expect(battle.execute).toHaveBeenCalledOnce();
        expect(battle.execute.mock.calls[0]![0].type).toBe("escape");
        unmount?.(); document.body.replaceChildren(); const normal = mount();
        const standing = normal.engine.getGameState().characters[0]!.standing; select("ko"); key("9");
        expect(normal.execute).toHaveBeenCalledExactlyOnceWith({ type: "stance", actor: "ko" });
        expect(normal.engine.getGameState().characters[0]!.standing).toBe(!standing);
        expect(rows()[0]!.textContent).toContain(presentation.stance(standing ? "moving" : "standing"));
    });
    it("updates all statuses and one log during playback and resize without duplicate actions or stats", () => {
        const engine = createStockEngine(12345); createBattle(engine, "forest_3", "standard");
        const { execute, onAction } = mount(engine, "normal"); endTurn();
        const log = element('[role="log"]'), count = log.querySelectorAll("[data-kind=move]").length;
        expect(element(".kcq-battle-stage").getAttribute("aria-busy")).toBe("true");
        expect(count).toBeGreaterThan(0); expect(log.closest("[inert]")).toBeNull();
        resize(390, 844); resize(); vi.advanceTimersByTime(20000);
        expect(execute).toHaveBeenCalledOnce(); expect(onAction).toHaveBeenCalledOnce();
        expect(element(".kcq-battle-stage").getAttribute("aria-busy")).toBe("false");
        expect(document.querySelectorAll('[role="log"]')).toHaveLength(1);
        expect(element('[role="log"]').querySelectorAll("[data-kind=move]").length).toBeGreaterThan(count);
        expect(saved().stats.stats.actions).toBe(1);
        const result = execute.mock.results[0]!.value as ActionResult;
        if (!result?.success) throw new Error("Expected successful end turn");
        expect(saved().gameLog.entries.filter(entry => entry.kind === "move")).toHaveLength(
            result.frames.filter(frame => frame.event.type === "useMove").length);
        expect(element('[role="log"]').querySelectorAll("[data-kind=move]")).toHaveLength(
            saved().gameLog.entries.filter(entry => entry.kind === "move").length);
        for (const row of rows()) {
            const model = createCharacterDetailsViewModel(engine.getGameState(), engine.getActionView(), row.dataset.actorId!, getThresholds(), presentation, true);
            expect(row.querySelector(".kcq-desktop-character__identity")?.textContent).toContain(model.focused.actionState.label);
            expect([...row.querySelectorAll('[role="progressbar"]')].map(meter => Number(meter.getAttribute("aria-valuenow"))))
                .toEqual(model.focused.bindings.map(binding => binding.value));
        }
        const currentRows = rows(); endTurn(); vi.advanceTimersByTime(20000); expect(rows()).toEqual(currentRows);
    });
    it("restores state, log and stats through title Continue with one engine session", () => {
        const { engine } = mount(); endTurn(); const before = saved();
        unmount?.(); document.body.replaceChildren(); const restored = createStockEngine(77);
        const load = vi.spyOn(restored, "loadSaveState"), prepareBattle = vi.fn(() => ({ engine, dispose: vi.fn() }));
        unmount = render(() => createComponent(GraphicalApp, { campaigns: ["skunk"], release: "test", presentation,
            composeCampaign: () => ({ engine: restored, presentation }), prepareBattle }), host());
        click(".kcq-title-screen__continue"); expect(load).toHaveBeenCalledExactlyOnceWith(before.saveState);
        expect(prepareBattle).not.toHaveBeenCalled(); expect(restored.getGameState()).toEqual(engine.getGameState());
        expect(rows()).toHaveLength(3); expect(document.querySelectorAll('[role="log"]')).toHaveLength(1);
        expect(element('[role="log"]').querySelectorAll("[data-kind=move]").length).toBeGreaterThan(0);
        expect(saved()).toEqual(before);
    });
    it("plays a real encounter to victory entirely through desktop controls", async () => {
        const { engine, execute, onAction, onOutcome } = mount();
        for (let round = 0; round < 40 && engine.getGameState().turn.outcome === "ongoing"; round++) {
            for (const actor of [...engine.getGameState().characters]) {
                if (engine.getGameState().turn.outcome !== "ongoing") break;
                const action = engine.getActionView().find(action => action.id === actor.id)!;
                const move = action.moves.find(info => info.available && info.targets.some(target => target.valid && target.damage));
                if (!move) continue;
                select(actor.id); command(presentation.move(move.move.id)).click();
                const targets = [...document.querySelectorAll<HTMLButtonElement>("button.kcq-target-card:not(:disabled)")];
                if (targets.length) targets[0]!.click(); else click(".kcq-targeting__execute");
            }
            if (engine.getGameState().turn.outcome === "ongoing") endTurn();
        }
        expect(engine.getGameState().turn.outcome).toBe("victory");
        expect(onOutcome).toHaveBeenCalledExactlyOnceWith("victory");
        expect(onAction).toHaveBeenCalledTimes(execute.mock.calls.length);
        expect(readSave().status).toBe("missing"); expect(rows()).toHaveLength(3);
        document.querySelector<HTMLButtonElement>(".kcq-victory-story__continue")?.click();
        expect(document.querySelector(".kcq-battle-result--victory")).not.toBeNull();
        click(".kcq-battle-result__log"); await Promise.resolve();
        expect(document.querySelector(".kcq-battle-result--victory")).toBeNull();
        expect(document.querySelectorAll('[role="log"]')).toHaveLength(1);
        expect(document.activeElement).toBe(element(".kcq-desktop-battle__log-heading button"));
        click(".kcq-desktop-battle__log-heading button");
        expect(document.querySelector(".kcq-battle-result--victory")).not.toBeNull();
    });
    it("uses the conservative desktop threshold without affecting title or smaller battles", () => {
        mount(); resize(1519, 1100); expect(rows()).toHaveLength(0);
        resize(1600, 875); expect(rows()).toHaveLength(0);
        resize(1520, 876); expect(rows()).toHaveLength(3);
        const header = getComputedStyle(element(".kcq-desktop-battle__top"));
        expect(header.gridColumn).toBe("3"); expect(header.gridRow).toBe("1");
        expect(getComputedStyle(element(".kcq-desktop-battle__left")).gridRow).toBe("1 / -1");
        expect(getComputedStyle(element(".kcq-battle-middle")).gridRow).toBe("1 / -1");
        expect(getComputedStyle(element(".kcq-battle-log-pane")).gridColumn).toBe("3");
        expect(getComputedStyle(element(".kcq-battle-log-pane")).gridRow).toBe("2");
        expect(getComputedStyle(element(".kcq-desktop-battle__header .kcq-combat-header")).gridTemplateColumns)
            .toBe("minmax(0, 1fr) max-content 42px");
        resize(390, 844); expect(document.querySelector(".kcq-battle-overview")).not.toBeNull();
    });
    it("routes character, command and target keyboard choices to one visible control", () => {
        const { execute } = mount(); key("2");
        expect(element("#desktop-character-commands-heading").textContent).toContain(presentation.entity("matsuko"));
        key("1"); expect(document.querySelector(".kcq-targeting")).not.toBeNull();
        expect(execute).not.toHaveBeenCalled(); key("1");
        expect(execute).toHaveBeenCalledOnce();
        expect(execute.mock.calls[0]![0]).toMatchObject({ type: "move", actor: "matsuko" });
    });
    it("executes predetermined self moves and ally escape assists through existing APIs", () => {
        const engine = createStockEngine(12345); createBattle(engine, "forest_3", "standard");
        const { execute } = mount(engine); select("ko"); command(presentation.move("reflect")).click();
        expect(document.querySelectorAll("button.kcq-target-card")).toHaveLength(0);
        click(".kcq-targeting__execute");
        expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "move", actor: "ko", move: "reflect", targets: [] });
        endTurn();
        const assist = engine.getActionView().flatMap(action => action.escapes
            .filter(escape => escape.available && escape.target !== action.id).map(escape => ({ actor: action.id, escape })))[0];
        expect(assist).toBeDefined(); if (!assist) return;
        select(assist.actor); command(presentation.ui("characterDetails.escape")).click();
        const group = [...document.querySelectorAll<HTMLElement>(".kcq-escape-group")]
            .find(group => group.getAttribute("aria-label") === presentation.entity(assist.escape.target))!;
        const choice = [...group.querySelectorAll<HTMLButtonElement>(".kcq-escape-choice")]
            .find(choice => choice.querySelector(".kcq-escape-choice__name")?.textContent === presentation.binding(assist.escape.binding, "short"))!;
        choice.click(); click(".kcq-escape__execute");
        expect(execute).toHaveBeenLastCalledWith({ type: "escape", actor: assist.actor, target: assist.escape.target, binding: assist.escape.binding });
    });

});
