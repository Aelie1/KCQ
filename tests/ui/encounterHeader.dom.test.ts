import { readFileSync } from "node:fs";
import type { Window as HappyWindow } from "happy-dom";
import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStockEngine } from "../../src/stock";
import { Presentation } from "../../src/ui/presentation/presentation";
import { EncounterHeader } from "../../src/ui/web/app/components/EncounterHeader";
import { EncounterPickerPanel } from "../../src/ui/web/app/components/EncounterPickerPanel";
import { EncounterDetailsPanel } from "../../src/ui/web/app/components/EncounterDetailsPanel";
import { DifficultySelectPanel } from "../../src/ui/web/app/components/DifficultySelectPanel";
import type { LibrarySettingsControlsProps } from "../../src/ui/web/app/components/LibrarySettingsControls";
import { BattleOverviewPanel } from "../../src/ui/web/app/panels/BattleOverviewPanel";
import { battleOverviewFixture } from "../../src/ui/web/app/fixtures/battleOverview";
import { useCombatKeyboard } from "../../src/ui/web/app/keyboard";
import { createEncounterPickerViewModel, createEncounterDetailsViewModel } from "../../src/ui/web/app/viewModels/encounters";
import { createDifficultySelectViewModel } from "../../src/ui/web/app/viewModels/difficulty";
import { stockStrings } from "../helpers/stockStrings";

const viewport = (window as unknown as HappyWindow).happyDOM;
const initialViewport = { width: window.innerWidth, height: window.innerHeight };
const presentation = new Presentation({
    ...stockStrings, "ui.library.title": "Bibliotheque", "ui.battleOverview.settings": "Options",
});
const library = createStockEngine().getLibrary();
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

const screens = [
    { name: "picker", height: "56px", render: (controls: LibrarySettingsControlsProps, confirm: () => void) =>
        createComponent(EncounterPickerPanel, {
            ...controls, model: createEncounterPickerViewModel(library, presentation, library.campaigns.skunk, {}, [], true), onSelect: confirm,
        }) },
    { name: "details", height: "56px", render: (controls: LibrarySettingsControlsProps, confirm: () => void) =>
        createComponent(EncounterDetailsPanel, {
            ...controls, model: createEncounterDetailsViewModel(library, "plains_1", presentation),
            onBack: () => {}, onChooseDifficulty: confirm,
        }) },
    { name: "difficulty", height: "56px", render: (controls: LibrarySettingsControlsProps, confirm: () => void) =>
        createComponent(DifficultySelectPanel, {
            ...controls, model: createDifficultySelectViewModel(library, "plains_1", "standard", presentation),
            onBack: () => {}, onStart: confirm, onSelectDifficulty: () => {},
        }) },
    { name: "combat", height: "56px", render: (controls: LibrarySettingsControlsProps, confirm: () => void) =>
        createComponent(BattleOverviewPanel, {
            ...battleOverviewFixture, ...controls, presentation, onEndTurn: confirm,
        }) },
];

