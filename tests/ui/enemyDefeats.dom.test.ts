import { readFileSync } from "node:fs";
import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventFrame, GameState, HitBand } from "../../src/engine/public/types";
import { createStockEngine } from "../../src/stock";
import { BattleApp } from "../../src/ui/web/app/BattleApp";
import { battleOverviewFixture as fixture } from "../../src/ui/web/app/fixtures/battleOverview";
import { targetingFixtures } from "../../src/ui/web/app/fixtures/targeting";
import { createPlaybackSpeedPreference, type PlaybackSpeed } from "../../src/ui/web/app/playbackSpeed";

let unmount: (() => void) | undefined;
beforeEach(() => { vi.useFakeTimers(); window.localStorage.clear(); });
afterEach(() => {
    unmount?.(); unmount = undefined;
    document.body.replaceChildren();
    vi.useRealTimers(); vi.restoreAllMocks(); window.localStorage.clear();
});

function mount(options: { speed?: PlaybackSpeed; bands?: HitBand[][]; victory?: boolean; playerMove?: boolean; defeated?: boolean } = {}) {
    const initial: GameState = structuredClone(fixture.state);
    initial.turn.phase = "player";
    if (options.victory) initial.enemies = initial.enemies.slice(0, options.bands?.length ?? 1);
    const ids = initial.enemies.slice(0, options.bands?.length ?? 1).map(enemy => enemy.id);
    const final = structuredClone(initial);
    final.enemies = final.enemies.filter(enemy => !ids.includes(enemy.id));
    if (options.victory) final.turn.outcome = "victory";
    const frame: EventFrame = { state: final, event: {
        type: "useMove", actor: options.playerMove ? "ko" : ids[0]!, move: "telekinesis", effects: [],
        targets: ids.flatMap((target, index) => (options.bands?.[index] ?? ["hit"]).map((result, hit, bands) => ({
            target, result, effects: [
                { type: "enemyDamaged" as const, target, amount: 14 },
                ...(hit === bands.length - 1 && options.defeated !== false ? [{ type: "enemyDefeated" as const, target }] : []),
            ],
        }))),
    } };
    const engine = createStockEngine(12345);
    const actions = fixture.actions.map(action => options.playerMove && action.id === "ko"
        ? { ...action, moves: [targetingFixtures.telekinesisChoose.action] } : action);
    vi.spyOn(engine, "getGameState").mockReturnValue(initial);
    vi.spyOn(engine, "getActionView").mockReturnValue(actions);
    const frames = [frame];
    const execute = vi.spyOn(engine, "executeAction").mockImplementation(() => {
        vi.mocked(engine.getGameState).mockReturnValue(final);
        return { success: true, frames, actions: fixture.actions.map(action => ({ ...action, available: false })) };
    });
    const preference = createPlaybackSpeedPreference(); preference.onChange(options.speed ?? "normal");
    const onVictory = vi.fn();
    const host = document.createElement("div"); document.body.append(host);
    unmount = render(() => createComponent(BattleApp, { engine, presentation: fixture.presentation,
        playbackSpeed: preference, onVictory, overviewGameLog: { value: 0, onChange: vi.fn() } }), host);
    return { initial, final, frame, frames, ids, engine, execute, preference, onVictory,
        kill() {
            if (options.playerMove) {
                element(".kcq-party-card").click();
                element('.kcq-command-card[aria-label="Telekinesis"]').click();
                element("button.kcq-target-card").click();
            } else element(".kcq-battle-overview__primary-action").click();
        },
    };
}
function element(selector: string): HTMLElement {
    const found = document.querySelector<HTMLElement>(selector);
    if (!found) throw new Error("Missing " + selector);
    return found;
}
const cards = () => [...document.querySelectorAll<HTMLElement>(".kcq-enemy-card")];
const numbers = (card: HTMLElement) => [...card.querySelectorAll<HTMLElement>(".kcq-hp-reaction")];
const busy = () => element(".kcq-battle-stage").getAttribute("aria-busy");

