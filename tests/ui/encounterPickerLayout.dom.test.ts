import { readFileSync } from "node:fs";
import { createComponent, createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CampaignReference } from "../../src/engine/public/library";
import { createStockEngine } from "../../src/stock";
import { Presentation } from "../../src/ui/presentation/presentation";
import { EncounterPickerPanel } from "../../src/ui/web/app/components/EncounterPickerPanel";
import { combatShortcut, useCombatKeyboard } from "../../src/ui/web/app/keyboard";
import { ResponsiveLayoutContext, type ResponsiveLayout } from "../../src/ui/web/app/responsiveScale";
import { createEncounterPickerViewModel } from "../../src/ui/web/app/viewModels/encounters";
import { stockStrings } from "../helpers/stockStrings";
import { responsiveLayouts, responsivePresentationCases } from "../helpers/responsiveLayouts";

const library = createStockEngine().getLibrary();
const presentation = new Presentation({ ...stockStrings, "campaign.skunk.act3.name": "Third Act" });
let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); document.body.replaceChildren(); });

function mount(campaign: CampaignReference = library.campaigns.skunk, showAll = false) {
    const host = document.createElement("div");
    const style = document.createElement("style");
    style.textContent = readFileSync("src/ui/web/app/app.css", "utf8");
    document.body.append(style, host);
    const [layout, setLayout] = createSignal<ResponsiveLayout>(responsiveLayouts.wide);
    const [all, setAll] = createSignal(showAll);
    const onSelect = vi.fn();
    const onBack = vi.fn();
    const onChangeParty = vi.fn();
    dispose = render(() => {
        useCombatKeyboard(() => host, () => true, () => false, () => "always");
        return createComponent(ResponsiveLayoutContext.Provider, {
            value: layout,
            get children() { return createComponent(EncounterPickerPanel, {
                get model() { return createEncounterPickerViewModel(library, presentation, campaign, { plains_1: "mythic" }, ["plains_1"], all()); },
                onSelect, onShowAllChange: setAll, onBack, onChangeParty,
            }); },
        });
    }, host);
    return { host, setLayout, onSelect, onBack, onChangeParty };
}
const cards = (root: ParentNode) => [...root.querySelectorAll<HTMLButtonElement>(".kcq-encounter-picker__row")];
const names = (root: ParentNode) => cards(root).map(card => card.querySelector("strong")?.textContent);
const press = (key: string) => {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    document.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
    return event;
};

