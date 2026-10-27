import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStockEngine } from "../../src/stock";
import { Presentation } from "../../src/ui/presentation/presentation";
import { LibraryPanel } from "../../src/ui/web/app/panels/LibraryPanel";
import { layoutSize, ResponsiveLayoutContext, type ResponsiveLayout } from "../../src/ui/web/app/responsiveScale";
import { GAME_GUIDE_PAGES } from "../../src/ui/web/app/content/gameGuide";
import type { LibraryPage } from "../../src/ui/web/app/viewModels/library";
import { stockStrings } from "../helpers/stockStrings";

const presentation = new Presentation(stockStrings);
let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); document.body.replaceChildren(); vi.restoreAllMocks(); });
const tick = () => new Promise<void>(resolve => queueMicrotask(resolve));
function element<T extends HTMLElement = HTMLElement>(selector: string): T {
    const result = document.querySelector<T>(selector);
    if (!result) throw Error("Missing " + selector);
    return result;
}
function mount(columns: ResponsiveLayout["columns"], initialPage?: LibraryPage, zoom = 1) {
    const engine = createStockEngine();
    const execute = vi.spyOn(engine, "executeAction");
    const before = JSON.stringify(engine.getGameState());
    const host = document.createElement("div"); document.body.append(host);
    dispose = render(() => createComponent(ResponsiveLayoutContext.Provider, {
        value: () => ({ columns, size: layoutSize(columns), zoom }),
        get children() { return createComponent(LibraryPanel, { library: engine.getLibrary(), presentation, onClose() {}, initialPage }); },
    }), host);
    return { engine, before, execute };
}
const back = () => element(".kcq-library__header-back").click();
const article = () => element(".kcq-library__detail");
const body = () => element(".kcq-library .kcq-screen-layout__body");
const link = (destination: string) => element<HTMLButtonElement>('.kcq-library__guide button[data-library-focus="' + destination + '"]');

