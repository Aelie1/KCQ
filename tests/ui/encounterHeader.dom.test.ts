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
import {
    AUTO_MEDIUM_BREAKPOINT,
    AUTO_WIDE_BREAKPOINT,
    availableWidthFromViewport,
    calculateResponsiveLayout,
    ResponsiveLayoutContext,
    type ResponsiveLayout,
} from "../../src/ui/web/app/responsiveScale";
import { createEncounterPickerViewModel, createEncounterDetailsViewModel } from "../../src/ui/web/app/viewModels/encounters";
import { createDifficultySelectViewModel } from "../../src/ui/web/app/viewModels/difficulty";
import { stockStrings } from "../helpers/stockStrings";
import { responsivePresentationCases } from "../helpers/responsiveLayouts";

const viewport = (window as unknown as HappyWindow).happyDOM;
const initialViewport = { width: window.innerWidth, height: window.innerHeight };
const presentation = new Presentation({
    ...stockStrings, "ui.library.title": "Bibliotheque", "ui.battleOverview.settings": "Options",
    "campaign.skunk.name": "Localized campaign", "ui.encounter.showAll": "Afficher tout",
});
const library = createStockEngine().getLibrary();
let unmount: (() => void) | undefined;
afterEach(() => {
    unmount?.();
    document.body.replaceChildren();
    viewport.setViewport(initialViewport);
});

function mount(view: Parameters<typeof render>[0], selectedLayout?: ResponsiveLayout): HTMLElement {
    const style = document.createElement("style");
    style.textContent = readFileSync("src/ui/web/app/app.css", "utf8");
    document.body.append(style);
    const host = document.createElement("div");
    document.body.append(host);
    unmount = render(() => createComponent(ResponsiveLayoutContext.Provider, {
        value: () => selectedLayout ?? calculateResponsiveLayout(availableWidthFromViewport(window.innerWidth)),
        get children() { return view(); },
    }), host);
    return host;
}

const screens = [
    { name: "picker", render: (controls: LibrarySettingsControlsProps, confirm: () => void) =>
        createComponent(EncounterPickerPanel, {
            ...controls, model: createEncounterPickerViewModel(library, presentation, library.campaigns.skunk, {}, [], true), onSelect: confirm,
        }) },
    { name: "details", render: (controls: LibrarySettingsControlsProps, confirm: () => void) =>
        createComponent(EncounterDetailsPanel, {
            ...controls, model: createEncounterDetailsViewModel(library, "plains_1", presentation),
            onBack: () => {}, onChooseDifficulty: confirm,
        }) },
    { name: "difficulty", render: (controls: LibrarySettingsControlsProps, confirm: () => void) =>
        createComponent(DifficultySelectPanel, {
            ...controls, model: createDifficultySelectViewModel(library, "plains_1", "standard", presentation),
            onBack: () => {}, onStart: confirm, onSelectDifficulty: () => {},
        }) },
    { name: "combat", render: (controls: LibrarySettingsControlsProps, confirm: () => void) =>
        createComponent(BattleOverviewPanel, {
            ...battleOverviewFixture, ...controls, presentation, onEndTurn: confirm,
        }) },
];

describe("shared Library and Settings header controls", () => {
    it.each(responsivePresentationCases)("uses the selected form factor with layout %j: %s", (layout, compact) => {
        const host = mount(() => createComponent(EncounterHeader, { title: "Encounter", settingsLabel: "Settings" }), layout);
        expect(!!host.querySelector(".kcq-encounter-header--compact")).toBe(compact);
        const controls = host.querySelector(".kcq-header-controls")!;
        expect(getComputedStyle(controls).gridTemplateRows.includes("repeat(2,")).toBe(!compact);
    });

    it.each([
        320, 390, AUTO_MEDIUM_BREAKPOINT - 1, AUTO_MEDIUM_BREAKPOINT, AUTO_MEDIUM_BREAKPOINT + 1, 1024,
        AUTO_WIDE_BREAKPOINT - 1, AUTO_WIDE_BREAKPOINT, AUTO_WIDE_BREAKPOINT + 1,
    ])("places the accessible Show All control between the title and buttons at width %s", width => {
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
        expect(getComputedStyle(header).gridTemplateColumns).toBe(width >= AUTO_MEDIUM_BREAKPOINT ? "minmax(0, 1fr) auto auto" : "minmax(0, 1fr) auto 42px");
        expect(parseFloat(getComputedStyle(header.querySelector("h1")!).minWidth)).toBe(0);
        expect(header.querySelector("h1")?.textContent).toBe("Localized campaign");
        expect(getComputedStyle(label).display).toBe("flex");
        expect(getComputedStyle(label).alignItems).toBe("center");
        const text = label.querySelector("span")!;
        expect(checkbox.nextElementSibling).toBe(text);
        expect(getComputedStyle(text).width).toBe(width >= AUTO_MEDIUM_BREAKPOINT ? "auto" : "min-content");
        expect(getComputedStyle(text).whiteSpace).toBe(width >= AUTO_MEDIUM_BREAKPOINT ? "nowrap" : "normal");
        expect(text.textContent).toBe(presentation.ui("encounter.showAll"));
        expect(text.childElementCount).toBe(0);
        expect(getComputedStyle(controls).gridTemplateRows.includes("repeat(2,")).toBe(width < AUTO_MEDIUM_BREAKPOINT);
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

    it.each(screens.flatMap(screen => [
        320, 390, AUTO_MEDIUM_BREAKPOINT - 1, AUTO_MEDIUM_BREAKPOINT, AUTO_MEDIUM_BREAKPOINT + 1, 1024,
        AUTO_WIDE_BREAKPOINT - 1, AUTO_WIDE_BREAKPOINT, AUTO_WIDE_BREAKPOINT + 1,
    ].map(width => ({ ...screen, width }))))(
        "keeps labeled $name actions keyboard accessible at width $width", screen => {
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
            const compact = screen.width >= AUTO_MEDIUM_BREAKPOINT && screen.name !== "combat";
            expect(buttons.map(button => button.getAttribute("aria-label"))).toEqual(compact ? ["Bibliotheque", "Options"] : ["Options", "Bibliotheque"]);
            expect(host.querySelector(".kcq-screen-layout__body .kcq-library-access")).toBeNull();
            const layout = getComputedStyle(controls);
            expect(layout.display).toBe("grid");
            expect(layout.gridTemplateRows.includes("repeat(2,")).toBe(!compact);
            if (compact) expect(layout.gridTemplateColumns).toContain("repeat(2,");
            expect(controls.closest(".kcq-combat-header")).toBe(host.querySelector(".kcq-combat-header"));
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
            expect(host.querySelector<HTMLButtonElement>(".kcq-combat-header__library")!.disabled).toBe(!libraryAvailable);
            expect(host.querySelector<HTMLButtonElement>(".kcq-combat-header__settings")!.disabled).toBe(!settingsAvailable);
            buttons.forEach(button => button.click());
            expect(onLibrary).toHaveBeenCalledTimes(libraryAvailable ? 1 : 0);
            expect(onSettings).toHaveBeenCalledTimes(settingsAvailable ? 1 : 0);
        },
    );
});
