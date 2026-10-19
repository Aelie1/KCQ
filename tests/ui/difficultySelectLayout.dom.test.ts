import { readFileSync } from "node:fs";
import { createComponent, createRenderEffect, createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DifficultyId } from "../../src/engine/public/types";
import { createStockEngine } from "../../src/stock";
import { Presentation } from "../../src/ui/presentation/presentation";
import { DifficultySelectPanel } from "../../src/ui/web/app/components/DifficultySelectPanel";
import { useCombatKeyboard } from "../../src/ui/web/app/keyboard";
import { LAYOUT_WIDTHS, ResponsiveLayoutContext, type ResponsiveLayout } from "../../src/ui/web/app/responsiveScale";
import { createDifficultySelectViewModel } from "../../src/ui/web/app/viewModels/difficulty";
import { stockStrings } from "../helpers/stockStrings";
import { responsiveLayouts, responsivePresentationCases } from "../helpers/responsiveLayouts";

const library = createStockEngine().getLibrary();
const presentation = new Presentation(stockStrings);
const wideLayout = responsiveLayouts.wide;
const narrowLayout = responsiveLayouts.narrow;
const difficulties = ["casual", "standard", "veteran", "extreme", "mythic"] as const;
let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); document.body.replaceChildren(); });

function mount(initialLayout: ResponsiveLayout = wideLayout, height = 480) {
    const style = document.createElement("style");
    style.textContent = readFileSync("src/ui/web/app/tokens.css", "utf8") + readFileSync("src/ui/web/app/app.css", "utf8");
    const host = document.createElement("div");
    host.className = "kcq-graphical-app__background";
    host.style.setProperty("--kcq-ui-height", `${height}px`);
    document.body.append(style, host);
    const [layout, setLayout] = createSignal<ResponsiveLayout>(initialLayout);
    const [difficulty, setDifficulty] = createSignal<DifficultyId>("standard");
    const model = () => createDifficultySelectViewModel(library, "forest_3", difficulty(), presentation);
    const onBack = vi.fn(), onStart = vi.fn(), onSettings = vi.fn(), onLibrary = vi.fn();
    dispose = render(() => {
        createRenderEffect(() => host.style.setProperty("--kcq-layout-width", `${LAYOUT_WIDTHS[layout().columns]}px`));
        useCombatKeyboard(() => host, () => true, () => false, () => "always");
        return createComponent(ResponsiveLayoutContext.Provider, {
            value: layout,
            get children() { return createComponent(DifficultySelectPanel, {
                get model() { return model(); }, onSelectDifficulty: setDifficulty,
                onBack, onStart, onSettings, onLibrary, libraryLabel: "Library",
            }); },
        });
    }, host);
    const element = <T extends HTMLElement = HTMLElement>(selector: string): T => {
        const found = host.querySelector<T>(selector);
        if (!found) throw new Error("Missing " + selector);
        return found;
    };
    const choices = () => [...host.querySelectorAll<HTMLButtonElement>(".kcq-difficulty-select__choice")];
    return { host, element, choices, setLayout, setDifficulty, model, onBack, onStart, onSettings, onLibrary };
}

function press(key: string) {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    document.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
    return event;
}