describe("Game Guide in the Library", () => {
    it.each([1, 3] as const)("promotes all five pages on the %s-column home and preserves navigation order", async columns => {
        const { engine, before, execute } = mount(columns); await tick();
        const quickLinks = [...document.querySelectorAll<HTMLButtonElement>('.kcq-library__guide-pages [data-library-focus^="guide:"]')];
        expect(quickLinks.map(button => button.textContent)).toEqual(["Basics", "Moves", "Bindings and Escaping", "Modifiers", "Strategy"]);
        expect([...document.querySelectorAll(".kcq-library__guide-page")].map(row => row.textContent)).toEqual([
            "Basics: Learn about the basic structure of KCQ",
            "Moves: Learn about moves, traits, and results",
            "Bindings and Escaping: Learn about bindings and thresholds",
            "Modifiers: Details about the modifiers in KCQ",
            "Strategy: Some tips to get you started",
        ]);
        quickLinks[0]!.click(); await tick();
        expect(article().dataset.libraryId).toBe("basics");
        expect(element(".kcq-library__breadcrumbs").textContent).toContain("Library/Game Guide");
        element(".kcq-library__breadcrumbs button:last-child").click(); await tick();
        expect([...document.querySelectorAll(".kcq-library__entry")].map(button => button.textContent)).toEqual(quickLinks.map(button => button.textContent));
        if (columns === 3) {
            expect([...document.querySelectorAll<HTMLElement>('[data-library-tree-entry^="guide:"]')].map(button => button.dataset.libraryTreeEntry)).toEqual(GAME_GUIDE_PAGES.map(page => "guide:" + page.id));
        }
        for (const page of GAME_GUIDE_PAGES) {
            const selector = columns === 3 ? '[data-library-tree-entry="guide:' + page.id + '"]' : '.kcq-library__entry[data-library-focus="' + page.id + '"]';
            element(selector).click(); await tick();
            expect(article().dataset.libraryId).toBe(page.id);
            expect(article().textContent).not.toMatch(/\[[^\]]+\]/);
            expect(document.querySelector(".kcq-library__guide button:disabled")).toBeNull();
            expect(document.querySelectorAll(".kcq-library__guide [data-library-section]")).toHaveLength(page.sections.length);
            if (columns === 3) expect(element('[data-library-tree-entry="guide:' + page.id + '"]').getAttribute("aria-current")).toBe("page");
            back(); await tick();
        }
        expect(execute).not.toHaveBeenCalled();
        expect(JSON.stringify(engine.getGameState())).toBe(before);
    });
    it("renders command tags, authored tables, binding colors, a plain modifier table, and ordinary strategy bullets", async () => {
        mount(1, { kind: "entry", category: "guide", id: "moves" }); await tick();
        expect([...document.querySelectorAll(".kcq-library__guide-traits .kcq-command-tag")].map(tag => tag.textContent)).toEqual(["Damage", "Buff", "Debuff", "Escape", "One-time", "Free"]);
        expect([...element('[data-library-section="move-results"] table').querySelectorAll("tr")].map(row => [...row.children].map(cell => cell.textContent))).toEqual([
            ["Miss", "0% Effectiveness"], ["Graze", "20-50% Effectiveness"], ["Hit", "80-100% Effectiveness"], ["Crit", "150-200% Effectiveness"],
        ]);
        const results = element('[data-library-section="move-results"]');
        expect(results.querySelector("button")).toBeNull();
        expect([...results.querySelectorAll(".kcq-status-chip")].map(chip => chip.className)).toEqual([
            "kcq-status-chip kcq-status-chip--outcome-miss kcq-status-chip--compact",
            "kcq-status-chip kcq-status-chip--outcome-graze kcq-status-chip--compact",
            "kcq-status-chip kcq-status-chip--outcome-hit kcq-status-chip--compact",
            "kcq-status-chip kcq-status-chip--outcome-crit kcq-status-chip--compact",
        ]);
        dispose!(); mount(1, { kind: "entry", category: "guide", id: "bindings-and-escaping" }); await tick();
        expect([...element('[data-library-section="escaping"] table').querySelectorAll("tr")].map(row => [...row.children].map(cell => cell.textContent))).toEqual([
            ["Escape Target", "Req", "Base removal", "Minimum removal"], ["Self", "None", "20", "5"], ["Ally", "Arms <Severe", "30", "8"],
        ]);
        expect([...element('[data-library-section="binding-severity"]').querySelectorAll("tr")].map(row => row.className)).toEqual(["kcq-escape-value--light", "kcq-escape-value--moderate", "kcq-escape-value--heavy", "kcq-escape-value--severe", "kcq-escape-value--overwhelming"]);
        expect(document.querySelectorAll('[data-library-section="bonus-escapes"] ol > li')).toHaveLength(3);
        dispose!(); mount(1, { kind: "entry", category: "guide", id: "modifiers" }); await tick();
        const modifiers = element(".kcq-library__guide-modifiers");
        expect([...modifiers.querySelectorAll("thead th")].map(cell => cell.textContent)).toEqual(["Name", "Description"]);
        expect([...modifiers.querySelectorAll("tbody tr")].map(row => [...row.children].map(cell => cell.textContent))).toEqual([
            ["Mouth", "Affects accuracy of outgoing Mouth moves"],
            ["Arms", "Affects accuracy of outgoing Arms moves"],
            ["Legs", "Affects accuracy of outgoing Legs moves"],
            ["Hit", "Affects accuracy of all outgoing moves"],
            ["Defense", "Affects accuracy of incoming moves"],
            ["Escape", "Affects the amount of binding removed during an escape"],
            ["Vulnerability", "Affects the effectiveness of incoming moves"],
            ["Potency", "Affects the effectiveness of outgoing moves"],
            ["Traps", "Affects the chance of triggering a trap"],
            ["Willpower", "Affects the accuracy of Willpower moves"],
            ["Spread", "Affects the amount of binding that is spread to other locations by escapes"],
            ["Regeneration", "Affects the amount of health automatically gained every round"],
        ]);
        expect(article().querySelector(".kcq-pip-meter, button, a")).toBeNull();
        dispose!(); mount(1, { kind: "entry", category: "guide", id: "strategy" }); await tick();
        expect(document.querySelectorAll(".kcq-library__guide ul > li")).toHaveLength(8);
        expect(document.querySelector(".kcq-library__guide ol")).toBeNull();
        expect(article().textContent).toContain("In almost all cases, enemies at 1hp are just as dangerous as enemies at full health.");
    });
    it("scrolls to a heading, then restores saved scroll and focus through reference and forward history", async () => {
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
            const top = this.dataset.librarySection === "bonus-escapes" ? 240 : 0;
            return { top, bottom: top + 30, left: 0, right: 300, width: 300, height: 30, x: 0, y: top, toJSON() {} };
        });
        mount(3, { kind: "entry", category: "guide", id: "basics" }); await tick();
        body().scrollTop = 65;
        link("guide:bindings-and-escaping#bonus-escapes").focus();
        link("guide:bindings-and-escaping#bonus-escapes").click(); await tick();
        expect(article().dataset.libraryId).toBe("bindings-and-escaping");
        expect(body().scrollTop).toBe(240);
        expect(document.activeElement).toBe(element('[data-library-section="bonus-escapes"]'));
        body().scrollTop = 310;
        link("statuses:vibrating").focus(); link("statuses:vibrating").click(); await tick();
        expect(article().dataset.libraryCategory).toBe("statuses");
        expect(article().dataset.libraryId).toBe("vibrating");
        back(); await tick();
        expect(body().scrollTop).toBe(310);
        expect(document.activeElement).toBe(link("statuses:vibrating"));
        back(); await tick();
        expect(body().scrollTop).toBe(65);
        expect(document.activeElement).toBe(link("guide:bindings-and-escaping#bonus-escapes"));
        element(".kcq-library__history-forward").click(); await tick();
        expect(article().dataset.libraryId).toBe("bindings-and-escaping");
        expect(body().scrollTop).toBe(310);
        element(".kcq-library__history-forward").click(); await tick();
        expect(article().dataset.libraryId).toBe("vibrating");
    });
    it("keeps status, trap-category, and modifier links inside the Library", async () => {
        mount(1, { kind: "entry", category: "guide", id: "basics" }); await tick();
        link("statuses:immobilized").click(); await tick(); expect(article().dataset.libraryId).toBe("immobilized");
        back(); await tick(); link("traps").click(); await tick();
        expect(element(".kcq-library__header h1").textContent).toBe("Traps");
        expect(document.querySelector(".kcq-library__entry")).not.toBeNull();
        back(); await tick(); link("guide:modifiers#defense").click(); await tick();
        expect(article().dataset.libraryId).toBe("modifiers");
        expect(document.activeElement).toBe(element('[data-library-section="defense"]'));
    });
    it("reveals the existing Traps tree when a desktop guide link opens that category", async () => {
        mount(3, { kind: "entry", category: "guide", id: "basics" }); await tick();
        link("traps").click(); await tick();
        expect(element('[data-library-category-toggle="traps"]').getAttribute("aria-expanded")).toBe("true");
        expect(document.querySelector('[data-library-tree-entry^="traps:"]')).not.toBeNull();
    });
    it("accounts for the existing UI zoom when revealing a heading", async () => {
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
            const top = this.dataset.librarySection === "defense" ? 300 : 0;
            return { top, bottom: top + 30, left: 0, right: 300, width: 300, height: 30, x: 0, y: top, toJSON() {} };
        });
        mount(3, { kind: "entry", category: "guide", id: "basics" }, 1.5); await tick();
        link("guide:modifiers#defense").click(); await tick();
        expect(body().scrollTop).toBe(200);
        expect(document.activeElement).toBe(element('[data-library-section="defense"]'));
    });
    it("reveals an initially requested subsection", async () => {
        mount(1, { kind: "entry", category: "guide", id: "basics", section: "stances" }); await tick();
        expect(document.activeElement).toBe(element('[data-library-section="stances"]'));
    });
});