describe("shared Library and Settings header controls", () => {
    it.each([320, 390, 1024])("places the accessible Show All control between the title and stacked buttons at width %s", width => {
        viewport.setViewport({ width });
        const onShowAllChange = vi.fn(); const globalAction = vi.fn(() => false);
        const host = mount(() => {
            useCombatKeyboard(() => host, () => true, globalAction, () => "always");
            return createComponent(EncounterPickerPanel, {
                model: createEncounterPickerViewModel(library, presentation, library.campaigns.skunk),
                onSelect: vi.fn(), onShowAllChange, onLibrary: vi.fn(), onSettings: vi.fn(),
            });
        });
        const header = host.querySelector<HTMLElement>(".kcq-encounter-header")!;
        const label = header.querySelector<HTMLLabelElement>(".kcq-encounter-picker__show-all")!;
        const checkbox = label.querySelector<HTMLInputElement>("input")!;
        const controls = header.querySelector<HTMLElement>(".kcq-header-controls")!;
        expect(label.previousElementSibling).toBe(header.querySelector("h1"));
        expect(label.nextElementSibling).toBe(controls);
        expect(getComputedStyle(header).gridTemplateColumns).toBe("minmax(0, 1fr) auto 42px");
        expect(parseFloat(getComputedStyle(header.querySelector("h1")!).minWidth)).toBe(0);
        expect(getComputedStyle(label).whiteSpace).toBe("nowrap");
        expect(getComputedStyle(controls).gridTemplateRows).toBe("repeat(2, minmax(0, 1fr))");
        expect(host.querySelector(".kcq-screen-layout__body .kcq-encounter-picker__show-all")).toBeNull();
        expect(checkbox.type).toBe("checkbox");
        expect(checkbox.tabIndex).toBe(0);
        expect(label.textContent).toBe(presentation.ui("encounter.showAll"));
        checkbox.focus(); expect(document.activeElement).toBe(checkbox);
        for (const key of [" ", "Enter"]) {
            const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
            checkbox.dispatchEvent(event);
            expect(event.defaultPrevented).toBe(false);
            checkbox.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
        }
        label.click();
        expect(onShowAllChange).toHaveBeenCalledExactlyOnceWith(true);
        expect(globalAction).not.toHaveBeenCalled();
    });

    it.each(screens.flatMap(screen => [320, 390, 1024].map(width => ({ ...screen, width }))))(
        "keeps labeled $name actions in the existing header area at width $width", screen => {
            viewport.setViewport({ width: screen.width });
            const onLibrary = vi.fn();
            const onSettings = vi.fn();
            const onConfirm = vi.fn();
            const globalAction = vi.fn(() => false);
            const host = mount(() => {
                useCombatKeyboard(() => host, () => true, globalAction, () => "always");
                return screen.render({
                    libraryLabel: presentation.ui("library.title"),
                    settingsLabel: presentation.ui("battleOverview.settings"), onLibrary, onSettings,
                }, onConfirm);
            });
            expect(!!host.querySelector(".kcq-encounter-picker__show-all")).toBe(screen.name === "picker");
            const controls = host.querySelector<HTMLElement>(".kcq-header-controls")!;
            const buttons = [...controls.querySelectorAll<HTMLButtonElement>("button")];
            expect(buttons.map(button => button.getAttribute("aria-label"))).toEqual(["Bibliotheque", "Options"]);
            expect(host.querySelector(".kcq-screen-layout__body .kcq-library-access")).toBeNull();
            const layout = getComputedStyle(controls);
            expect(layout.display).toBe("grid");
            expect(layout.width).toBe("42px");
            expect(layout.height).toBe(screen.height);
            expect(layout.gridTemplateRows).toBe("repeat(2, minmax(0, 1fr))");
            expect(layout.gap).toBe("2px");
            expect(getComputedStyle(host.querySelector(".kcq-combat-header")!).height).toBe("72px");
            for (const button of buttons) {
                expect(button.type).toBe("button");
                expect(button.disabled).toBe(false);
                expect(button.tabIndex).toBe(0);
                expect(button.querySelector("img")?.getAttribute("alt")).toBe("");
                button.focus();
                expect(document.activeElement).toBe(button);
                // Happy DOM does not synthesize native activation; ensure shortcuts leave it available.
                for (const key of ["Enter", " "]) {
                    for (const repeat of [false, true]) {
                        const event = new KeyboardEvent("keydown", { key, repeat, bubbles: true, cancelable: true });
                        button.dispatchEvent(event);
                        expect(event.defaultPrevented).toBe(false);
                    }
                    button.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
                }
                button.click();
            }
            expect(onLibrary).toHaveBeenCalledOnce();
            expect(onSettings).toHaveBeenCalledOnce();
            expect(onConfirm).not.toHaveBeenCalled();
            expect(globalAction).not.toHaveBeenCalled();
        },
    );

    it.each([[false, false], [true, false], [false, true]])(
        "independently disables unavailable callbacks (Library: %s, Settings: %s)", (libraryAvailable, settingsAvailable) => {
            const onLibrary = vi.fn();
            const onSettings = vi.fn();
            const host = mount(() => createComponent(EncounterHeader, {
                title: "Encounters", settingsLabel: "Settings",
                onLibrary: libraryAvailable ? onLibrary : undefined,
                onSettings: settingsAvailable ? onSettings : undefined,
            }));
            const buttons = [...host.querySelectorAll<HTMLButtonElement>(".kcq-header-controls > button")];
            expect(buttons).toHaveLength(2);
            expect(buttons.map(button => button.disabled)).toEqual([!libraryAvailable, !settingsAvailable]);
            buttons.forEach(button => button.click());
            expect(onLibrary).toHaveBeenCalledTimes(libraryAvailable ? 1 : 0);
            expect(onSettings).toHaveBeenCalledTimes(settingsAvailable ? 1 : 0);
        },
    );
});
