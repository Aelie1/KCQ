import { batch, createComponent, createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventFrame, GameEvent } from "../../src/engine/public/types";
import { CombatReactionsContext, createCombatReactions } from "../../src/ui/web/app/combatReactions";
import { createCombatPlayback } from "../../src/ui/web/app/combatPlayback";
import { ProjectedMeter } from "../../src/ui/web/app/components/ProjectedMeter";
import { BattleOverviewPanel } from "../../src/ui/web/app/panels/BattleOverviewPanel";
import { battleOverviewFixture as fixture } from "../../src/ui/web/app/fixtures/battleOverview";

let dispose: (() => void) | undefined;
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
    dispose?.(); dispose = undefined;
    document.body.replaceChildren();
    vi.useRealTimers(); vi.restoreAllMocks();
});
function mount() {
    const initial = structuredClone(fixture.state);
    initial.enemies[0]!.intentions = [{ resolved: false, move: "pounce", effects: [], targets: [{ target: "ko", band: "hit", effects: [{ type: "binding", target: "ko", binding: "latexHead", amount: 15 }] }] }];
    initial.characters[0]!.buffs = [{ id: "guarded", duration: 3, severity: 1 }];
    let reactions!: ReturnType<typeof createCombatReactions>;
    let state!: () => typeof initial;
    let setState!: (value: typeof initial) => typeof initial;
    const host = document.createElement("div"); document.body.append(host);
    dispose = render(() => {
        [state, setState] = createSignal(initial);
        reactions = createCombatReactions();
        return createComponent(CombatReactionsContext.Provider, {
            value: reactions,
            get children() { return createComponent(BattleOverviewPanel, {
                get state() { return state(); },
                gameLogLines: 0, actions: fixture.actions, thresholds: fixture.thresholds, presentation: fixture.presentation,
            }); },
        });
    }, host);
    const present = (event: GameEvent, mutate?: (state: typeof initial) => void, instant = false) => {
        const after = structuredClone(state());
        mutate?.(after);
        const frames: EventFrame[] = [{ event, state: after }];
        batch(() => { reactions.present(frames, state(), instant); setState(after); });
    };
    return { reactions, state, present, host, initial };
}
const move = (amount = 5): GameEvent => ({ type: "useMove", actor: "skunkette1", move: "pounce", effects: [],
    targets: [{ target: "ko", result: "hit", effects: [{ type: "bondageChanged", target: "ko", binding: "latexHead", amount }] }] });
function element(selector: string) {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error("Missing " + selector);
    return element;
}

