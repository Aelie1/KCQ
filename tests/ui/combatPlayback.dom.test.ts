import { createComponent, createRoot } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionSuccess, EventFrame, GameState } from "../../src/engine/public/types";
import { createStockEngine } from "../../src/stock";
import { createGameLogEntries } from "../../src/ui/presentation/gameLog";
import { BattleApp } from "../../src/ui/web/app/BattleApp";
import { createCombatPlayback } from "../../src/ui/web/app/combatPlayback";
import { targetingFixtures } from "../../src/ui/web/app/fixtures/targeting";
import { battleOverviewFixture as fixture } from "../../src/ui/web/app/fixtures/battleOverview";
import { createPlaybackSpeedPreference, PLAYBACK_INTERVALS, type PlaybackSpeed } from "../../src/ui/web/app/playbackSpeed";
import { useCombatKeyboard, type SharedKeyboard } from "../../src/ui/web/app/keyboard";
import { createGameLogHistory } from "../../src/ui/web/app/viewModels/gameLogHistory";
import { createGameLogViewModel } from "../../src/ui/web/app/viewModels/gameLog";

let unmount: (() => void) | undefined;
beforeEach(() => { vi.useFakeTimers(); window.localStorage.clear(); });
afterEach(() => {
    unmount?.(); unmount = undefined;
    document.body.replaceChildren();
    vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
    window.localStorage.clear();
});

function sequence(outcome: GameState["turn"]["outcome"] = "ongoing") {
    const initial: GameState = structuredClone(fixture.state);
    initial.turn.phase = "player";
    initial.characters[0]!.bindings[0]!.value = 0;
    initial.characters[0]!.bindings[0]!.level = "none";
    const snapshot = (value: number, phase: "player" | "enemy" = "enemy") => {
        const state = structuredClone(initial);
        state.characters[0]!.bindings[0]!.value = value;
        state.characters[0]!.bindings[0]!.level = value >= 25 ? "moderate" : value >= 10 ? "light" : "none";
        state.turn.phase = phase;
        if (phase === "player") { state.turn.round++; state.turn.outcome = outcome;
            if (outcome === "victory") state.enemies = [];
        }
        return state;
    };
    const moves = [["skunkette1", "pounce"], ["skunk1", "latexShower"], ["queen", "skunkPerfume"]] as const;
    const frames: EventFrame[] = [
        { state: snapshot(5), event: { type: "changePhase", phase: "enemy", effects: [
            { type: "bondageChanged", target: "ko", binding: "latexHead", amount: 5 },
        ] } },
        ...moves.map(([actor, move], index): EventFrame => ({
            state: snapshot(15 + index * 10),
            event: { type: "useMove", actor, move, effects: [], targets: [{ target: "ko", result: "hit", effects: [
                { type: "bondageChanged", target: "ko", binding: "latexHead", amount: 10 },
            ] }] },
        })),
        { state: snapshot(36, "player"), event: { type: "changePhase", phase: "player", effects: [
            { type: "bondageChanged", target: "ko", binding: "latexHead", amount: 1 },
        ] } },
    ];
    return { initial, frames, final: frames[frames.length - 1]!.state };
}

function controller(speed: PlaybackSpeed = "normal") {
    const data = sequence();
    const present = vi.fn();
    const complete = vi.fn();
    let playback!: ReturnType<typeof createCombatPlayback>;
    let preference!: ReturnType<typeof createPlaybackSpeedPreference>;
    const history = createGameLogHistory(data.initial);
    const histories: ReturnType<typeof createGameLogEntries>[] = [];
    createRoot(dispose => {
        unmount = dispose;
        preference = createPlaybackSpeedPreference(); preference.onChange(speed);
        playback = createCombatPlayback({ interval: () => PLAYBACK_INTERVALS[preference.value],
            present: (frames, state) => { present(frames, state); histories.push(history.record(frames)); }, complete });
    });
    return { ...data, playback, preference, present, complete, histories };
}

