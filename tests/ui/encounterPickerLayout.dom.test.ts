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

const library = createStockEngine().getLibrary();
const presentation = new Presentation({ ...stockStrings, "campaign.skunk.act3.name": "Third Act" });
let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); document.body.replaceChildren(); });

function mount(campaign: CampaignReference = library.campaigns.skunk, showAll = false) {
    const host = document.createElement("div");
    const style = document.createElement("style");
    style.textContent = readFileSync("src/ui/web/app/app.css", "utf8");
    document.body.append(style, host);
    const [layout, setLayout] = createSignal<ResponsiveLayout>({ columns: 3, zoom: 1, availableWidth: 1068 });
    const [all, setAll] = createSignal(showAll);
    const onSelect = vi.fn();
    dispose = render(() => {
        useCombatKeyboard(() => host, () => true, () => false, () => "always");
        return createComponent(ResponsiveLayoutContext.Provider, {
            value: layout,
            get children() { return createComponent(EncounterPickerPanel, {
                get model() { return createEncounterPickerViewModel(library, presentation, campaign, { plains_1: "mythic" }, ["plains_1"], all()); },
                onSelect, onShowAllChange: setAll,
            }); },
        });
    }, host);
    return { host, setLayout, onSelect };
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
        // A forced battle column setting must still preserve the phone picker.
        setLayout({ columns: 3, zoom: 1, availableWidth: 366 });
        expect(host.querySelector(".kcq-encounter-picker--overview")).toBeNull();
        expect(host.querySelector("h2")).toBeNull();
        expect(names(host)).toEqual(flat.map(encounter => encounter.name));
        expect(cards(host).map(card => card.dataset.kcqShortcut)).toEqual(flat.map((_, index) => combatShortcut(index)));
        expect(getComputedStyle(cards(host)[0]!).gridTemplateColumns).toBe("minmax(0, 1fr) auto 75px");
        setLayout({ columns: 2, zoom: 1, availableWidth: 756 });
        expect(host.querySelector(".kcq-encounter-picker--overview")).not.toBeNull();
        expect(host.querySelector(".kcq-encounter-picker--wide")).toBeNull();
        expect(cards(host)).toHaveLength(flat.length);
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