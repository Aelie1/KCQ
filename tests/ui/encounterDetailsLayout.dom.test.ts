import { readFileSync } from "node:fs";
import { createComponent, createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStockEngine } from "../../src/stock";
import { Presentation } from "../../src/ui/presentation/presentation";
import { EncounterDetailsPanel } from "../../src/ui/web/app/components/EncounterDetailsPanel";
import { useCombatKeyboard } from "../../src/ui/web/app/keyboard";
import { ResponsiveLayoutContext, type ResponsiveLayout } from "../../src/ui/web/app/responsiveScale";
import { createEncounterDetailsViewModel } from "../../src/ui/web/app/viewModels/encounters";
import { stockStrings } from "../helpers/stockStrings";

const library = createStockEngine().getLibrary();
const presentation = new Presentation(stockStrings);
const desktop: ResponsiveLayout = { columns: 3, zoom: 1, availableWidth: 1068 };
const mobile: ResponsiveLayout = { columns: 1, zoom: 1, availableWidth: 366 };
const combat = () => createEncounterDetailsViewModel(library, "outside", presentation, "standard");
let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); document.body.replaceChildren(); });

function mount(model = combat(), initialLayout = desktop) {
    const style = document.createElement("style");
    style.textContent = readFileSync("src/ui/web/app/tokens.css", "utf8") + readFileSync("src/ui/web/app/app.css", "utf8");
    const host = document.createElement("div");
    host.className = "kcq-graphical-app__background";
    host.style.setProperty("--kcq-ui-height", "480px");
    document.body.append(style, host);
    const [layout, setLayout] = createSignal(initialLayout);
    const onBack = vi.fn(), onChooseDifficulty = vi.fn(), onNextLevel = vi.fn(), onSettings = vi.fn(), onLibrary = vi.fn();
    dispose = render(() => {
        useCombatKeyboard(() => host, () => true, () => false, () => "always");
        return createComponent(ResponsiveLayoutContext.Provider, {
            value: layout,
            get children() { return createComponent(EncounterDetailsPanel, {
                model, onBack, onChooseDifficulty, onNextLevel, onSettings, onLibrary, libraryLabel: "Library",
            }); },
        });
    }, host);
    const element = <T extends HTMLElement = HTMLElement>(selector: string): T => {
        const found = host.querySelector<T>(selector);
        if (!found) throw new Error("Missing " + selector);
        return found;
    };
    return { host, element, setLayout, onBack, onChooseDifficulty, onNextLevel, onSettings, onLibrary };
}

function press(key: string, target: EventTarget = document) {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    target.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
    return event;
}