describe("playback timing and history", () => {
    it("presents enemy actions at 500ms with matching snapshots and history, then hands off the final state", () => {
        const c = controller(); c.playback.start(c.frames, c.final);
        expect(c.present).toHaveBeenCalledExactlyOnceWith(c.frames.slice(0, 2), c.frames[1]!.state);
        expect(c.histories[0]).toEqual(createGameLogEntries(c.frames.slice(0, 2), c.initial));
        expect(c.playback.active()).toBe(true);
        vi.advanceTimersByTime(499); expect(c.present).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(1);
        expect(c.present).toHaveBeenLastCalledWith([c.frames[2]], c.frames[2]!.state);
        expect(c.histories[1]).toEqual(createGameLogEntries(c.frames.slice(0, 3), c.initial));
        expect(c.complete).not.toHaveBeenCalled();
        vi.advanceTimersByTime(500);
        expect(c.present).toHaveBeenLastCalledWith(c.frames.slice(3), c.final);
        expect(c.histories[2]).toEqual(createGameLogEntries(c.frames, c.initial));
        expect(c.complete).toHaveBeenCalledExactlyOnceWith(c.final);
        expect(c.playback.active()).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
    });
    it("uses Instant synchronously with the complete existing history", () => {
        const c = controller("instant"); const prepare = vi.fn();
        c.playback.start(c.frames, c.final, prepare);
        expect(c.present).toHaveBeenCalledExactlyOnceWith(c.frames, c.final);
        expect(c.histories[0]).toEqual(createGameLogEntries(c.frames, c.initial));
        expect(c.complete).toHaveBeenCalledExactlyOnceWith(c.final);
        expect(prepare).not.toHaveBeenCalled(); expect(c.playback.active()).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
    });
    it.each(["fast", "slow"] as const)("reschedules outstanding playback when the speed changes to %s", speed => {
        const c = controller(); c.playback.start(c.frames, c.final);
        vi.advanceTimersByTime(100); c.preference.onChange(speed);
        vi.advanceTimersByTime(PLAYBACK_INTERVALS[speed] - 1); expect(c.present).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(1); expect(c.present).toHaveBeenCalledTimes(2);
        c.preference.onChange("instant");
        expect(c.present).toHaveBeenCalledTimes(3); expect(c.complete).toHaveBeenCalledOnce();
        expect(c.histories[2]).toEqual(createGameLogEntries(c.frames, c.initial));
        expect(vi.getTimerCount()).toBe(0);
    });
    it("waits for viewport preparation even when speed changes, and cancels preparation on unmount", () => {
        const c = controller(); let ready!: () => void; const cancel = vi.fn();
        c.playback.start(c.frames, c.final, callback => { ready = callback; return cancel; });
        c.preference.onChange("instant"); vi.advanceTimersByTime(5000);
        expect(c.playback.active()).toBe(true); expect(c.present).not.toHaveBeenCalled();
        unmount!(); unmount = undefined; ready();
        expect(cancel).toHaveBeenCalledOnce(); expect(c.present).not.toHaveBeenCalled(); expect(c.complete).not.toHaveBeenCalled();
    });
    it("applies speed changes to the final outcome viewing interval without publishing history twice", () => {
        const c = controller(); c.final.turn.outcome = "victory";
        c.playback.start(c.frames, c.final); vi.advanceTimersByTime(1000);
        expect(c.present).toHaveBeenCalledTimes(3); expect(c.complete).not.toHaveBeenCalled();
        c.preference.onChange("slow"); vi.advanceTimersByTime(999);
        expect(c.complete).not.toHaveBeenCalled();
        c.preference.onChange("instant"); expect(c.complete).toHaveBeenCalledOnce();
        expect(c.present).toHaveBeenCalledTimes(3); expect(vi.getTimerCount()).toBe(0);
    });
    it("clears timers and prevents stale publication on unmount", () => {
        const c = controller(); c.playback.start(c.frames, c.final);
        unmount!(); unmount = undefined;
        expect(vi.getTimerCount()).toBe(0); vi.advanceTimersByTime(10000);
        c.preference.onChange("instant");
        expect(c.present).toHaveBeenCalledOnce(); expect(c.complete).not.toHaveBeenCalled();
    });
    it("finishes empty and phase-only results without adding bookkeeping pauses", () => {
        const c = controller(); c.playback.start([], c.final);
        expect(c.complete).toHaveBeenCalledOnce(); expect(c.present).not.toHaveBeenCalled();
        c.playback.start([c.frames[0]!], c.final);
        expect(c.complete).toHaveBeenCalledTimes(2); expect(c.present).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    });
});