describe("desktop encounter overview", () => {
    it("keeps named card regions, unclipped badges, and usable footer actions", () => {
        const { host, onBack, onChangeParty } = mount(undefined, true);
        const campaign = host.querySelector<HTMLElement>(".kcq-encounter-picker__campaign")!;
        expect(campaign.style.getPropertyValue("--kcq-campaign-columns")).toBe("3");
        const row = cards(host)[1]!;
        expect(row.parentElement!.className).toBe("kcq-encounter-picker__card-container");
        expect(getComputedStyle(row).display).toBe("grid");
        expect(getComputedStyle(row).gridTemplateAreas.replace(/\s+/g, " ")).toBe('"name stars best"');
        // Wide cards place metadata beside the name in named regions.
        for (const [selector, area] of [["strong", "name"], [".kcq-encounter-picker__stars", "stars"], [".kcq-encounter-picker__best-clear", "best"]] as const) {
            expect(getComputedStyle(row.querySelector(selector)!).gridArea).toBe(area);
            expect(getComputedStyle(row).gridTemplateAreas).toContain(area);
        }
        const name = getComputedStyle(row.querySelector("strong")!);
        expect(name.whiteSpace).toBe("nowrap");
        expect(name.textOverflow).toBe("ellipsis");
        expect(getComputedStyle(row.querySelector(".kcq-encounter-picker__stars")!).whiteSpace).toBe("nowrap");
        expect(getComputedStyle(host.querySelector(".kcq-encounter-picker__show-all span")!).whiteSpace).toBe("nowrap");
        const footer = host.querySelector<HTMLElement>(".kcq-screen-actions")!;
        expect(getComputedStyle(footer).display).toBe("grid");
        expect(getComputedStyle(footer).gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))");
        expect([...footer.querySelectorAll<HTMLButtonElement>("button")].every(button => !button.disabled && button.tabIndex === 0)).toBe(true);
        expect(getComputedStyle(host.querySelector(".kcq-screen-layout__body")!).overflowY).toBe("auto");
        host.querySelector<HTMLButtonElement>(".kcq-encounter-picker__change-party")!.click();
        expect(onChangeParty).toHaveBeenCalledOnce();
        expect(press("Escape").defaultPrevented).toBe(true);
        expect(onBack).toHaveBeenCalledOnce();
    });

    it("derives shared track sizing from arbitrary authored column counts", () => {
        const campaign = { ...library.campaigns.skunk, layout: [
            library.campaigns.skunk.layout![0]!,
            [...library.campaigns.skunk.layout![1]!, { name: "act1", chapters: [] }],
            library.campaigns.skunk.layout![2]!,
        ] };
        const { host } = mount(campaign);
        expect(host.querySelector<HTMLElement>(".kcq-encounter-picker__campaign")!.style.getPropertyValue("--kcq-campaign-columns")).toBe("4");
        const rows = [...host.querySelectorAll<HTMLElement>(".kcq-encounter-picker__campaign-row")];
        expect(rows.map(row => row.style.gridTemplateColumns)).toEqual([
            "repeat(1, minmax(0, 1fr))", "repeat(4, minmax(0, 1fr))", "repeat(1, minmax(0, 1fr))",
        ]);
    });

    it("renders the stock authored rows with localized section headings and shared disabled cards", () => {
        const { host, onSelect } = mount();
        const rows = [...host.querySelectorAll(".kcq-encounter-picker__campaign-row")];
        expect(rows.map(row => row.querySelectorAll("section").length)).toEqual([1, 3, 1]);
        expect([...host.querySelectorAll("h2")].map(heading => heading.textContent)).toEqual(["Prologue", "Act 1", "Act 2", "Third Act", "Epilogue"]);
        const sections = rows.flatMap(row => [...row.querySelectorAll("section")]);
        const model = createEncounterPickerViewModel(library, presentation, library.campaigns.skunk, {}, ["plains_1"]);
        expect(sections.map(names)).toEqual(model.layout!.flat().map(section => section.encounters.map(encounter => encounter.name)));
        expect(cards(host)).toHaveLength(model.encounters.length);
        const locked = cards(host).find(card => card.disabled)!;
        expect(locked.querySelector("[aria-label], .kcq-encounter-picker__stars, .kcq-encounter-picker__best-clear")).toBeNull();
        locked.click();
        expect(press(locked.dataset.kcqShortcut!).defaultPrevented).toBe(false);
        expect(onSelect).not.toHaveBeenCalled();
        cards(host)[1]!.click();
        expect(onSelect).toHaveBeenCalledWith("plains_1");
    });

    it("keeps flat shortcut assignments when the visual ordering differs and switches to the unchanged mobile list", () => {
        const campaign = { ...library.campaigns.skunk, layout: [
            [{ name: "act3", chapters: ["tower_3", "tower_1"] }, { name: "act1", chapters: ["plains_2", "plains_1"] }],
        ] };
        const { host, setLayout, onSelect } = mount(campaign, true);
        const flat = createEncounterPickerViewModel(library, presentation, campaign, {}, [], true).encounters;
        expect(names(host).slice(0, 4)).toEqual(["tower_3", "tower_1", "plains_2", "plains_1"].map(id => presentation.encounter(id)));
        for (const [index, encounter] of flat.entries()) {
            const card = cards(host).find(card => card.querySelector("strong")?.textContent === encounter.name)!;
            expect(card.dataset.kcqShortcut).toBe(combatShortcut(index));
            expect(press(combatShortcut(index)!).defaultPrevented).toBe(true);
            expect(onSelect).toHaveBeenLastCalledWith(encounter.id);
        }
        expect(host.querySelector(".kcq-encounter-picker__additional h2")?.textContent).toBe("Other Encounters");
        setLayout(responsiveLayouts.narrow);
        expect(host.querySelector(".kcq-encounter-picker--overview")).toBeNull();
        expect(host.querySelector("h2")).toBeNull();
        expect(names(host)).toEqual(flat.map(encounter => encounter.name));
        expect(cards(host).map(card => card.dataset.kcqShortcut)).toEqual(flat.map((_, index) => combatShortcut(index)));
        expect(getComputedStyle(cards(host)[0]!).gridTemplateColumns).toBe("minmax(0, 1fr) auto 75px");
        setLayout(responsiveLayouts.medium);
        expect(host.querySelector(".kcq-encounter-picker--overview")).not.toBeNull();
        expect(host.querySelector(".kcq-encounter-picker--wide")).toBeNull();
        expect(cards(host)).toHaveLength(flat.length);
        expect(getComputedStyle(cards(host)[0]!).gridTemplateAreas.replace(/\s+/g, " ")).toBe('"name name name" "stars . best"');
    });

    it.each(responsivePresentationCases)("uses the selected form factor with layout %j: %s", (layout, organized) => {
        const { host, setLayout } = mount();
        setLayout(layout);
        expect(!!host.querySelector(".kcq-encounter-picker--overview")).toBe(organized);
        expect(!!host.querySelector(".kcq-encounter-picker--wide")).toBe(layout.size === "wide");
        const card = cards(host).find(card => card.querySelector(".kcq-encounter-picker__stars"))!;
        expect(getComputedStyle(card).gridTemplateAreas.replace(/\s+/g, " ")).toBe(layout.size === "narrow" ? "" :
            layout.size === "medium" ? '"name name name" "stars . best"' : '"name stars best"');
    });

    it("reveals extra encounters beneath the overview with Show All and removes them when switched off", () => {
        const campaign = { ...library.campaigns.skunk, initial: ["plains_1"], victory: {}, defeat: {},
            layout: [[{ name: "act1", chapters: ["plains_1"] }]] };
        const { host, onSelect } = mount(campaign);
        expect(cards(host)).toHaveLength(1);
        expect(host.querySelector(".kcq-encounter-picker__additional")).toBeNull();
        host.querySelector<HTMLInputElement>("input")!.click();
        const extras = host.querySelector(".kcq-encounter-picker__additional")!;
        expect(cards(extras)).toHaveLength(Object.keys(library.encounters).length - 1);
        expect(cards(host).every(card => !card.disabled)).toBe(true);
        cards(extras)[0]!.click();
        expect(onSelect).toHaveBeenCalledWith("prologue");
        host.querySelector<HTMLInputElement>("input")!.click();
        expect(host.querySelector(".kcq-encounter-picker__additional")).toBeNull();
        expect(cards(host)).toHaveLength(1);
    });

    it.each([undefined, []])("uses the original list on desktop without populated metadata: %s", layout => {
        const { host } = mount({ ...library.campaigns.skunk, layout }, true);
        expect(host.querySelector(".kcq-encounter-picker--overview")).toBeNull();
        expect(host.querySelector("h2")).toBeNull();
        expect(cards(host)).toHaveLength(Object.keys(library.encounters).length);
        expect(getComputedStyle(cards(host)[0]!).gridTemplateColumns).toBe("minmax(0, 1fr) auto 75px");
    });
});