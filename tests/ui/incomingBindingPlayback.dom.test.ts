import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BattleApp } from "../../src/ui/web/app/BattleApp";
import { battleOverviewFixture } from "../../src/ui/web/app/fixtures/battleOverview";
import { createBattleOverviewViewModel } from "../../src/ui/web/app/viewModels/battleOverview";
import { getThresholds } from "../../src/engine/public/mechanics";
import { incomingBindingBattle } from "../helpers/incomingBindingBattle";

let unmount: (() => void) | undefined;
beforeEach(() => { vi.useFakeTimers(); window.localStorage.clear(); });
afterEach(() => {
    unmount?.(); unmount = undefined;
    document.body.replaceChildren();
    vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
    window.localStorage.clear();
});

function mount(options: Parameters<typeof incomingBindingBattle>[0] = {}, speed: "normal" | "instant" = "normal") {
    const battle = incomingBindingBattle(options);
    const pending = new Map<number, FrameRequestCallback>();
    let id = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { pending.set(++id, callback); return id; });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => pending.delete(id));
    vi.spyOn(HTMLElement.prototype, "scrollTo").mockImplementation(() => {});
    const host = document.createElement("div"); document.body.append(host);
    unmount = render(() => createComponent(BattleApp, {
        engine: battle.engine, presentation: battleOverviewFixture.presentation,
        playbackSpeed: { value: speed, onChange: vi.fn() }, overviewGameLog: { value: 8, onChange: vi.fn() },
    }), host);
    const paint = () => {
        const callbacks = [...pending.values()]; pending.clear();
        for (const callback of callbacks) callback(0);
    };
    const endTurn = () => document.querySelector<HTMLButtonElement>(".kcq-battle-overview__primary-action")!.click();
    return { ...battle, paint, endTurn };
}
function meters() {
    return [...document.querySelectorAll<HTMLElement>(".kcq-party-card [role=progressbar]")];
}
function expectMeters(expected: readonly (readonly [number, number | undefined])[]) {
    expect(meters()).toHaveLength(expected.length);
    meters().forEach((meter, index) => {
        const [current, change] = expected[index]!;
        expect(Number(meter.getAttribute("aria-valuenow"))).toBe(current);
        const overlay = meter.querySelector<HTMLElement>(".kcq-binding-meter__change");
        if (change) {
            expect(overlay).not.toBeNull();
            expect(parseFloat(overlay!.style.width.slice(5))).toBeCloseTo(change);
            expect(parseFloat(overlay!.style.left.slice(5))).toBeCloseTo(current);
        } else expect(overlay).toBeNull();
    });
}
function authoritativeMeters(battle: ReturnType<typeof incomingBindingBattle>) {
    return createBattleOverviewViewModel(battle.engine.getGameState(), battle.engine.getActionView(),
        getThresholds(), battleOverviewFixture.presentation).party[0]!.bindings
        .map(({ current, change }) => [current, change] as const);
}
const loggedActors = () => [...document.querySelectorAll<HTMLElement>(".kcq-compact-game-log [data-kind=move]")]
    .map(entry => entry.dataset.actor);

describe("BattleApp incoming binding playback", () => {
    it("recalculates both existing meters at each real-engine action and keeps the log in sync", () => {
        const b = mount();
        const originalMeters = meters();
        expectMeters([[72, 11], [35, 20]]);
        b.endTurn();
        expect(b.engine.getGameState().characters[0]!.bindings.map(binding => binding.value)).toEqual([84, 55]);
        expectMeters([[72, 11], [35, 20]]);
        b.paint(); expectMeters([[72, 11], [35, 20]]);
        b.paint(); expectMeters([[81, 3], [41, 14]]);
        expect(loggedActors()).toEqual(["skunkette1"]);
        vi.advanceTimersByTime(500); expectMeters([[83, 1], [51, 4]]);
        expect(loggedActors()).toEqual(["skunkette1", "skunk1"]);
        vi.advanceTimersByTime(500); expectMeters([[84, undefined], [55, undefined]]);
        expect(loggedActors()).toEqual(["skunkette1", "skunk1", "queen1"]);
        expectMeters(authoritativeMeters(b));
        meters().forEach((meter, index) => expect(meter).toBe(originalMeters[index]));
        expect(document.querySelector(".kcq-battle-stage")!.getAttribute("aria-busy")).toBe("false");
    });
    it("shows the new projection when an earlier action makes a pending attack miss", () => {
        const b = mount({ interruption: "miss" });
        expectMeters([[72, 11], [35, 20]]);
        b.endTurn(); b.paint(); b.paint();
        expectMeters([[81, 1], [41, 4]]);
        vi.advanceTimersByTime(500); expectMeters([[81, 1], [41, 4]]);
        expect(loggedActors()).toEqual(["skunkette1", "skunk1"]);
        vi.advanceTimersByTime(500); expectMeters([[82, undefined], [45, undefined]]);
        expectMeters(authoritativeMeters(b));
    });
    it.each([false, true])("Instant presents the authoritative final meters (next round intentions: %s)", nextRound => {
        const b = mount({ nextRound }, "instant");
        b.endTurn();
        expectMeters(nextRound ? [[84, 4], [55, 20]] : [[84, undefined], [55, undefined]]);
        expectMeters(authoritativeMeters(b));
        expect(loggedActors()).toEqual(["skunkette1", "skunk1", "queen1"]);
        expect(document.querySelector(".kcq-battle-stage")!.getAttribute("aria-busy")).toBe("false");
    });
});