function mountBattle(speed?: PlaybackSpeed, outcome?: GameState["turn"]["outcome"], sharedKeyboard = false, playerMove = false) {
    if (speed) window.localStorage.setItem("kcq.playbackSpeed", speed);
    const data = sequence(outcome);
    const engine = createStockEngine(12345);
    let authoritative = data.initial;
    vi.spyOn(engine, "getGameState").mockImplementation(() => structuredClone(authoritative));
    const initialActions = fixture.actions.map(action => playerMove && action.id === "ko"
        ? { ...action, moves: [targetingFixtures.telekinesisChoose.action] } : action);
    vi.spyOn(engine, "getActionView").mockReturnValue(initialActions);
    const finalActions = fixture.actions.map(action => ({ ...action, available: false, reason: "actorAlreadyActed" as const }));
    const result: ActionSuccess = { success: true, frames: data.frames, actions: finalActions };
    const execute = vi.spyOn(engine, "executeAction").mockImplementation(() => { authoritative = data.final; return result; });
    let id = 0;
    const pending = new Map<number, FrameRequestCallback>();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { pending.set(++id, callback); return id; });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => pending.delete(id));
    const paint = () => { for (const [id, callback] of [...pending]) { pending.delete(id); callback(0); } };
    const onVictory = vi.fn(); const onOutcome = vi.fn();
    const host = document.createElement("div"); document.body.append(host);
    unmount = render(() => {
        let handler: ((key: string) => boolean) | undefined;
        const keyboard: SharedKeyboard | undefined = sharedKeyboard ? {
            hintsVisible: useCombatKeyboard(() => host, () => true, key => handler?.(key) ?? false, () => "temporary"),
            registerGlobalAction(callback) { handler = callback; return () => { handler = undefined; }; },
        } : undefined;
        return createComponent(BattleApp, { engine, presentation: fixture.presentation, keyboard,
            overviewGameLog: { value: 8, onChange: vi.fn() }, onVictory, observer: { onOutcome } });
    }, host);
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollTo").mockImplementation(function (this: HTMLElement, arg: number | ScrollToOptions) {
        this.scrollTop = typeof arg === "number" ? arg : arg.top ?? 0;
    });
    return { ...data, engine, execute, paint, pending, scroll, onVictory, onOutcome, finalActions };
}
function element<T extends HTMLElement = HTMLElement>(selector: string): T {
    const found = document.querySelector<T>(selector); if (!found) throw new Error("Missing " + selector); return found;
}
const endTurn = () => element<HTMLButtonElement>(".kcq-battle-overview__primary-action").click();
const binding = () => Number(element(".kcq-party-card [role=progressbar]").getAttribute("aria-valuenow"));
const actors = () => [...document.querySelectorAll<HTMLElement>(".kcq-compact-game-log [data-kind=move]")].map(entry => entry.dataset.actor);
function key(key: string) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
}