describe("combat reaction rendering and lifecycle", () => {
    it("restarts repeated actor actions on stable cards without flashing names or unrelated entities", () => {
        const b = mount();
        const enemy = element(".kcq-enemy-card");
        const name = element(".kcq-enemy-card__name");
        const otherEnemy = document.querySelectorAll<HTMLElement>(".kcq-enemy-card")[1]!;
        const party = element(".kcq-party-card");
        const reflow = vi.spyOn(enemy, "offsetWidth", "get");
        b.present(move());
        const firstSerial = b.reactions.matching("actor", "skunkette1")[0]!.serial;
        expect(enemy.style.animation).not.toBe("");
        expect(name.dataset.combatReaction).toBeUndefined();
        expect(name.style.animation).toBe("");
        expect(party.dataset.combatReaction).toBeUndefined();
        expect(party.style.animation).toBe("");
        expect(element(".kcq-party-card__name").dataset.combatReaction).toBeUndefined();
        expect(otherEnemy.dataset.combatReaction).toBeUndefined();
        vi.advanceTimersByTime(100);
        b.present(move());
        expect(b.reactions.matching("actor", "skunkette1").at(-1)!.serial).toBeGreaterThan(firstSerial);
        expect(reflow).toHaveBeenCalledTimes(2);
        expect(element(".kcq-enemy-card")).toBe(enemy);
        expect(element(".kcq-enemy-card__name")).toBe(name);
        expect(element(".kcq-party-card")).toBe(party);
        vi.advanceTimersByTime(250);
        expect(name.dataset.combatReaction).toBeUndefined();
    });
    it("keeps consecutive changed segments alive independently and preserves projections and numerical state", () => {
        const b = mount();
        const meter = element(".kcq-party-card [role=progressbar]");
        const initialValue = Number(meter.getAttribute("aria-valuenow"));
        b.present(move(5), state => { state.characters[0]!.bindings[0]!.value += 5; });
        const first = element(".kcq-binding-reaction");
        const firstAnimation = first.style.animation;
        const maximum = Number(meter.getAttribute("aria-valuemax"));
        expect(first.style.left).toBe(`${initialValue / maximum * 100}%`);
        expect(first.style.width).toBe(`${5 / maximum * 100}%`);
        expect(firstAnimation).toBe("kcq-react-binding-fade 2500ms linear 0ms forwards");
        expect(first.getAttribute("aria-hidden")).toBe("true");
        expect(meter.style.animation).toBe("");
        expect(Number(meter.getAttribute("aria-valuenow"))).toBe(initialValue + 5);
        expect(b.reactions.matching("binding", "ko", "latexHead")[0]).toMatchObject({ from: initialValue, to: initialValue + 5 });
        vi.advanceTimersByTime(500);
        b.present(move(3), state => { state.characters[0]!.bindings[0]!.value += 3; });
        const second = document.querySelectorAll<HTMLElement>(".kcq-party-card .kcq-binding-reaction")[1]!;
        expect(document.querySelectorAll(".kcq-party-card .kcq-binding-reaction")).toHaveLength(2);
        expect(second.style.left).toBe(`${(initialValue + 5) / maximum * 100}%`);
        expect(second.style.width).toBe(`${3 / maximum * 100}%`);
        expect(second.style.animation).toBe(firstAnimation);
        expect(first.style.animation).toBe(firstAnimation);
        expect(element(".kcq-binding-reaction")).toBe(first);
        expect(element(".kcq-party-card [role=progressbar]")).toBe(meter);
        expect(Number(meter.getAttribute("aria-valuenow"))).toBe(initialValue + 8);
        expect(document.querySelector(".kcq-binding-meter__change")).not.toBeNull();
        vi.advanceTimersByTime(1999);
        expect(first.isConnected).toBe(true);
        expect(first.style.animation).toBe(firstAnimation);
        vi.advanceTimersByTime(1);
        expect(first.isConnected).toBe(false);
        expect(element(".kcq-binding-reaction")).toBe(second);
        expect(second.style.animation).toBe(firstAnimation);
        b.present(move(-8), state => { state.characters[0]!.bindings[0]!.value -= 8; });
        const recovery = document.querySelectorAll<HTMLElement>(".kcq-party-card .kcq-binding-reaction")[1]!;
        expect(recovery.dataset.combatReaction).toBe("recovery");
        expect(recovery.style.animation).toBe(firstAnimation);
        expect(b.reactions.matching("binding", "ko", "latexHead").at(-1)).toMatchObject({
            treatment: "recovery", from: initialValue + 8, to: initialValue, duration: 2500,
        });
        expect(Number(meter.getAttribute("aria-valuenow"))).toBe(initialValue);
        vi.advanceTimersByTime(500);
        expect(second.isConnected).toBe(false);
        expect(element(".kcq-binding-reaction")).toBe(recovery);
        vi.advanceTimersByTime(1999);
        expect(recovery.isConnected).toBe(true);
        vi.advanceTimersByTime(1);
        expect(recovery.isConnected).toBe(false);
        expect(b.reactions.cues()).toEqual([]);
        expect(vi.getTimerCount()).toBe(0);
    });
    it("preserves a glow's animation timing when reactive meter geometry changes", () => {
        const [maximum, setMaximum] = createSignal(100);
        const host = document.createElement("div"); document.body.append(host);
        dispose = render(() => createComponent(ProjectedMeter, {
            value: 30, tone: "heavy", classPrefix: "kcq-binding-meter",
            get max() { return maximum(); },
            reactions: [{ kind: "binding", entity: "ko", treatment: "increase", from: 20, to: 30,
                serial: 1, started: Date.now(), duration: 2500 }],
        }), host);
        const glow = element(".kcq-binding-reaction");
        const animation = glow.style.animation;
        expect(glow.style.left).toBe("20%");
        expect(glow.style.width).toBe("10%");
        vi.advanceTimersByTime(750);
        setMaximum(200);
        expect(element(".kcq-binding-reaction")).toBe(glow);
        expect(glow.style.left).toBe("10%");
        expect(glow.style.width).toBe("5%");
        expect(glow.style.animation).toBe(animation);
    });
    it("keeps spatially overlapping hits on separate nodes without restarting earlier fades", () => {
        const b = mount();
        b.present(move(5));
        const first = element(".kcq-binding-reaction");
        const animation = first.style.animation;
        const firstCue = b.reactions.matching("binding", "ko", "latexHead")[0]!;
        vi.advanceTimersByTime(1000);
        b.present(move(5));
        const second = document.querySelectorAll<HTMLElement>(".kcq-party-card .kcq-binding-reaction")[1]!;
        const cues = b.reactions.matching("binding", "ko", "latexHead");
        expect(cues[0]).toBe(firstCue);
        expect(cues[1]!.started - firstCue.started).toBe(1000);
        expect(second.style.left).toBe(first.style.left);
        expect(second.style.width).toBe(first.style.width);
        expect(first.style.animation).toBe(animation);
        expect(second).not.toBe(first);
        vi.advanceTimersByTime(1500);
        expect(first.isConnected).toBe(false);
        expect(element(".kcq-binding-reaction")).toBe(second);
        expect(second.style.animation).toBe(animation);
        vi.advanceTimersByTime(999);
        expect(second.isConnected).toBe(true);
        vi.advanceTimersByTime(1);
        expect(second.isConnected).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
    });
    it("pulses explicit buff events, silently ticks duration on the same chip and removes gameplay buffs immediately", () => {
        const b = mount();
        const buff = element(".kcq-party-card__effects .kcq-status-chip");
        b.present({ type: "changePhase", phase: "player", effects: [{ type: "buffUpdated", target: "ko", buff: "guarded" }] },
            state => { state.characters[0]!.buffs[0]!.duration = 5; });
        expect(element(".kcq-party-card__effects .kcq-status-chip")).toBe(buff);
        expect(buff.dataset.combatReaction).toBe("updated");
        vi.advanceTimersByTime(1000);
        expect(buff.dataset.combatReaction).toBeUndefined();
        b.present({ type: "changePhase", phase: "enemy", effects: [] },
            state => { state.characters[0]!.buffs[0]!.duration = 4; });
        expect(element(".kcq-party-card__effects .kcq-status-chip")).toBe(buff);
        expect(buff.dataset.combatReaction).toBeUndefined();
        expect(b.reactions.matching("buff", "ko", "guarded")).toEqual([]);
        b.present({ type: "changePhase", phase: "player", effects: [{ type: "buffRemoved", target: "ko", buff: "guarded" }] },
            state => { state.characters[0]!.buffs = []; });
        expect(b.state().characters[0]!.buffs).toEqual([]);
        expect(buff.isConnected).toBe(false);
        const ghost = element(".kcq-buff-exit");
        expect(ghost.getAttribute("aria-hidden")).toBe("true");
        vi.advanceTimersByTime(350);
        expect(ghost.isConnected).toBe(false);
        b.present({ type: "changePhase", phase: "player", effects: [{ type: "buffAdded", target: "ko", buff: "guarded" }] },
            state => { state.characters[0]!.buffs = [{ id: "guarded", duration: 3, severity: 1 }]; });
        expect(element(".kcq-party-card__effects .kcq-status-chip").dataset.combatReaction).toBe("added");
    });
    it("updates HP immediately and gives damage and healing distinct local reactions", () => {
        const b = mount();
        const enemyId = b.initial.enemies[0]!.id;
        const hp = element(".kcq-enemy-card__hp");
        b.present({ type: "useMove", actor: "ko", move: "telekinesis", effects: [], targets: [
            { target: enemyId, result: "crit", effects: [{ type: "enemyDamaged", target: enemyId, amount: 10 }] },
        ] }, state => { state.enemies[0]!.currHp -= 10; });
        expect(hp.textContent).toContain(String(b.initial.enemies[0]!.currHp - 10));
        expect(hp.dataset.combatReaction).toBe("damage");
        expect(b.reactions.matching("hp", enemyId).at(-1)?.strength).toBe("crit");
        b.present({ type: "changePhase", phase: "enemy", effects: [{ type: "enemyHealed", target: enemyId, amount: 5 }] },
            state => { state.enemies[0]!.currHp += 5; });
        expect(element(".kcq-enemy-card__hp")).toBe(hp);
        expect(hp.dataset.combatReaction).toBe("healing");
        expect(hp.textContent).toContain(String(b.initial.enemies[0]!.currHp - 5));
    });
    it("Instant clears current effects and creates no delayed reactions, and unmount cancels outstanding work", () => {
        const b = mount();
        b.present(move());
        expect(vi.getTimerCount()).toBeGreaterThan(0);
        b.present(move(), undefined, true);
        expect(b.reactions.cues()).toEqual([]);
        expect(document.querySelector("[data-combat-reaction]")).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
        b.present(move());
        dispose!(); dispose = undefined;
        expect(vi.getTimerCount()).toBe(0);
        vi.advanceTimersByTime(5000);
        b.reactions.present([{ event: move(), state: b.initial }], b.initial);
        expect(b.reactions.cues()).toEqual([]);
    });
    it("cleans up a pending buff exit on unmount and skips exits for Instant removals", () => {
        const b = mount();
        const removal: GameEvent = { type: "changePhase", phase: "player", effects: [
            { type: "buffRemoved", target: "ko", buff: "guarded" },
        ] };
        b.present(removal, state => { state.characters[0]!.buffs = []; });
        const ghost = element(".kcq-buff-exit");
        dispose!(); dispose = undefined;
        expect(ghost.isConnected).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
        const instant = mount();
        instant.present(removal, state => { state.characters[0]!.buffs = []; }, true);
        expect(instant.state().characters[0]!.buffs).toEqual([]);
        expect(document.querySelector(".kcq-buff-exit")).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
    });
    it.each([250, 500, 1000])("lets playback at %sms finish while its final glows expire, with no queued publications", interval => {
        const host = document.createElement("div");
        const initial = structuredClone(fixture.state);
        let reactions!: ReturnType<typeof createCombatReactions>;
        let playback!: ReturnType<typeof createCombatPlayback>;
        const complete = vi.fn();
        dispose = render(() => {
            reactions = createCombatReactions();
            playback = createCombatPlayback({ interval: () => interval,
                present: frames => reactions.present(frames, initial), complete });
            return null;
        }, host);
        const frames = [move(), move()].map(event => ({ event, state: initial }));
        playback.start(frames, initial);
        vi.advanceTimersByTime(interval);
        expect(playback.active()).toBe(false);
        expect(complete).toHaveBeenCalledOnce();
        expect(reactions.matching("binding", "ko", "latexHead")).toHaveLength(2);
        vi.advanceTimersByTime(2499);
        expect(reactions.matching("binding", "ko", "latexHead")).toHaveLength(1);
        vi.advanceTimersByTime(1);
        expect(reactions.cues()).toEqual([]);
        expect(vi.getTimerCount()).toBe(0);
    });
});