describe("encounter details responsive layout", () => {
    it("places a compact summary above two columns and centers compact footer actions", () => {
        const { host, element, onBack, onChooseDifficulty, onSettings, onLibrary } = mount();
        expect(getComputedStyle(host).width).toBe("840px");
        expect(getComputedStyle(element(".kcq-encounter-header")).width).toBe("100%");
        expect(element("h1").textContent).toBe(combat().name);
        const summary = element(".kcq-encounter-details__info");
        const columns = element(".kcq-encounter-details__columns");
        expect(summary.nextElementSibling).toBe(columns);
        expect(getComputedStyle(summary).width).toBe("100%");
        expect(getComputedStyle(summary.firstElementChild!).minHeight).toBe("28px");
        expect(summary.textContent).toContain(combat().bestClearLabel);
        expect(getComputedStyle(columns).gridTemplateColumns).toBe("minmax(0, 1fr) 366px");
        expect(getComputedStyle(columns).gap).toBe("24px");
        expect([...element(".kcq-encounter-details__information").children]).toEqual([
            element(".kcq-encounter-details__enemies"), element(".kcq-encounter-details__rules"),
        ]);
        const footer = getComputedStyle(element(".kcq-encounter-details__footer"));
        expect(footer.maxWidth).toBe("366px");
        expect(footer.marginInline).toBe("auto");
        expect(footer.height).toBe("auto");
        expect(footer.gap).toBe("8px");
        element<HTMLButtonElement>(".kcq-combat-header__settings").click();
        element<HTMLButtonElement>(".kcq-combat-header__library").click();
        expect(onSettings).toHaveBeenCalledOnce();
        expect(onLibrary).toHaveBeenCalledOnce();
        expect(press("Enter").defaultPrevented).toBe(true);
        expect(onChooseDifficulty).toHaveBeenCalledOnce();
        expect(press("Escape").defaultPrevented).toBe(true);
        expect(onBack).toHaveBeenCalledOnce();
    });

    it.each([
        [{ columns: 3, zoom: 1, availableWidth: 366 }, false],
        [{ columns: 3, zoom: 1, availableWidth: 839 }, false],
        [{ columns: 2, zoom: 1, availableWidth: 840 }, true],
        [{ columns: 2, zoom: 1.5, availableWidth: 1259 }, false],
        [{ columns: 1, zoom: 1.5, availableWidth: 1260 }, true],
        [{ columns: 2, zoom: 1 }, false],
        [{ columns: 3, zoom: 1 }, true],
    ] satisfies [ResponsiveLayout, boolean][])("fits the zoomed canvas with layout %j: %s", (layout, wide) => {
        const { host } = mount(undefined, layout);
        expect(!!host.querySelector(".kcq-encounter-details--desktop")).toBe(wide);
    });

    it("bounds the desktop body and gives long narrative and complex rules independent scroll areas", () => {
        const base = combat();
        const description = "First paragraph.\n\n  Indented line.\n".repeat(150) + "Narrative ending.";
        const model = { ...base, description, effectGroups: Array.from({ length: 30 }, (_, index) => ({
            id: "rule-group-" + index, name: "Rule group " + index, effects: [...base.effects, ...base.effectGroups.flatMap(group => group.effects)],
        })) };
        const { host, element } = mount(model);
        const narrative = element(".kcq-encounter-details__narrative");
        const information = element(".kcq-encounter-details__information");
        expect(narrative.textContent).toBe(description);
        expect(getComputedStyle(element(".kcq-encounter-details__description p")).whiteSpace).toBe("pre-wrap");
        expect(element(".kcq-encounter-details__rules").textContent).toContain("Rule group 29");
        expect(host.querySelectorAll(".kcq-preview-effect").length).toBeGreaterThanOrEqual(30);
        // Happy DOM checks the scrolling contract; it does not calculate rendered geometry.
        expect(getComputedStyle(element(".kcq-encounter-details")).gridTemplateRows).toBe("auto minmax(0, 1fr) auto");
        expect(getComputedStyle(element(".kcq-screen-layout__body")).overflowY).toBe("auto");
        expect(getComputedStyle(element(".kcq-screen-layout__content")).minHeight).toBe("128px");
        for (const selector of [".kcq-encounter-details__body", ".kcq-encounter-details__columns", ".kcq-encounter-details__description"]) {
            expect(getComputedStyle(element(selector)).minHeight).toBe("0");
        }
        for (const region of [narrative, information]) {
            expect(getComputedStyle(region).overflow).toBe("auto");
            expect(getComputedStyle(region).overscrollBehavior).toBe("contain");
            expect(region.tabIndex).toBe(0);
        }
        expect(getComputedStyle(information.firstElementChild!).flexShrink).toBe("0");
        expect(getComputedStyle(element(".kcq-encounter-details__description")).overflowY).toBe("auto");
        expect(getComputedStyle(narrative).minHeight).toBe("24px");
        expect(information.getAttribute("aria-label")).toBe(`${model.labels.enemies}, ${model.labels.specialRules}`);
    });

    it("preserves every enemy and preview node and the stacked mobile presentation when resized", () => {
        const model = combat();
        const { host, element, setLayout } = mount(model);
        const enemies = [...host.querySelectorAll(".kcq-encounter-details__enemy")];
        expect(enemies.map(enemy => enemy.textContent)).toEqual(model.enemies.map(enemy => enemy.name + enemy.rankLabel + enemy.hpLabel));
        const previews = [...host.querySelectorAll(".kcq-preview-effect")];
        const ruleText = element(".kcq-encounter-details__rules").textContent;
        expect(previews.length).toBeGreaterThan(0);
        setLayout(mobile);
        expect(host.querySelector(".kcq-encounter-details--desktop")).toBeNull();
        expect(getComputedStyle(host).width).toBe("366px");
        expect(getComputedStyle(element(".kcq-encounter-details__columns")).display).toBe("flex");
        expect(getComputedStyle(element(".kcq-encounter-details__columns")).flexDirection).toBe("column");
        expect(getComputedStyle(element(".kcq-screen-layout__body")).overflowY).toBe("auto");
        expect(getComputedStyle(element(".kcq-encounter-details__info>div")).minHeight).toBe("54px");
        expect(getComputedStyle(element(".kcq-encounter-details__footer")).height).toBe("48px");
        expect(element(".kcq-encounter-details__information").hasAttribute("tabindex")).toBe(false);
        expect(element(".kcq-encounter-details__information").hasAttribute("role")).toBe(false);
        setLayout(desktop);
        expect([...host.querySelectorAll(".kcq-encounter-details__enemy")]).toEqual(enemies);
        expect([...host.querySelectorAll(".kcq-preview-effect")]).toEqual(previews);
        expect(element(".kcq-encounter-details__rules").textContent).toBe(ruleText);
    });

    it("keeps narrative selection, keyboard navigation and focus across responsive changes", () => {
        const model = { ...combat(), victory: "Victory.\n\n  Another paragraph.", defeat: "Defeat." };
        const { host, element, setLayout, onChooseDifficulty } = mount(model);
        const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
        tabs[0]!.focus();
        for (const [key, index] of [["ArrowRight", 1], ["End", 2], ["ArrowRight", 0], ["ArrowLeft", 2], ["Home", 0]] as const) {
            expect(press(key, document.activeElement!).defaultPrevented).toBe(true);
            expect(document.activeElement).toBe(tabs[index]);
            expect(element('[role="tabpanel"]').textContent).toBe(model[(["description", "victory", "defeat"] as const)[index]]);
        }
        tabs[1]!.focus();
        press(" ", tabs[1]);
        setLayout(mobile);
        setLayout(desktop);
        expect(document.activeElement).toBe(tabs[1]);
        expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
        expect(element('[role="tabpanel"]').getAttribute("aria-labelledby")).toBe(tabs[1]!.id);
        expect(element('[role="tabpanel"]').textContent).toBe(model.victory);
        press("Enter", tabs[1]);
        expect(onChooseDifficulty).not.toHaveBeenCalled();
    });

    it.each(["enemies", "rules", "both"])("handles absent %s without empty panels", absent => {
        const model = { ...combat(),
            ...(absent !== "rules" ? { enemies: [] } : {}),
            ...(absent !== "enemies" ? { effects: [], effectGroups: [] } : {}),
        };
        const { host, element } = mount(model);
        expect(!!host.querySelector(".kcq-encounter-details__enemies")).toBe(absent === "rules");
        expect(!!host.querySelector(".kcq-encounter-details__rules")).toBe(absent === "enemies");
        if (absent === "both") {
            expect(host.querySelector(".kcq-encounter-details__information")).toBeNull();
            expect(getComputedStyle(element(".kcq-encounter-details__columns")).gridTemplateColumns).toBe("minmax(0, 1fr)");
        }
    });

    it("keeps locked narratives disabled on desktop", () => {
        const { host, element } = mount(createEncounterDetailsViewModel(library, "outside", presentation));
        const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
        expect(tabs.map(tab => tab.disabled)).toEqual([false, true, true]);
        tabs[0]!.focus();
        press("End", tabs[0]);
        expect(document.activeElement).toBe(tabs[0]);
        expect(element('[role="tabpanel"]').textContent).toBe(combat().description);
    });

    it("uses full-width scrollable story text without a challenge rating and preserves Next Level", () => {
        const model = createEncounterDetailsViewModel(library, "prologue", presentation, undefined, "skunk");
        const { host, element, onNextLevel, onChooseDifficulty } = mount(model);
        expect(host.querySelector(".kcq-encounter-details__info")).toBeNull();
        expect(host.querySelector('[role="tablist"]')).toBeNull();
        expect(getComputedStyle(element(".kcq-encounter-details__columns")).gridTemplateColumns).toBe("minmax(0, 1fr)");
        expect(element(".kcq-encounter-details__narrative").textContent).toBe(model.description);
        expect(element(".kcq-encounter-details__narrative").tabIndex).toBe(0);
        expect(element('[data-kcq-shortcut="enter"]').textContent).toContain(model.labels.nextLevel);
        press("Enter");
        expect(onNextLevel).toHaveBeenCalledOnce();
        expect(onChooseDifficulty).not.toHaveBeenCalled();
    });
});