describe("BattleApp playback integration", () => {
    it("scrolls before presenting moves, updates stable party cards and synchronizes both logs", () => {
        const b = mountBattle();
        const overview = element(".kcq-battle-overview"); const party = element(".kcq-party-card");
        const enemy = element(".kcq-enemy-card"); const meter = element(".kcq-party-card [role=progressbar]"); const body = element(".kcq-screen-layout__body");
        Object.defineProperty(body, "scrollHeight", { value: 1200, configurable: true });
        endTurn();
        expect(b.engine.getGameState()).toEqual(b.final); expect(binding()).toBe(0); expect(actors()).toEqual([]);
        expect(element(".kcq-battle-stage").getAttribute("aria-busy")).toBe("true");
        b.paint(); expect(b.scroll).toHaveBeenCalledExactlyOnceWith({ top: 1200, behavior: "instant" });
        expect(binding()).toBe(0); expect(body.scrollTop).toBe(1200);
        b.paint(); expect(binding()).toBe(15); expect(actors()).toEqual(["skunkette1"]);
        vi.advanceTimersByTime(500); expect(binding()).toBe(25); expect(actors()).toEqual(["skunkette1", "skunk1"]);
        vi.advanceTimersByTime(500); expect(binding()).toBe(36); expect(actors()).toEqual(["skunkette1", "skunk1", "queen"]);
        expect(element(".kcq-battle-overview")).toBe(overview); expect(element(".kcq-party-card")).toBe(party);
        expect(element(".kcq-enemy-card")).toBe(enemy); expect(element(".kcq-party-card [role=progressbar]")).toBe(meter);
        expect(element(".kcq-screen-layout__body")).toBe(body);
        expect(body.scrollTop).toBe(1200); expect(b.scroll).toHaveBeenCalledOnce(); expect(b.execute).toHaveBeenCalledOnce();
        expect(element(".kcq-battle-stage").getAttribute("aria-busy")).toBe("false");
        expect(element(".kcq-battle-overview__primary-action").classList.contains("is-dimmed")).toBe(false);
        element(".kcq-battle-overview__secondary-action").click();
        const expected = createGameLogViewModel(createGameLogEntries(b.frames, b.initial), fixture.presentation, b.initial.characters.map(c => c.id));
        expect([...document.querySelectorAll<HTMLElement>(".kcq-game-log__scroll [data-kind]")].map(e => e.dataset.kind)).toEqual(expected.map(e => e.kind));
        for (const entry of expected) if (entry.title) expect(element(".kcq-game-log__scroll").textContent).toContain(entry.title);
        expect(b.engine.getGameState()).toEqual(b.final);
    });
    it.each([false, true])("blocks mouse and keyboard throughout playback (shared keyboard: %s)", shared => {
        const b = mountBattle(undefined, undefined, shared); const party = element(".kcq-party-card"); const enemy = element(".kcq-enemy-card");
        endTurn();
        for (const advance of [() => {}, () => { b.paint(); b.paint(); }, () => vi.advanceTimersByTime(500)]) {
            advance(); endTurn(); party.click(); enemy.click();
            party.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
            element(".kcq-battle-overview__secondary-action").click(); element(".kcq-combat-header__settings").click();
            for (const shortcut of ["=", "1", "4", "9", "0", "-", "Backspace"]) key(shortcut);
            expect(b.execute).toHaveBeenCalledOnce(); expect(document.querySelector(".kcq-character-details, .kcq-enemy-details, .kcq-game-log, [role=dialog]")).toBeNull();
            expect(element<HTMLButtonElement>(".kcq-battle-overview__primary-action").disabled).toBe(true);
            expect(element(".kcq-battle-stage__background").hasAttribute("inert")).toBe(true);
        }
        vi.advanceTimersByTime(500); party.click(); expect(document.querySelector(".kcq-character-details")).not.toBeNull();
    });
    it.each(["character", "enemy", "log"])("returns from %s to Overview before scrolling on keyboard End Turn", screen => {
        const b = mountBattle();
        element(screen === "character" ? ".kcq-party-card" : screen === "enemy" ? ".kcq-enemy-card" : ".kcq-battle-overview__secondary-action").click();
        const selector = screen === "character" ? ".kcq-character-details" : screen === "enemy" ? ".kcq-enemy-details" : ".kcq-game-log";
        expect(document.querySelector(selector)).not.toBeNull(); key("=");
        expect(document.querySelector(selector)).toBeNull(); expect(document.querySelector(".kcq-battle-overview")).not.toBeNull();
        b.paint(); expect(binding()).toBe(0); b.paint(); expect(binding()).toBe(15);
        expect(b.scroll.mock.instances[0]).toBe(element(".kcq-battle-overview .kcq-screen-layout__body"));
    });
    it("keeps Instant immediate and lets settings change speed during the same battle", () => {
        const b = mountBattle("instant"); endTurn();
        expect(binding()).toBe(36); expect(actors()).toHaveLength(3); expect(element(".kcq-battle-stage").getAttribute("aria-busy")).toBe("false");
        element(".kcq-combat-header__settings").click();
        const select = element<HTMLSelectElement>(".kcq-battle-settings__playback-speed select"); expect(select.value).toBe("instant");
        expect([...select.options].map(option => option.text)).toEqual(["Instant", "Fast", "Normal", "Slow"]);
        select.value = "slow"; select.dispatchEvent(new Event("change", { bubbles: true }));
        expect(window.localStorage.getItem("kcq.playbackSpeed")).toBe("slow");
        element(".kcq-battle-result__retry").click(); endTurn();
        b.paint(); b.paint(); expect(actors()).toHaveLength(4);
        vi.advanceTimersByTime(999); expect(actors()).toHaveLength(4);
        vi.advanceTimersByTime(1); expect(actors()).toHaveLength(5); expect(b.execute).toHaveBeenCalledTimes(2);
    });
    it.each(["victory", "defeat"] as const)("waits for the final displayed state before showing %s", outcome => {
        const b = mountBattle(undefined, outcome);
        // An earlier terminal snapshot must also wait for the rest of the returned sequence.
        b.frames[1]!.state.turn.outcome = outcome;
        endTurn(); expect(document.querySelector("[role=dialog]")).toBeNull();
        expect(b.onOutcome).toHaveBeenCalledWith(outcome); expect(b.onVictory).not.toHaveBeenCalled();
        b.paint(); b.paint(); expect(binding()).toBe(15); expect(document.querySelector("[role=dialog]")).toBeNull();
        vi.advanceTimersByTime(999); expect(document.querySelector("[role=dialog]")).toBeNull();
        vi.advanceTimersByTime(1); expect(binding()).toBe(36); expect(actors()).toHaveLength(3);
        expect(document.querySelector("[role=dialog]")).toBeNull();
        vi.advanceTimersByTime(499); expect(document.querySelector("[role=dialog]")).toBeNull();
        vi.advanceTimersByTime(1); expect(document.querySelector(".kcq-battle-result--" + outcome)).not.toBeNull();
        expect(b.onVictory).toHaveBeenCalledTimes(outcome === "victory" ? 1 : 0);
        expect(element(".kcq-battle-stage__background").hasAttribute("inert")).toBe(true);
        element(".kcq-battle-result__log").click();
        expect(document.querySelectorAll(".kcq-game-log__scroll [data-kind=move]")).toHaveLength(3);
        key("="); expect(b.execute).toHaveBeenCalledOnce();
    });
    it("presents a single lethal player move before opening victory", () => {
        const b = mountBattle(undefined, "victory", false, true);
        const initial = b.initial; const final = b.final;
        const frame: EventFrame = { state: final, event: { type: "useMove", actor: "ko", move: "telekinesis", effects: [], targets: [] } };
        b.execute.mockReturnValue({ success: true, actions: b.finalActions, frames: [frame] });
        vi.mocked(b.engine.getGameState).mockReturnValue(final);
        // The initial battle is already mounted; only the next engine result is terminal.
        expect(binding()).toBe(initial.characters[0]!.bindings[0]!.value);
        element(".kcq-party-card").click();
        element('.kcq-command-card[aria-label="Telekinesis"]').click();
        element("button.kcq-target-card").click();
        expect(element(".kcq-battle-stage").getAttribute("aria-busy")).toBe("true");
        expect(document.querySelector("[role=dialog]")).toBeNull();
        vi.advanceTimersByTime(500);
        expect(document.querySelector(".kcq-battle-result--victory")).not.toBeNull();
        expect(b.execute).toHaveBeenCalledExactlyOnceWith({ type: "move", actor: "ko", move: "telekinesis", targets: ["skunkette1"] });
        expect(b.onVictory).toHaveBeenCalledOnce();
    });
    it.each(["preparation", "playback", "outcome"])("cleans up %s work on unmount", phase => {
        const b = mountBattle(undefined, "victory"); endTurn();
        if (phase !== "preparation") { b.paint(); b.paint(); }
        if (phase === "outcome") vi.advanceTimersByTime(1000);
        const calls = b.scroll.mock.calls.length;
        unmount!(); unmount = undefined; expect(b.pending.size).toBe(0);
        b.paint(); vi.advanceTimersByTime(10000); expect(b.scroll).toHaveBeenCalledTimes(calls);
        expect(b.execute).toHaveBeenCalledOnce(); expect(b.onVictory).not.toHaveBeenCalled();
        expect(document.querySelector(".kcq-battle-stage")).toBeNull();
    });
});

describe("playback preference persistence", () => {
    it("defaults to Normal, reloads saved speeds, rejects invalid values and tolerates unavailable storage", () => {
        expect(createPlaybackSpeedPreference().value).toBe("normal");
        const preference = createPlaybackSpeedPreference(); preference.onChange("fast");
        expect(createPlaybackSpeedPreference().value).toBe("fast");
        preference.onChange("invalid" as PlaybackSpeed); expect(preference.value).toBe("fast");
        window.localStorage.setItem("kcq.playbackSpeed", "invalid"); expect(createPlaybackSpeedPreference().value).toBe("normal");
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
        const unavailable = createPlaybackSpeedPreference(); unavailable.onChange("slow"); expect(unavailable.value).toBe("slow");
    });
});
