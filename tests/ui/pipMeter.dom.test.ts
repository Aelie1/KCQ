import { createComponent, createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";
import { PipMeter } from "../../src/ui/web/app/components/PipMeter";
import { ModifierMeter } from "../../src/ui/web/app/components/ModifierMeter";
import { EffectPreview } from "../../src/ui/web/app/components/EffectPreview";
import { characterDetailsFixture as fixture } from "../../src/ui/web/app/fixtures/characterDetails";
import { createFocusedCharacterViewModel } from "../../src/ui/web/app/viewModels/characterDetails";
import { createEffectPreviewViewModels } from "../../src/ui/web/app/viewModels/effectPreviews";

let unmount: (() => void) | undefined;
afterEach(() => { unmount?.(); document.body.replaceChildren(); });
function mount(view: Parameters<typeof render>[0]) {
    const host = document.createElement("div"); document.body.append(host);
    unmount = render(view, host);
    return host;
}
function lit(meter: Element) {
    return [...meter.querySelectorAll(".kcq-pip-meter__pip")].flatMap((pip, index) =>
        pip.classList.contains("kcq-pip-meter__pip--active") ? [index] : []);
}

describe("universal PipMeter direction", () => {
    it.each(["success", "danger", "neutral"] as const)("uses signed magnitude independently of %s color", tone => {
        const [active, setActive] = createSignal(0);
        const host = mount(() => createComponent(PipMeter, { get active() { return active(); }, tone }));
        expect(host.querySelectorAll(".kcq-pip-meter__pip")).toHaveLength(8);
        for (const [value, expected] of [
            [3, [0, 1, 2]], [-3, [5, 6, 7]], [0, []],
            [20, [0, 1, 2, 3, 4, 5, 6, 7]], [-20, [0, 1, 2, 3, 4, 5, 6, 7]],
            [1, [0]], [-1, [7]],
        ] as const) {
            setActive(value);
            expect(lit(host)).toEqual(expected);
            expect(host.querySelectorAll(`.kcq-pip-meter__pip--${tone}`)).toHaveLength(8);
        }
    });
    it("renders character vulnerability and defense modifiers by sign, including harmful positive values", () => {
        const state = { ...fixture.state, characters: fixture.state.characters.map((character, index) => index === 0
            ? { ...character, modifiers: { vulnerability: 3, defense: -2, escape: 0 } } : character) };
        const model = createFocusedCharacterViewModel(state, fixture.actions[0]!, fixture.thresholds, fixture.presentation);
        const metrics = (["vulnerability", "defense"] as const).map(id =>
            model.modifiers.find(metric => metric.label === fixture.presentation.modifier(id))!);
        expect(metrics.every(Boolean)).toBe(true);
        const host = mount(() => metrics.map(metric => createComponent(ModifierMeter, { metric })));
        expect([...host.querySelectorAll(".kcq-pip-meter")].map(lit)).toEqual([[0, 1, 2], [6, 7]]);
        expect(metrics.map(metric => metric.tone)).toEqual(["danger", "danger"]);
    });
    it("renders effect previews by sign even when a negative modifier is beneficial", () => {
        const effect = createEffectPreviewViewModels([{
            type: "buff", operation: "add", target: "hero",
            buff: { id: "preview", modifiers: { vulnerability: 2, defense: -3, spread: -2, regeneration: 12 } },
        }], { presentation: fixture.presentation, completeModifiers: true })[0]!;
        expect(effect.kind).toBe("buff");
        const host = mount(() => createComponent(EffectPreview, { effect }));
        expect([...host.querySelectorAll(".kcq-pip-meter")].map(lit)).toEqual([[0, 1], [5, 6, 7], [6, 7], [0, 1, 2, 3, 4, 5, 6, 7]]);
        const rows = [...host.querySelectorAll(".kcq-effect-modifier")];
        expect(rows[0]!.querySelectorAll(".kcq-pip-meter__pip--danger")).toHaveLength(8);
        expect(rows[2]!.querySelectorAll(".kcq-pip-meter__pip--success")).toHaveLength(8);
    });
});
