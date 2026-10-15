import { batch, createComponent, createSignal } from "solid-js";
import { readFileSync } from "node:fs";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventFrame, GameEvent, ThresholdInfo } from "../../src/engine/public/types";
import { CombatReactionsContext, createCombatReactions } from "../../src/ui/web/app/combatReactions";
import { createCombatPlayback } from "../../src/ui/web/app/combatPlayback";
import { ProjectedMeter } from "../../src/ui/web/app/components/ProjectedMeter";
import { BindingMeter } from "../../src/ui/web/app/components/BindingMeter";
import { BattleOverviewPanel } from "../../src/ui/web/app/panels/BattleOverviewPanel";
import { battleOverviewFixture as fixture } from "../../src/ui/web/app/fixtures/battleOverview";

let dispose: (() => void) | undefined;
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
    dispose?.(); dispose = undefined;
    document.body.replaceChildren();
    vi.useRealTimers(); vi.restoreAllMocks();
});
function mount(includeOtherMeters = false, thresholds: ThresholdInfo = fixture.thresholds) {
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
            get children() { return [createComponent(BattleOverviewPanel, {
                get state() { return state(); },
                gameLogLines: 0, actions: fixture.actions, thresholds, presentation: fixture.presentation,
            }), ...(includeOtherMeters ? (["standard", "compact"] as const).map(size => createComponent(BindingMeter, {
                entityId: "ko", bindingId: "latexHead", size, ariaLabel: "Other " + size + " meter",
                get value() { return state().characters[0]!.bindings[0]!.value; }, max: 100, level: "severe",
            })) : [])]; },
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
        const firstNumber = element(".kcq-binding-float");
        const numberAnimation = firstNumber.style.animation;
        expect(firstNumber.textContent).toBe("+5");
        expect(numberAnimation).toBe("kcq-react-hp-float 2000ms ease-out 0ms forwards");
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
        const secondNumber = document.querySelectorAll<HTMLElement>(".kcq-binding-float")[1]!;
        expect(secondNumber.textContent).toBe("+3");
        expect(element(".kcq-binding-float")).toBe(firstNumber);
        expect(firstNumber.style.animation).toBe(numberAnimation);
        expect(secondNumber.style.animation).toBe(numberAnimation);
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
        expect(firstNumber.isConnected).toBe(true);
        expect(first.style.animation).toBe(firstAnimation);
        vi.advanceTimersByTime(1);
        expect(first.isConnected).toBe(false);
        expect(firstNumber.isConnected).toBe(false);
        expect(element(".kcq-binding-float")).toBe(secondNumber);
        expect(secondNumber.style.animation).toBe(numberAnimation);
        expect(element(".kcq-binding-reaction")).toBe(second);
        expect(second.style.animation).toBe(firstAnimation);
        b.present(move(-8), state => { state.characters[0]!.bindings[0]!.value -= 8; });
        const recovery = document.querySelectorAll<HTMLElement>(".kcq-party-card .kcq-binding-reaction")[1]!;
        const recoveryNumber = document.querySelectorAll<HTMLElement>(".kcq-binding-float")[1]!;
        expect(recoveryNumber.textContent).toBe("−8");
        expect(recoveryNumber.dataset.combatReaction).toBe("recovery");
        expect(recovery.dataset.combatReaction).toBe("recovery");
        expect(recovery.style.animation).toBe(firstAnimation);
        expect(b.reactions.matching("binding", "ko", "latexHead").at(-1)).toMatchObject({
            treatment: "recovery", from: initialValue + 8, to: initialValue, duration: 2500,
        });
        expect(Number(meter.getAttribute("aria-valuenow"))).toBe(initialValue);
        vi.advanceTimersByTime(500);
        expect(second.isConnected).toBe(false);
        expect(secondNumber.isConnected).toBe(false);
        expect(element(".kcq-binding-float")).toBe(recoveryNumber);
        expect(element(".kcq-binding-reaction")).toBe(recovery);
        vi.advanceTimersByTime(1999);
        expect(recovery.isConnected).toBe(true);
        vi.advanceTimersByTime(1);
        expect(recovery.isConnected).toBe(false);
        expect(recoveryNumber.isConnected).toBe(false);
        expect(b.reactions.cues()).toEqual([]);
        expect(vi.getTimerCount()).toBe(0);
    });
    it.each(["graze", "hit", "crit"] as const)("matches HP %s numbers at each binding bar's top center", band => {
        const css = readFileSync("src/ui/web/app/app.css", "utf8");
        const style = document.createElement("style"); style.textContent = readFileSync("src/ui/web/app/tokens.css", "utf8") + css; document.body.append(style);
        const b = mount();
        const enemyId = b.initial.enemies[0]!.id;
        b.present({ type: "useMove", actor: "skunkette1", move: "pounce", effects: [], targets: [
            { target: "ko", result: band, effects: [{ type: "bondageChanged", target: "ko", binding: "latexHead", amount: 15 }] },
            { target: enemyId, result: band, effects: [{ type: "enemyDamaged", target: enemyId, amount: 15 }] },
        ] });
        const number = element(".kcq-binding-float");
        const hpNumber = element(".kcq-hp-reaction");
        expect(number.dataset.hitStrength).toBe(band);
        const reference = document.createElement("span");
        reference.className = "kcq-character-binding__level--severe"; document.body.append(reference);
        expect(getComputedStyle(number).color).toBe(getComputedStyle(reference).color);
        expect(getComputedStyle(number).color).not.toBe(getComputedStyle(hpNumber).color);
        expect(number.textContent).toBe(band === "crit" ? "+15!" : "+15");
        expect(hpNumber.textContent).toBe(band === "crit" ? "-15!" : "-15");
        for (const property of ["font-size", "font-weight", "text-shadow", "animation-name", "animation-duration", "animation-timing-function"]) {
            expect(getComputedStyle(number).getPropertyValue(property), property)
                .toBe(getComputedStyle(hpNumber).getPropertyValue(property));
        }
        expect(getComputedStyle(number).fontSize).toBe(band === "graze" ? "12px" : "16px");
        expect(number.style.animation).toBe("kcq-react-hp-float 2000ms ease-out 0ms forwards");
        if (band === "crit") expect(getComputedStyle(number).animationName).toBe("kcq-react-hp-crit");
        expect(number.style.getPropertyValue("--float-x")).toBe(hpNumber.style.getPropertyValue("--float-x"));
        expect(number.style.getPropertyValue("--float-y")).toBe(hpNumber.style.getPropertyValue("--float-y"));
        expect(number.style.getPropertyValue("--float-x")).toBe("-8px");
        expect(number.style.getPropertyValue("--float-y")).toBe("-25px");
        expect(getComputedStyle(number).left).toBe("50%");
        expect(getComputedStyle(number).top).toBe("0px");
        expect(number.parentElement).toBe(element(".kcq-party-card .kcq-binding-meter"));
        expect(element(".kcq-binding-reaction").style.animation).toBe("kcq-react-binding-fade 2500ms linear 0ms forwards");
        const lifetime = band === "crit" ? 3000 : 2500;
        vi.advanceTimersByTime(lifetime - 1);
        expect(number.isConnected).toBe(true);
        vi.advanceTimersByTime(1);
        expect(number.isConnected).toBe(false);
        // Apply the reduced-motion declarations to verify their cascade even for crits.
        b.present(move(15));
        const reducedStyle = document.createElement("style");
        const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"), css.indexOf("/* Campaign reference browser"));
        reducedStyle.textContent = reduced.replace("@media (prefers-reduced-motion: reduce) {", "").replace(/\}\s*$/, "");
        document.body.append(reducedStyle);
        expect(getComputedStyle(hpNumber).animation).toContain("kcq-react-binding-fade");
        if (band === "crit") expect(getComputedStyle(hpNumber).animationName).toBe("kcq-react-binding-fade");
        // Mount another number of the same strength under the active declarations.
        const event: GameEvent = { type: "useMove", actor: "skunkette1", move: "pounce", effects: [], targets: [
            { target: "ko", result: band, effects: [{ type: "bondageChanged", target: "ko", binding: "latexArms", amount: 3 }] },
        ] };
        b.present(event);
        const reducedNumber = document.querySelectorAll<HTMLElement>(".kcq-binding-float")[1]!;
        expect(reducedNumber.dataset.hitStrength).toBe(band);
        expect(getComputedStyle(reducedNumber).animation).toContain("kcq-react-binding-fade 2000ms");
        if (band === "crit") {
            expect(getComputedStyle(reducedNumber).animationName).toBe("kcq-react-binding-fade");
            expect(getComputedStyle(reducedNumber).animationDuration).toBe("2000ms");
        }
    });
    it("lets staggered critical numbers finish independently without extending their segment glows", () => {
        const b = mount();
        b.present({ type: "useMove", actor: "skunkette1", move: "pounce", effects: [], targets: [
            { target: "ko", result: "crit", effects: Array.from({ length: 6 }, () => ({
                type: "bondageChanged" as const, target: "ko", binding: "latexHead", amount: 1,
            })) },
        ] });
        const numbers = [...document.querySelectorAll<HTMLElement>(".kcq-binding-float")];
        const animations = numbers.map(number => number.style.animation);
        expect(numbers).toHaveLength(6);
        expect(animations).toEqual([0, 180, 360, 540, 720, 900].map(delay =>
            "kcq-react-hp-float 2000ms ease-out " + delay + "ms forwards"));
        expect(b.reactions.matching("binding", "ko", "latexHead").map(cue => cue.duration))
            .toEqual([3000, 3180, 3360, 3540, 3720, 3900]);
        const glows = [...document.querySelectorAll<HTMLElement>(".kcq-binding-reaction")];
        expect(glows.every(glow => glow.style.animation === "kcq-react-binding-fade 2500ms linear 0ms forwards")).toBe(true);
        vi.advanceTimersByTime(3000);
        expect(numbers[0]!.isConnected).toBe(false);
        expect(numbers.slice(1).every(number => number.isConnected)).toBe(true);
        expect(numbers[1]!.style.animation).toBe(animations[1]);
        vi.advanceTimersByTime(180);
        expect(numbers[1]!.isConnected).toBe(false);
        expect(numbers[2]!.isConnected).toBe(true);
        vi.advanceTimersByTime(720);
        expect(numbers.every(number => !number.isConnected)).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
    });
    it("keeps recovery unaccented and colored by its after level even within a critical attack", () => {
        const b = mount();
        b.present({ type: "useMove", actor: "ko", move: "telekinesis", effects: [], targets: [
            { target: "ko", result: "crit", effects: [{ type: "bondageChanged", target: "ko", binding: "latexHead", amount: -12 }] },
        ] });
        const number = element(".kcq-binding-float");
        expect(number.textContent).toBe("\u221212");
        expect(number.dataset.combatReaction).toBe("recovery");
        expect(number.dataset.bindingLevel).toBe("severe");
        expect(number.dataset.hitStrength).toBeUndefined();
        expect(b.reactions.matching("binding", "ko", "latexHead")[0]!.duration).toBe(2500);
    });
    it.each([
        [0, "none"], [10, "light"], [25, "moderate"], [40, "heavy"],
        [55, "severe"], [75, "overwhelming"], [100, "max"],
    ] as const)("uses the %s after-value color (%s) for signed changes", (after, level) => {
        const style = document.createElement("style");
        style.textContent = readFileSync("src/ui/web/app/tokens.css", "utf8") + readFileSync("src/ui/web/app/app.css", "utf8");
        document.body.append(style);
        const b = mount();
        const reference = document.createElement("span");
        reference.className = "kcq-character-binding__level--" + level;
        document.body.append(reference);
        for (const amount of after === 0 ? [-5] : [5, -5]) {
            b.present({ type: "useMove", actor: "skunkette1", move: "pounce", effects: [], targets: [
                { target: "ko", result: "crit", effects: [{ type: "bondageChanged", target: "ko", binding: "latexHead", amount }] },
            ] }, state => { state.characters[0]!.bindings[0]!.value = after; });
            const number = [...document.querySelectorAll<HTMLElement>(".kcq-binding-float")].at(-1)!;
            expect(number.dataset.bindingLevel).toBe(level);
            expect(number.textContent).toBe(amount > 0 ? "+5!" : "\u22125");
            expect(getComputedStyle(number).color).not.toBe("");
            expect(getComputedStyle(number).color).toBe(getComputedStyle(reference).color);
        }
    });
    it("preserves each cue's after-level color across consecutive threshold crossings", () => {
        const b = mount();
        b.present(move(5), state => { state.characters[0]!.bindings[0]!.value += 5; });
        const first = element(".kcq-binding-float");
        const animation = first.style.animation;
        expect(first.dataset.bindingLevel).toBe("overwhelming");
        vi.advanceTimersByTime(500);
        b.present(move(-40), state => { state.characters[0]!.bindings[0]!.value -= 40; });
        const second = document.querySelectorAll<HTMLElement>(".kcq-binding-float")[1]!;
        expect(first.dataset.bindingLevel).toBe("overwhelming");
        expect(first.textContent).toBe("+5");
        expect(first.style.animation).toBe(animation);
        expect(second.dataset.bindingLevel).toBe("moderate");
        expect(second.textContent).toBe("\u221240");
    });
    it("uses the overview's configured thresholds for after-value colors", () => {
        const b = mount(false, { ...fixture.thresholds, thresholds: { ...fixture.thresholds.thresholds, heavy: 30 } });
        b.present(move(5), state => { state.characters[0]!.bindings[0]!.value = 30; });
        expect(element(".kcq-binding-float").textContent).toBe("+5");
        expect(element(".kcq-binding-float").dataset.bindingLevel).toBe("heavy");
    });
    it("places signed cue deltas above only the corresponding party binding bars", () => {
        const b = mount();
        const cards = document.querySelectorAll<HTMLElement>(".kcq-party-card");
        const koMeters = cards[0]!.querySelectorAll<HTMLElement>(".kcq-binding-meter");
        const matsukoMeters = cards[1]!.querySelectorAll<HTMLElement>(".kcq-binding-meter");
        b.present({ type: "changePhase", phase: "enemy", effects: [
            { type: "bondageChanged", target: "ko", binding: "latexHead", amount: 15 },
            { type: "bondageChanged", target: "ko", binding: "latexArms", amount: -12 },
            { type: "bondageAdded", target: "matsuko", binding: "latexHead", amount: 7 },
            { type: "bondageChanged", target: "ko", binding: "latexLegs", amount: 0 },
        ] }, state => {
            state.characters[0]!.bindings[0]!.value += 15;
            state.characters[0]!.bindings[1]!.value -= 12;
            state.characters[1]!.bindings[0]!.value += 7;
        });
        const numbers = [...document.querySelectorAll<HTMLElement>(".kcq-binding-float")];
        expect(numbers.map(number => number.textContent)).toEqual(["+15", "−12", "+7"]);
        expect(numbers.map(number => number.parentElement)).toEqual([koMeters[0], koMeters[1], matsukoMeters[0]]);
        expect(numbers.map(number => number.dataset.combatReaction)).toEqual(["increase", "recovery", "increase"]);
        expect(numbers.every(number => number.getAttribute("aria-hidden") === "true")).toBe(true);
        expect(koMeters[3]!.querySelector(".kcq-binding-float")).toBeNull();
        expect(cards[2]!.querySelector(".kcq-binding-float")).toBeNull();
        expect(document.querySelector(".kcq-enemy-card .kcq-binding-float")).toBeNull();
    });
    it("renders simultaneous deltas independently even when their net change is zero", () => {
        const b = mount();
        const meter = element(".kcq-party-card .kcq-binding-meter");
        const value = meter.getAttribute("aria-valuenow");
        b.present({ type: "changePhase", phase: "enemy", effects: [
            { type: "bondageChanged", target: "ko", binding: "latexHead", amount: 15 },
            { type: "bondageChanged", target: "ko", binding: "latexHead", amount: -15 },
        ] });
        const numbers = [...meter.querySelectorAll<HTMLElement>(".kcq-binding-float")];
        expect(numbers.map(number => number.textContent)).toEqual(["+15", "−15"]);
        expect(numbers.map(number => number.dataset.bindingLevel)).toEqual(["overwhelming", "severe"]);
        expect(numbers[0]).not.toBe(numbers[1]);
        expect(numbers[0]!.style.getPropertyValue("--float-x")).not.toBe(numbers[1]!.style.getPropertyValue("--float-x"));
        expect(meter.querySelectorAll(".kcq-binding-reaction")).toHaveLength(2);
        expect(meter.getAttribute("aria-valuenow")).toBe(value);
        // Numbers share cue cleanup with the glows, without adding timers.
        expect(vi.getTimerCount()).toBe(2);
        vi.advanceTimersByTime(2500);
        expect(numbers.every(number => !number.isConnected)).toBe(true);
        expect(meter.querySelector(".kcq-binding-reaction")).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
    });
    it("retains the number on the persistent overview meter when a binding is removed at zero", () => {
        const b = mount();
        const meter = element(".kcq-party-card .kcq-binding-meter");
        const value = b.initial.characters[0]!.bindings[0]!.value;
        b.present({ type: "changePhase", phase: "player", effects: [
            { type: "bondageRemoved", target: "ko", binding: "latexHead", amount: -value },
        ] }, state => { state.characters[0]!.bindings = state.characters[0]!.bindings.filter(binding => binding.id !== "latexHead"); });
        const number = element(".kcq-binding-float");
        expect(number.textContent).toBe("−" + value);
        expect(number.parentElement).toBe(meter);
        expect(element(".kcq-party-card .kcq-binding-meter")).toBe(meter);
        expect(meter.getAttribute("aria-valuenow")).toBe("0");
        expect(meter.querySelector<HTMLElement>(".kcq-binding-meter__value")!.style.width).toBe("0%");
        expect(meter.querySelector(".kcq-binding-reaction")).not.toBeNull();
        vi.advanceTimersByTime(2500);
        expect(number.isConnected).toBe(false);
        expect(meter.isConnected).toBe(true);
    });
    it("does not float state-only or zero changes, or opt other meter consumers in", () => {
        const b = mount(true);
        b.present({ type: "changePhase", phase: "player", effects: [
            { type: "bondageChanged", target: "ko", binding: "latexHead", amount: 0 },
        ] }, state => { state.characters[0]!.bindings[0]!.value += 1; });
        expect(document.querySelector(".kcq-binding-float")).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
        b.present(move(15), state => { state.characters[0]!.bindings[0]!.value += 15; });
        expect(element(".kcq-binding-float").textContent).toBe("+15");
        expect(document.querySelectorAll(".kcq-binding-float")).toHaveLength(1);
        for (const size of ["standard", "compact"]) {
            const meter = element('[aria-label="Other ' + size + ' meter"]');
            expect(meter.querySelector(".kcq-binding-reaction")).not.toBeNull();
            expect(meter.querySelector(".kcq-binding-float")).toBeNull();
        }
    });
    it("keeps floating binding numbers outside clipping and uses a stationary fade for reduced motion", () => {
        const css = readFileSync("src/ui/web/app/app.css", "utf8");
        const style = document.createElement("style"); style.textContent = css; document.body.append(style);
        const b = mount();
        b.present(move());
        const number = element(".kcq-binding-float");
        const meter = number.parentElement!;
        expect(getComputedStyle(number).position).toBe("absolute");
        expect(getComputedStyle(number).pointerEvents).toBe("none");
        expect(getComputedStyle(number).left).toBe("50%");
        expect(getComputedStyle(number).top).toBe("0px");
        expect(getComputedStyle(meter).position).toBe("relative");
        expect(getComputedStyle(meter).overflow).toBe("visible");
        expect(getComputedStyle(element(".kcq-party-card__bindings")).overflow).toBe("visible");
        expect(getComputedStyle(element(".kcq-party-card")).overflow).toBe("visible");
        const clip = meter.querySelector<HTMLElement>(".kcq-binding-meter__fill-clip")!;
        expect(getComputedStyle(clip).overflow).toBe("hidden");
        expect(clip.contains(number)).toBe(false);
        const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
        expect(reduced).toMatch(/\.kcq-binding-float\s*\{\s*animation: kcq-react-binding-fade 2000ms ease-out var\(--kcq-hp-reaction-delay, 0ms\) both !important;/);
        const fade = css.match(/@keyframes kcq-react-binding-fade\s*\{[\s\S]*?\n\}/)![0];
        expect(fade).toContain("opacity: 0");
        expect(fade).not.toContain("transform");
    });
    it("mounts active binding numbers at their remaining animation time without seeking on geometry updates", () => {
        const [visible, setVisible] = createSignal(false);
        const [maximum, setMaximum] = createSignal(100);
        const host = document.createElement("div"); document.body.append(host);
        let reactions!: ReturnType<typeof createCombatReactions>;
        dispose = render(() => {
            reactions = createCombatReactions();
            return createComponent(CombatReactionsContext.Provider, {
                value: reactions,
                get children() { return visible() ? createComponent(BindingMeter, {
                    entityId: "ko", bindingId: "latexHead", floatingNumbers: true,
                    value: 30, level: "moderate", get max() { return maximum(); },
                }) : null; },
            });
        }, host);
        reactions.present([{ event: move(), state: fixture.state }], fixture.state);
        vi.advanceTimersByTime(750);
        setVisible(true);
        const number = element(".kcq-binding-float");
        const animation = number.style.animation;
        expect(animation).toBe("kcq-react-hp-float 2000ms ease-out -750ms forwards");
        expect(number.style.getPropertyValue("--kcq-hp-reaction-delay")).toBe("-750ms");
        vi.advanceTimersByTime(250);
        setMaximum(200);
        expect(element(".kcq-binding-float")).toBe(number);
        expect(number.style.animation).toBe(animation);
        vi.advanceTimersByTime(1500);
        expect(number.isConnected).toBe(false);
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
        vi.advanceTimersByTime(b.reactions.matching("buff", "ko", "guarded")[0]!.duration);
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
    it("shows -14 beside only the damaged enemy's unchanged HP glow host", () => {
        const b = mount();
        const cards = document.querySelectorAll<HTMLElement>(".kcq-enemy-card");
        const enemy = b.initial.enemies[1]!;
        const hp = cards[1]!.querySelector<HTMLElement>(".kcq-enemy-card__hp")!;
        b.present({ type: "useMove", actor: "ko", move: "telekinesis", effects: [], targets: [
            { target: enemy.id, result: "hit", effects: [{ type: "enemyDamaged", target: enemy.id, amount: 14 }] },
        ] }, state => { state.enemies[1]!.currHp -= 14; });
        const number = cards[1]!.querySelector<HTMLElement>(".kcq-hp-reaction")!;
        expect(number.textContent).toBe("-14");
        expect(number.parentElement).toBe(hp.parentElement);
        expect(number.getAttribute("aria-hidden")).toBe("true");
        expect(number.dataset.combatReaction).toBe("damage");
        expect(number.style.animation).toBe("kcq-react-hp-float 2000ms ease-out 0ms forwards");
        expect(hp.textContent).toBe((enemy.currHp - 14) + " / " + enemy.maxHp);
        expect(hp.dataset.combatReaction).toBe("damage");
        expect(hp.style.getPropertyValue("--kcq-react-hp")).toContain("kcq-react-damage 4000ms");
        expect(cards[0]!.querySelector(".kcq-hp-reaction")).toBeNull();
        expect(cards[1]!.querySelector<HTMLElement>(".kcq-enemy-card__name")!.style.animation).toBe("");
    });
    it("shows positive healing and no numbers or glows for zero-value events", () => {
        const b = mount();
        const enemy = b.initial.enemies[0]!;
        const hp = element(".kcq-enemy-card__hp");
        b.present({ type: "changePhase", phase: "enemy", effects: [
            { type: "enemyDamaged", target: enemy.id, amount: 0 },
            { type: "enemyHealed", target: enemy.id, amount: 0 },
        ] });
        expect(document.querySelector(".kcq-hp-reaction")).toBeNull();
        expect(hp.dataset.combatReaction).toBeUndefined();
        expect(vi.getTimerCount()).toBe(0);
        b.present({ type: "changePhase", phase: "enemy", effects: [
            { type: "enemyHealed", target: enemy.id, amount: 14 },
        ] }, state => { state.enemies[0]!.currHp += 14; });
        expect(element(".kcq-hp-reaction").textContent).toBe("+14");
        expect(element(".kcq-hp-reaction").dataset.combatReaction).toBe("healing");
        expect(hp.dataset.combatReaction).toBe("healing");
        expect(hp.textContent).toBe((enemy.currHp + 14) + " / " + enemy.maxHp);
    });
    it("keeps simultaneous and repeated hits separate until their independent cue expiry", () => {
        const b = mount();
        const enemyId = b.initial.enemies[0]!.id;
        const hp = element(".kcq-enemy-card__hp");
        const hpText = hp.textContent;
        const hit = { type: "enemyDamaged", target: enemyId, amount: 14 } as const;
        b.present({ type: "changePhase", phase: "enemy", effects: [hit, hit] });
        const numbers = () => [...document.querySelectorAll<HTMLElement>(".kcq-hp-reaction")];
        const first = numbers();
        expect(first.map(number => number.textContent)).toEqual(["-14", "-14"]);
        expect(first[0]!.style.getPropertyValue("--float-x")).not.toBe(first[1]!.style.getPropertyValue("--float-x"));
        vi.advanceTimersByTime(500);
        b.present({ type: "changePhase", phase: "enemy", effects: [hit] });
        const third = numbers()[2]!;
        const animation = third.style.animation;
        const position = third.style.getPropertyValue("--float-x");
        expect(numbers()).toHaveLength(3);
        expect(third.style.getPropertyValue("--float-x")).toBe(first[0]!.style.getPropertyValue("--float-x"));
        expect(new Set(b.reactions.matching("hp", enemyId).map(cue => cue.serial)).size).toBe(3);
        expect(numbers().slice(0, 2)).toEqual(first);
        // Floating values use their HP cue timers, while the visual fade ends after 2s.
        expect(vi.getTimerCount()).toBe(3);
        vi.advanceTimersByTime(3499);
        expect(numbers()).toHaveLength(3);
        vi.advanceTimersByTime(1);
        expect(first.every(number => !number.isConnected)).toBe(true);
        expect(numbers()).toEqual([third]);
        expect(third.style.animation).toBe(animation);
        expect(third.style.getPropertyValue("--float-x")).toBe(position);
        b.present({ type: "changePhase", phase: "enemy", effects: [hit] });
        expect(numbers()[1]!.style.getPropertyValue("--float-x")).toBe(first[0]!.style.getPropertyValue("--float-x"));
        vi.advanceTimersByTime(500);
        expect(third.isConnected).toBe(false);
        expect(numbers()).toHaveLength(1);
        vi.advanceTimersByTime(3500);
        expect(numbers()).toEqual([]);
        expect(element(".kcq-enemy-card__hp")).toBe(hp);
        expect(hp.textContent).toBe(hpText);
        expect(hp.dataset.combatReaction).toBeUndefined();
        expect(vi.getTimerCount()).toBe(0);
    });
    it("keeps the floating layer outside layout and fades without movement for reduced motion", () => {
        const css = readFileSync("src/ui/web/app/app.css", "utf8");
        const style = document.createElement("style"); style.textContent = css; document.body.append(style);
        const b = mount();
        b.present({ type: "changePhase", phase: "enemy", effects: [
            { type: "enemyDamaged", target: b.initial.enemies[0]!.id, amount: 14 },
        ] });
        const number = element(".kcq-hp-reaction");
        expect(getComputedStyle(number).position).toBe("absolute");
        expect(getComputedStyle(number).pointerEvents).toBe("none");
        expect(getComputedStyle(number.parentElement!).overflow).toBe("visible");
        expect(getComputedStyle(element(".kcq-enemy-card")).overflow).toBe("visible");
        expect(css).toMatch(/\.kcq-hp-reaction\[data-combat-reaction="damage"\]\s*\{[^}]*color: var\(--kcq-glow-hit\)/);
        expect(css).toContain("color: var(--kcq-glow-positive)");
        expect(css).toContain("var(--float-x, 0px)");
        expect(css).toContain("var(--float-y, -25px)");
        const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
        expect(reduced).toMatch(/\.kcq-hp-reaction\s*\{\s*animation: kcq-react-binding-fade 2000ms[^}]*both !important;/);
    });
    it("Instant clears current effects and creates no delayed reactions, and unmount cancels outstanding work", () => {
        const b = mount();
        const event: GameEvent = { type: "changePhase", phase: "enemy", effects: [
            { type: "enemyDamaged", target: b.initial.enemies[0]!.id, amount: 14 },
            { type: "bondageChanged", target: "ko", binding: "latexHead", amount: 15 },
        ] };
        b.present(event);
        expect(element(".kcq-hp-reaction").textContent).toBe("-14");
        expect(element(".kcq-binding-float").textContent).toBe("+15");
        expect(vi.getTimerCount()).toBeGreaterThan(0);
        b.present(event, undefined, true);
        expect(b.reactions.cues()).toEqual([]);
        expect(document.querySelector(".kcq-hp-reaction")).toBeNull();
        expect(document.querySelector(".kcq-binding-float")).toBeNull();
        expect(document.querySelector("[data-combat-reaction]")).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
        b.present(event);
        const number = element(".kcq-binding-float");
        dispose!(); dispose = undefined;
        expect(number.isConnected).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
        vi.advanceTimersByTime(5000);
        b.reactions.present([{ event: event, state: b.initial }], b.initial);
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