describe("difficulty selection responsive layout", () => {
    it.each(Object.values(responsiveLayouts))("updates all five difficulties and optional information in layout %j", layout => {
        const { host, element, choices, model } = mount(layout);
        expect(choices().map(choice => choice.textContent)).toEqual(difficulties.map(id => presentation.difficulty(id)));
        for (const [index, difficulty] of difficulties.entries()) {
            choices()[index]!.click();
            const expected = model();
            expect(expected.selectedDifficulty).toBe(difficulty);
            expect(choices().map(choice => choice.getAttribute("aria-pressed"))).toEqual(difficulties.map(id => String(id === difficulty)));
            expect(choices().filter(choice => choice.classList.contains("is-selected"))).toHaveLength(1);
            expect(element(".kcq-difficulty-select__description").textContent).toBe(expected.description);
            expect(!!host.querySelector(".kcq-difficulty-select__global-effects")).toBe(!!expected.globalEffects);
            expect(!!host.querySelector(".kcq-difficulty-select__special-rules")).toBe(!!expected.specialRules);
            if (expected.globalEffects) {
                expect(element(".kcq-difficulty-select__global-effects h3").textContent).toBe(expected.globalEffects.recipientName);
                expect(host.querySelectorAll(".kcq-preview-effect")).toHaveLength(expected.globalEffects.effects.length);
            }
            if (expected.specialRules) {
                expect([...host.querySelectorAll("tbody tr")].map(row => row.textContent)).toEqual(
                    expected.specialRules.rows.map(row => row.enemyName + row.description));
            }
            if (layout.size !== "narrow") {
                const info = element(".kcq-difficulty-select__information");
                expect(info.getAttribute("aria-label")).toBe(expected.selectedDifficultyName);
                expect(element(".kcq-difficulty-select__summary h2").textContent).toBe(expected.selectedDifficultyName);
                expect([...info.children].map(child => child.className)).toEqual([
                    "kcq-encounter-card kcq-difficulty-select__summary",
                    ...(expected.globalEffects ? ["kcq-encounter-card kcq-difficulty-select__global-effects"] : []),
                    ...(expected.specialRules ? ["kcq-encounter-card kcq-difficulty-select__special-rules"] : []),
                ]);
            } else {
                expect(element(".kcq-difficulty-select__heading strong").textContent).toBe(expected.selectedDifficultyName);
                expect(element(".kcq-difficulty-select__card").contains(element(".kcq-difficulty-select__description"))).toBe(true);
                expect(host.querySelector(".kcq-difficulty-select__summary")).toBeNull();
            }
        }
    });

    it.each(responsivePresentationCases)("uses the selected form factor with layout %j: %s", (layout, nonNarrow) => {
        expect(!!mount(layout).host.querySelector(".kcq-difficulty-select--non-narrow")).toBe(nonNarrow);
    });

    it.each([720, 480, 320])("bounds the columns and scrolling information at %ipx height", height => {
        const { host, element, choices, setDifficulty } = mount(wideLayout, height);
        setDifficulty("mythic");
        expect(getComputedStyle(host).width).toBe(`${LAYOUT_WIDTHS[3]}px`);
        expect(getComputedStyle(element(".kcq-difficulty-select__body")).gridTemplateColumns).toBe("minmax(0, 35fr) minmax(0, 65fr)");
        expect(getComputedStyle(element(".kcq-difficulty-select__choices")).gridTemplateColumns).toBe("minmax(0, 1fr)");
        expect(choices().every(choice => getComputedStyle(choice).width === "100%")).toBe(true);
        expect(getComputedStyle(element(".kcq-difficulty-select__card")).alignSelf).toBe("start");
        // Happy DOM verifies the scrolling contract; browser QA checks geometry.
        expect(getComputedStyle(element(".kcq-screen-layout__content")).minHeight).toBe("260px");
        expect(getComputedStyle(element(".kcq-screen-layout__body")).overflowY).toBe("auto");
        const info = element(".kcq-difficulty-select__information");
        expect(getComputedStyle(info).overflow).toBe("auto");
        expect(getComputedStyle(info).minHeight).toBe("0");
        expect(getComputedStyle(info).overscrollBehavior).toBe("contain");
        expect(info.tabIndex).toBe(0);
        expect(getComputedStyle(info.firstElementChild!).flexShrink).toBe("0");
        const footer = getComputedStyle(element(".kcq-difficulty-select__footer"));
        expect(footer.maxWidth).toBe("640px");
        expect(footer.marginInline).toBe("auto");
        expect(footer.height).toBe("48px");
        expect(footer.gap).toBe("8px");
    });

    it("preserves focus, previews, rules, and horizontal narrow controls across resizing", () => {
        const { host, element, choices, setDifficulty, setLayout } = mount();
        setDifficulty("extreme");
        const buttons = choices();
        buttons[3]!.focus();
        const previews = [...host.querySelectorAll(".kcq-preview-effect")];
        const table = element(".kcq-difficulty-select__rules-table");
        setLayout(narrowLayout);
        expect(getComputedStyle(host).width).toBe("366px");
        expect(getComputedStyle(element(".kcq-difficulty-select__body")).flexDirection).toBe("column");
        expect(getComputedStyle(element(".kcq-difficulty-select__choices")).gridTemplateColumns).toBe("repeat(5, minmax(0, 1fr))");
        expect(getComputedStyle(element(".kcq-difficulty-select__footer")).height).toBe("48px");
        expect(element(".kcq-difficulty-select__information").hasAttribute("tabindex")).toBe(false);
        expect(element(".kcq-difficulty-select__information").hasAttribute("role")).toBe(false);
        setLayout(wideLayout);
        expect(choices()).toEqual(buttons);
        expect(document.activeElement).toBe(buttons[3]);
        expect([...host.querySelectorAll(".kcq-preview-effect")]).toEqual(previews);
        expect(element(".kcq-difficulty-select__rules-table")).toBe(table);
    });

    it.each(Object.values(responsiveLayouts))("preserves header controls, footer clicks and shortcuts in layout %j", layout => {
        const { element, onBack, onStart, onSettings, onLibrary } = mount(layout);
        expect(element("h1").textContent).toBe(presentation.encounter("forest_3"));
        element<HTMLButtonElement>(".kcq-combat-header__settings").click();
        element<HTMLButtonElement>(".kcq-combat-header__library").click();
        expect(onSettings).toHaveBeenCalledOnce();
        expect(onLibrary).toHaveBeenCalledOnce();
        element<HTMLButtonElement>('[data-kcq-shortcut="enter"]').click();
        element<HTMLButtonElement>(".kcq-difficulty-select__footer button:first-child").click();
        expect(press("Enter").defaultPrevented).toBe(true);
        expect(press("Escape").defaultPrevented).toBe(true);
        expect(onStart).toHaveBeenCalledTimes(2);
        expect(onBack).toHaveBeenCalledTimes(2);
    });
});
