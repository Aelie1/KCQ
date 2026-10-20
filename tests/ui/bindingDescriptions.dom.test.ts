import { batch, createComponent, createSignal, Show } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameEvent } from "../../src/engine/public/types";
import { Presentation } from "../../src/ui/presentation/presentation";
import { CombatReactionsContext, createCombatReactions } from "../../src/ui/web/app/combatReactions";
import { BindingMeter } from "../../src/ui/web/app/components/BindingMeter";
import { battleOverviewFixture as fixture } from "../../src/ui/web/app/fixtures/battleOverview";
import { BattleOverviewPanel } from "../../src/ui/web/app/panels/BattleOverviewPanel";
import { CharacterDetailsPanel } from "../../src/ui/web/app/panels/CharacterDetailsPanel";
import { EscapePanel } from "../../src/ui/web/app/panels/EscapePanel";
import { ResponsiveLayoutContext, type ResponsiveLayout } from "../../src/ui/web/app/responsiveScale";
import { bindingLevelAtValue } from "../../src/ui/web/app/viewModels/presentationHelpers";
import { createViewPreferences, ViewPreferencesContext } from "../../src/ui/web/app/viewPreferences";

let dispose: (() => void) | undefined;
beforeEach(() => { vi.useFakeTimers(); window.localStorage.clear(); });
afterEach(() => {
    dispose?.(); dispose = undefined;
    document.body.replaceChildren(); delete document.documentElement.dataset.kcqTheme; window.localStorage.clear(); vi.useRealTimers();
});
function mount(presentation = fixture.presentation, initiallyDetails = true) {
    const initial = structuredClone(fixture.state);
    initial.characters[0]!.bindings[0]!.value = fixture.thresholds.thresholds.moderate!;
    initial.characters[0]!.bindings[0]!.level = "moderate";
    const [state, setState] = createSignal(initial);
    const [details, setDetails] = createSignal(initiallyDetails);
    const [layout, setLayout] = createSignal<ResponsiveLayout>({ size: "wide", columns: 3, zoom: 1 });
    const preferences = createViewPreferences();
    let reactions!: ReturnType<typeof createCombatReactions>;
    const host = document.createElement("div"); document.body.append(host);
    dispose = render(() => {
        reactions = createCombatReactions();
        return createComponent(ViewPreferencesContext.Provider, {
            value: preferences,
            get children() {
                return createComponent(ResponsiveLayoutContext.Provider, {
                    value: layout,
                    get children() {
                        return createComponent(CombatReactionsContext.Provider, {
                            value: reactions,
                            get children() {
                                return [createComponent(BattleOverviewPanel, {
                                    get state() { return state(); }, actions: fixture.actions,
                                    presentation, thresholds: fixture.thresholds, gameLogLines: 0,
                                }), createComponent(Show, {
                                    keyed: true, get when() { return details(); },
                                    get children() {
                                        return [createComponent(CharacterDetailsPanel, {
                                            get state() { return state(); }, actions: fixture.actions,
                                            focusedCharacterId: initial.characters[0]!.id, presentation, thresholds: fixture.thresholds,
                                        }), createComponent(EscapePanel, {
                                            get state() { return state(); }, actions: fixture.actions,
                                            actorId: initial.characters[0]!.id, presentation, thresholds: fixture.thresholds,
                                        })];
                                    },
                                })];
                            },
                        });
                    },
                });
            },
        });
    }, host);
    const update = (value: number, instant = false, restore = false) => {
        const after = structuredClone(state());
        const binding = after.characters[0]!.bindings[0]!;
        const amount = value - binding.value;
        binding.value = value; binding.level = bindingLevelAtValue(value, fixture.thresholds);
        const event: GameEvent = {
            type: "useMove", actor: "skunkette1", move: "pounce", effects: [],
            targets: [{
                target: initial.characters[0]!.id, result: "hit", effects: [{
                    type: "bondageChanged", target: initial.characters[0]!.id, binding: binding.id, amount,
                }]
            }]
        };
        batch(() => {
            if (!restore) reactions.present([{ event, state: after }], state(), instant);
            setState(after);
        });
    };
    const description = () => host.querySelector<HTMLElement>(".kcq-character-binding .kcq-binding-description")!;
    return { state, preferences, reactions, setDetails, setLayout, update, description, host };
}
describe("combat binding descriptions", () => {
    it("uses Library severity text beneath visible meters, including details and Escape", () => {
        const b = mount(); b.setDetails(true);
        expect(b.host.querySelector(".kcq-party-card .kcq-binding-description")).toBeNull();
        for (const display of b.host.querySelectorAll(".kcq-character-binding")) {
            const binding = b.state().characters[0]!.bindings.find(binding => fixture.presentation.binding(binding.id) === display.querySelector('[role="progressbar"]')?.getAttribute("aria-label"))!;
            expect(display.querySelector(".kcq-binding-description")?.textContent).toBe(fixture.presentation.referenceText("binding", binding.id, binding.level));
        }
        expect(b.host.querySelectorAll(".kcq-character-binding .kcq-binding-description").length).toBeGreaterThan(0);
        expect(b.description().dataset.combatReaction).toBeUndefined();
    });
    it("does not replay cues on mount, layout changes, visibility toggles, or restored saves", () => {
        const b = mount(fixture.presentation, false); b.update(fixture.thresholds.thresholds.severe!); b.setDetails(true);
        for (const description of b.host.querySelectorAll<HTMLElement>(".kcq-character-binding .kcq-binding-description")) {
            expect(description.dataset.combatReaction).toBeUndefined();
        }
        b.setLayout({ columns: 1, size: "narrow", zoom: 1 });
        expect(b.host.querySelector(".kcq-binding-description")).toBeNull();
        b.setLayout({ columns: 2, size: "medium", zoom: 1 });
        expect(b.description().dataset.combatReaction).toBeUndefined();
        b.preferences.setBindingDescriptions("off"); b.update(fixture.thresholds.thresholds.light!);
        expect(b.host.querySelector(".kcq-binding-description")).toBeNull();
        b.preferences.setBindingDescriptions("on");
        expect(b.description().dataset.combatReaction).toBeUndefined();
        expect(b.description().textContent).toBe(fixture.presentation.referenceText("binding", b.state().characters[0]!.bindings[0]!.id, "light"));
        b.reactions.clear(); b.update(fixture.thresholds.thresholds.heavy!, false, true);
        expect(b.description().dataset.combatReaction).toBeUndefined();
        b.update(fixture.thresholds.thresholds.severe!);
    });
    it("omits inactive and missing descriptions and leaves predictive meters unchanged", () => {
        const b = mount(new Presentation({ "binding.latexHead.moderate": "...", "binding.latexHead.none": "Inactive" }));
        expect(b.host.querySelector(".kcq-binding-description")).toBeNull();
        b.update(0, true);
        expect(b.host.querySelector(".kcq-binding-description")).toBeNull();
        b.preferences.setBindingDescriptions("on");
        const host = document.createElement("div"); b.host.append(host);
        const unmount = render(() => createComponent(BindingMeter, { value: 50, max: 100, level: "severe", change: 10 }), host);
        expect(host.querySelector(".kcq-binding-description")).toBeNull();
        expect(host.querySelector(".kcq-binding-meter__change")).not.toBeNull(); unmount();
    });
});


it.each(["auto", "on", "off"] as const)("keeps overview bars compact with descriptions set to %s", mode => {
    const b = mount(fixture.presentation, false);
    b.preferences.setBindingDescriptions(mode);
    b.update(fixture.thresholds.thresholds.severe!);
    expect(b.host.querySelector(".kcq-binding-description")).toBeNull();
    for (const bindings of b.host.querySelectorAll(".kcq-party-card__bindings")) {
        expect(bindings.children.length).toBeGreaterThan(0);
        for (const child of bindings.children) expect(child.matches(".kcq-binding-meter[role=progressbar]")).toBe(true);
    }
    b.setDetails(true);
    expect(!!b.host.querySelector(".kcq-character-binding .kcq-binding-description")).toBe(mode !== "off");
    expect(b.host.querySelector(".kcq-party-card .kcq-binding-description")).toBeNull();
});