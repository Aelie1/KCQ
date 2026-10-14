import { readFileSync } from "node:fs";
import type { Window as HappyWindow } from "happy-dom";
import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStockEngine } from "../../src/stock";
import { Presentation } from "../../src/ui/presentation/presentation";
import { EncounterHeader } from "../../src/ui/web/app/components/EncounterHeader";
import { EncounterPickerPanel } from "../../src/ui/web/app/components/EncounterPickerPanel";
import { useCombatKeyboard } from "../../src/ui/web/app/keyboard";
import { createEncounterPickerViewModel } from "../../src/ui/web/app/viewModels/encounters";
import { stockStrings } from "../helpers/stockStrings";

const viewport = (window as unknown as HappyWindow).happyDOM;
const initialViewport = { width: window.innerWidth, height: window.innerHeight };
const presentation = new Presentation(stockStrings);
let unmount: (() => void) | undefined;
afterEach(() => {
    unmount?.();
    document.body.replaceChildren();
    viewport.setViewport(initialViewport);
});

function mount(view: Parameters<typeof render>[0]): HTMLElement {
    const style = document.createElement("style");
    style.textContent = readFileSync("src/ui/web/app/app.css", "utf8");
    document.body.append(style);
    const host = document.createElement("div");
    document.body.append(host);
    unmount = render(view, host);
    return host;
}

describe("encounter header controls", () => {
    it.each([320, 390, 1024])("keeps labeled picker actions in the existing header area at width %s", width => {
        viewport.setViewport({ width });
        const onLibrary = vi.fn();
        const onSettings = vi.fn();
        const onSelect = vi.fn();
        const libraryLabel = "Bibliotheque";
        const host = mount(() => {
            useCombatKeyboard(() => host, () => true, () => false, () => "always");
            return createComponent(EncounterPickerPanel, {
                model: createEncounterPickerViewModel(createStockEngine().getLibrary(), presentation),
                libraryLabel, onLibrary, onSettings, onSelect,
            });
        });
        const controls = host.querySelector<HTMLElement>(".kcq-encounter-header__controls")!;
        const buttons = [...controls.querySelectorAll<HTMLButtonElement>("button")];
        expect(buttons.map(button => button.getAttribute("aria-label"))).toEqual([
            libraryLabel, presentation.ui("battleOverview.settings"),
        ]);
        expect(host.querySelector(".kcq-screen-layout__body .kcq-library-access")).toBeNull();
        const layout = getComputedStyle(controls);
        expect(layout.display).toBe("grid");
        expect(layout.width).toBe("42px");
        expect(layout.height).toBe("58px");
        expect(layout.gridTemplateRows).toBe("repeat(2, minmax(0, 1fr))");
        expect(layout.gap).toBe("2px");
        expect(getComputedStyle(host.querySelector(".kcq-encounter-header")!).height).toBe("72px");
        for (const button of buttons) {
            expect(button.type).toBe("button");
            expect(button.disabled).toBe(false);
            expect(button.tabIndex).toBe(0);
            expect(button.querySelector("img")?.getAttribute("alt")).toBe("");
            button.focus();
            expect(document.activeElement).toBe(button);
            // Happy DOM does not synthesize native activation; ensure the app leaves it available.
            for (const key of ["Enter", " "]) {
                const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
                button.dispatchEvent(event);
                expect(event.defaultPrevented).toBe(false);
                button.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
            }
            button.click();
        }
        expect(onLibrary).toHaveBeenCalledOnce();
        expect(onSettings).toHaveBeenCalledOnce();
        expect(onSelect).not.toHaveBeenCalled();
    });

    it("disables picker actions when their callbacks are unavailable", () => {
        const host = mount(() => createComponent(EncounterHeader, {
            title: "Encounters", settingsLabel: "Settings", picker: true,
        }));
        const buttons = [...host.querySelectorAll<HTMLButtonElement>(".kcq-encounter-header__controls > button")];
        expect(buttons).toHaveLength(2);
        for (const button of buttons) expect(button.disabled).toBe(true);
    });

    it("retains the full-height Settings button on other encounter screens", () => {
        const onSettings = vi.fn();
        const host = mount(() => createComponent(EncounterHeader, {
            title: "Encounter details", settingsLabel: "Settings", onSettings,
        }));
        expect(host.querySelector(".kcq-encounter-header__controls")).toBeNull();
        expect(host.querySelector(".kcq-encounter-header__library")).toBeNull();
        const buttons = [...host.querySelectorAll<HTMLButtonElement>("button")];
        expect(buttons).toHaveLength(1);
        expect(getComputedStyle(buttons[0]!).height).toBe("58px");
        buttons[0]!.click();
        expect(onSettings).toHaveBeenCalledOnce();
    });
});