describe("enemy defeat presentation", () => {
    it("retains the same card and geometry through staggered damage, 500ms glow and 500ms fade", () => {
        const b = mount({ bands: [["hit", "hit", "hit"]] });
        const original = cards(); const dead = original[0]!;
        const slot = dead.parentElement!;
        vi.spyOn(slot, "offsetHeight", "get").mockReturnValue(112);
        const snapshot = structuredClone(b.final);
        const hp = dead.querySelector(".kcq-enemy-card__hp")!.textContent;
        b.kill();
        expect(cards()).toEqual(original);
        expect(dead.querySelector(".kcq-enemy-card__hp")!.textContent).toBe(hp);
        expect(b.engine.getGameState()).toEqual(snapshot);
        expect(slot.style.height).toBe("112px");
        expect(numbers(dead).map(number => number.textContent)).toEqual(["-14", "-14", "-14"]);
        expect(numbers(dead).map(number => number.style.getPropertyValue("--kcq-hp-reaction-delay"))).toEqual(["0ms", "180ms", "360ms"]);
        expect(numbers(dead).map(number => number.style.getPropertyValue("--float-x"))).toEqual(["-8px", "8px", "-16px"]);
        expect(dead.style.getPropertyValue("--kcq-death-glow-delay")).toBe("360ms");
        expect(dead.style.getPropertyValue("--kcq-death-fade-delay")).toBe("860ms");
        expect(dead.dataset.combatActor).toBe("actor");
        expect(dead.dataset.enemyDefeat).toBe("true");
        expect(dead.hasAttribute("inert")).toBe(true);
        expect(dead.hasAttribute("role")).toBe(false);
        expect(dead.hasAttribute("tabindex")).toBe(false);
        expect(dead.hasAttribute("data-kcq-shortcut")).toBe(false);
        dead.click(); dead.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        expect(document.querySelector(".kcq-enemy-details")).toBeNull();
        expect(b.execute).toHaveBeenCalledOnce();
        vi.advanceTimersByTime(360);
        expect(dead.style.getPropertyValue("--kcq-death-glow-delay")).toBe("360ms");
        expect(cards()).toEqual(original); expect(busy()).toBe("true");
        vi.advanceTimersByTime(500); expect(dead.isConnected).toBe(true);
        // Actor expiry must not reset the death timeline.
        expect(dead.style.getPropertyValue("--kcq-death-glow-delay")).toBe("360ms");
        vi.advanceTimersByTime(499); expect(dead.isConnected).toBe(true);
        vi.advanceTimersByTime(1); expect(dead.isConnected).toBe(false);
        expect(cards()).toEqual(original.slice(1)); expect(busy()).toBe("false");
        expect(b.engine.getGameState()).toEqual(snapshot);
        original[1]!.click(); expect(document.querySelector(".kcq-enemy-details")).not.toBeNull();
    });

    it("starts with the killing number despite an earlier critical number and retains the latest presentation", () => {
        const b = mount({ victory: true });
        const previous = structuredClone(b.initial);
        previous.enemies[0]!.currHp = 7;
        b.frames.unshift({ state: previous, event: {
            type: "useMove", actor: "ko", move: "telekinesis", effects: [],
            targets: [{ target: b.ids[0]!, result: "crit", effects: [
                { type: "enemyDamaged", target: b.ids[0]!, amount: 14 },
            ] }],
        } });
        b.kill(); const dead = cards()[0]!;
        expect(dead.dataset.enemyDefeat).toBeUndefined();
        vi.advanceTimersByTime(500);
        expect(cards()[0]).toBe(dead);
        expect(dead.querySelector(".kcq-enemy-card__hp")!.textContent).toContain("7 /");
        expect(dead.style.getPropertyValue("--kcq-death-glow-delay")).toBe("0ms");
        expect(numbers(dead).map(number => number.textContent)).toEqual(["-14!", "-14"]);
        vi.advanceTimersByTime(999); expect(dead.isConnected).toBe(true);
        expect(document.querySelector("[role=dialog]")).toBeNull();
        vi.advanceTimersByTime(1); expect(dead.isConnected).toBe(false);
        expect(b.onVictory).toHaveBeenCalledOnce();
    });

    it("plays a defeat without damage feedback directly for 1000ms", () => {
        const b = mount({ victory: true });
        b.frame.event = { type: "changePhase", phase: "player", effects: [
            { type: "enemyDefeated", target: b.ids[0]! },
        ] };
        b.kill(); const dead = cards()[0]!;
        expect(dead.style.getPropertyValue("--kcq-death-glow-delay")).toBe("0ms");
        expect(numbers(dead)).toHaveLength(0);
        vi.advanceTimersByTime(999); expect(dead.isConnected).toBe(true);
        vi.advanceTimersByTime(1); expect(dead.isConnected).toBe(false);
        expect(b.onVictory).toHaveBeenCalledOnce();
    });

    it("animates simultaneous defeats independently and holds their cells until both finish", () => {
        const b = mount({ bands: [["hit"], ["crit", "crit"]] });
        const original = cards(); const first = original[0]!; const second = original[1]!;
        const firstSlot = first.parentElement!;
        vi.spyOn(firstSlot, "offsetHeight", "get").mockReturnValue(100);
        b.kill();
        expect(first.style.getPropertyValue("--kcq-death-glow-delay")).toBe("0ms");
        expect(second.style.getPropertyValue("--kcq-death-glow-delay")).toBe("180ms");
        expect(numbers(second).map(number => number.textContent)).toEqual(["-14!", "-14!"]);
        expect(numbers(second).every(number => number.dataset.hitStrength === "crit")).toBe(true);
        vi.advanceTimersByTime(1000);
        expect(first.isConnected).toBe(false); expect(second.isConnected).toBe(true);
        expect(firstSlot.isConnected).toBe(true); expect(firstSlot.style.height).toBe("100px");
        expect(firstSlot.children).toHaveLength(0);
        expect(second.parentElement!.previousElementSibling).toBe(firstSlot);
        expect(busy()).toBe("true");
        vi.advanceTimersByTime(179); expect(second.isConnected).toBe(true);
        vi.advanceTimersByTime(1); expect(second.isConnected).toBe(false);
        expect(firstSlot.isConnected).toBe(false); expect(cards()).toEqual(original.slice(2));
        expect(busy()).toBe("false");
    });

    it.each(["fast", "normal", "slow"] as const)("holds final-enemy victory through the killing-hit glow and fade at %s speed", speed => {
        const b = mount({ speed, bands: [["crit"]], victory: true, playerMove: true });
        b.kill();
        const dead = cards()[0]!;
        expect(dead).toBeDefined(); expect(numbers(dead)[0]!.textContent).toBe("-14!");
        expect(document.querySelector("[role=dialog]")).toBeNull(); expect(b.onVictory).not.toHaveBeenCalled();
        vi.advanceTimersByTime(999);
        expect(dead.isConnected).toBe(true); expect(b.onVictory).not.toHaveBeenCalled();
        expect(document.querySelector("[role=dialog]")).toBeNull();
        vi.advanceTimersByTime(1);
        expect(cards()).toHaveLength(0); expect(element(".kcq-battle-result--victory")).toBeDefined();
        expect(b.onVictory).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    });

    it("skips retention, reactions and all defeat timers in Instant playback", () => {
        const b = mount({ speed: "instant", victory: true, bands: [["crit"], ["hit"]] });
        b.kill();
        expect(cards()).toHaveLength(0); expect(document.querySelector(".kcq-hp-reaction")).toBeNull();
        expect(document.querySelector(".kcq-enemy-presentation-slot")).toBeNull();
        expect(element(".kcq-battle-result--victory")).toBeDefined(); expect(b.onVictory).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    });

    it("cancels an in-progress defeat when switching to Instant", () => {
        const b = mount({ victory: true }); b.kill(); vi.advanceTimersByTime(600);
        b.preference.onChange("instant");
        expect(cards()).toHaveLength(0); expect(b.onVictory).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    });

    it.each([100, 600, 900])("cancels pending timers on unmount at %sms without publishing victory", elapsed => {
        const b = mount({ victory: true }); b.kill(); vi.advanceTimersByTime(elapsed);
        unmount!(); unmount = undefined;
        expect(vi.getTimerCount()).toBe(0); vi.advanceTimersByTime(10000);
        expect(b.onVictory).not.toHaveBeenCalled(); expect(cards()).toHaveLength(0);
    });

    it("does not infer defeat from enemies disappearing without an enemyDefeated event", () => {
        const b = mount({ defeated: false }); const dead = cards()[0]!; b.kill();
        expect(dead.isConnected).toBe(false); expect(document.querySelector("[data-enemy-defeat]")).toBeNull();
        expect(busy()).toBe("false");
    });

    it("uses separate full-card glow and fade animations without transform or geometry changes", () => {
        const css = readFileSync("src/ui/web/app/app.css", "utf8");
        const rule = css.match(/\.kcq-enemy-card\[data-enemy-defeat\]\s*\{([^}]+)\}/)![1]!;
        expect(rule).toContain("var(--kcq-react-actor, none)");
        expect(rule).toContain("kcq-enemy-defeat-glow"); expect(rule).toContain("kcq-enemy-defeat-fade");
        expect(rule).toContain("forwards !important");
        const animations = css.slice(css.indexOf("@keyframes kcq-enemy-defeat-glow"), css.indexOf("@keyframes kcq-react-actor"));
        expect(animations).toContain("background-color: #ff2424cc"); expect(animations).toContain("box-shadow:");
        expect(animations).toContain("to { opacity: 0; }");
        expect(animations).not.toMatch(/transform|height|width|scale/);
    });
});
