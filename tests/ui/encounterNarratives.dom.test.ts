import { readFileSync } from "node:fs";
import { createComponent, createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStockEngine } from "../../src/stock";
import { Presentation } from "../../src/ui/presentation/presentation";
import { EncounterDetailsPanel } from "../../src/ui/web/app/components/EncounterDetailsPanel";
import { GraphicalApp } from "../../src/ui/web/app/GraphicalApp";
import { useCombatKeyboard } from "../../src/ui/web/app/keyboard";
import { createEncounterDetailsViewModel } from "../../src/ui/web/app/viewModels/encounters";
import { stockStrings } from "../helpers/stockStrings";

const library = createStockEngine().getLibrary();
const presentation = new Presentation({
    ...stockStrings,
    "ui.encounter.description": "Description locale",
    "battleState.victory.name": "Victoire",
    "battleState.defeat.name": "Défaite",
    "encounter.plains_1.victory": "Première victoire.\n\n  Deuxième paragraphe.",
    "encounter.plains_1.defeat": "Première défaite.\n\n  Deuxième paragraphe.",
});
let unmount: (() => void) | undefined;
afterEach(() => { unmount?.(); document.body.replaceChildren(); localStorage.clear(); });

function mount(view: Parameters<typeof render>[0]): HTMLElement {
    const style = document.createElement("style");
    style.textContent = readFileSync("src/ui/web/app/tokens.css", "utf8") + readFileSync("src/ui/web/app/app.css", "utf8");
    const host = document.createElement("div");
    document.body.append(style, host);
    unmount = render(view, host);
    return host;
}
function element<T extends HTMLElement = HTMLElement>(selector: string): T {
    const found = document.querySelector<T>(selector);
    if (!found) throw new Error("Missing " + selector);
    return found;
}
const tabs = () => [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
const panel = () => element('[role="tabpanel"]');
function press(button: HTMLElement, key: string, repeat = false): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { key, repeat, bubbles: true, cancelable: true });
    button.dispatchEvent(event);
    button.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
    return event;
}

describe("Encounter Details narrative tabs", () => {
    it("defaults to Description and never renders locked narratives", () => {
        mount(() => createComponent(EncounterDetailsPanel, {
            model: createEncounterDetailsViewModel(library, "plains_1", presentation),
            onBack: () => {}, onChooseDifficulty: () => {},
        }));
        expect(tabs().map(tab => tab.textContent)).toEqual(["Description locale", "Victoire", "Défaite"]);
        expect(tabs().map(tab => tab.disabled)).toEqual([false, true, true]);
        expect(tabs().map(tab => tab.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
        tabs()[1]!.click(); tabs()[2]!.click();
        expect(panel().textContent).toBe(presentation.encounter("plains_1", "desc"));
        expect(document.body.textContent).not.toContain(presentation.referenceText("encounter", "plains_1", "victory"));
        expect(document.body.textContent).not.toContain(presentation.referenceText("encounter", "plains_1", "defeat"));
        tabs()[0]!.focus(); press(tabs()[0]!, "End");
        expect(document.activeElement).toBe(tabs()[0]);
    });

    it("switches both unlocked narratives in place with localized labels and preserved whitespace", () => {
        const onBack = vi.fn(); const onChooseDifficulty = vi.fn();
        mount(() => createComponent(EncounterDetailsPanel, {
            model: createEncounterDetailsViewModel(library, "plains_1", presentation, "casual"),
            onBack, onChooseDifficulty,
        }));
        const details = element(".kcq-encounter-details");
        expect(tabs().every(tab => !tab.disabled)).toBe(true);
        expect(panel().textContent).toBe(presentation.encounter("plains_1", "desc"));
        for (const [index, outcome] of [[1, "victory"], [2, "defeat"]] as const) {
            tabs()[index]!.click();
            expect(panel().textContent).toBe(presentation.referenceText("encounter", "plains_1", outcome));
            expect(panel().getAttribute("aria-labelledby")).toBe(tabs()[index]!.id);
            expect(tabs()[index]!.getAttribute("aria-controls")).toBe(panel().id);
            expect(tabs()[index]!.getAttribute("aria-selected")).toBe("true");
            expect(tabs().map(tab => tab.tabIndex)).toEqual(index === 1 ? [-1, 0, -1] : [-1, -1, 0]);
            expect(element(".kcq-encounter-details")).toBe(details);
        }
        const paragraph = element(".kcq-encounter-details__description p");
        expect(getComputedStyle(paragraph).whiteSpace).toBe("pre-wrap");
        expect(getComputedStyle(element(".kcq-encounter-details__tabs")).gridTemplateColumns).toBe("repeat(3, minmax(0, 1fr))");
        expect(getComputedStyle(tabs()[2]!).backgroundColor).not.toBe(getComputedStyle(tabs()[0]!).backgroundColor);
        tabs()[0]!.click();
        expect(panel().textContent).toBe(presentation.encounter("plains_1", "desc"));
        expect(onBack).not.toHaveBeenCalled(); expect(onChooseDifficulty).not.toHaveBeenCalled();
    });

    it("supports arrow, Home, End, Enter and Space without triggering screen shortcuts", async () => {
        const onChooseDifficulty = vi.fn();
        const host = mount(() => {
            useCombatKeyboard(() => host, () => true, () => false, () => "always");
            return createComponent(EncounterDetailsPanel, {
                model: createEncounterDetailsViewModel(library, "plains_1", presentation, "standard"),
                onBack: () => {}, onChooseDifficulty,
            });
        });
        await new Promise<void>(resolve => queueMicrotask(resolve));
        tabs()[0]!.focus();
        for (const [key, index] of [["ArrowRight", 1], ["ArrowRight", 2], ["ArrowRight", 0],
            ["ArrowLeft", 2], ["Home", 0], ["End", 2]] as const) {
            expect(press(document.activeElement as HTMLElement, key).defaultPrevented).toBe(true);
            expect(document.activeElement).toBe(tabs()[index]);
            expect(tabs()[index]!.getAttribute("aria-selected")).toBe("true");
        }
        for (const [key, index] of [[" ", 1], ["Enter", 0]] as const) {
            tabs()[index]!.focus();
            expect(press(tabs()[index]!, key).defaultPrevented).toBe(true);
            press(tabs()[index]!, key, true);
            expect(tabs()[index]!.getAttribute("aria-selected")).toBe("true");
        }
        expect(onChooseDifficulty).not.toHaveBeenCalled();
    });

    it("defaults to Description when the encounter changes, including an uncleared encounter", () => {
        const [model, setModel] = createSignal(createEncounterDetailsViewModel(library, "plains_1", presentation, "casual"));
        mount(() => createComponent(EncounterDetailsPanel, {
            get model() { return model(); }, onBack: () => {}, onChooseDifficulty: () => {},
        }));
        tabs()[2]!.click();
        setModel(createEncounterDetailsViewModel(library, "plains_2", presentation, "mythic"));
        expect(tabs()[0]!.getAttribute("aria-selected")).toBe("true");
        expect(panel().textContent).toBe(presentation.encounter("plains_2", "desc"));
        tabs()[1]!.click();
        setModel(createEncounterDetailsViewModel(library, "forest_1", presentation));
        expect(tabs().map(tab => tab.disabled)).toEqual([false, true, true]);
        expect(panel().textContent).toBe(presentation.encounter("forest_1", "desc"));
    });

    it("handles missing narratives without displaying localization keys", () => {
        const strings = { ...stockStrings };
        delete strings["encounter.plains_1.victory"];
        strings["encounter.plains_1.defeat"] = "...";
        const missing = new Presentation(strings);
        mount(() => createComponent(EncounterDetailsPanel, {
            model: createEncounterDetailsViewModel(library, "plains_1", missing, "standard"),
            onBack: () => {}, onChooseDifficulty: () => {},
        }));
        for (const tab of tabs().slice(1)) {
            expect(tab.disabled).toBe(false); tab.click();
            expect(panel().textContent).toBe(missing.ui("action.unavailable"));
            expect(panel().textContent).not.toMatch(/\[encounter\./);
        }
    });

    it("loads saved clears through the app and preserves details and navigation", () => {
        localStorage.setItem("kcq.clears", JSON.stringify({ outside: "casual", plains_1: "standard" }));
        const engine = createStockEngine();
        const prepareBattle = vi.fn(() => ({ engine, dispose: () => {} }));
        mount(() => createComponent(GraphicalApp, {
            campaigns: ["skunk"], release: "test", presentation,
            composeCampaign: () => ({ engine, presentation }), prepareBattle,
        }));
        element(".kcq-title-screen__campaign").click();
        const select = (id: string) => {
            const row = [...document.querySelectorAll<HTMLButtonElement>(".kcq-encounter-picker__row")]
                .find(row => row.querySelector(".kcq-encounter-picker__name")?.textContent === presentation.encounter(id));
            expect(row).toBeDefined(); row!.click();
        };
        select("outside");
        const unchanged = ["info", "enemies", "rules", "footer"].map(section =>
            element(".kcq-encounter-details__" + section).textContent);
        tabs()[2]!.click();
        expect(panel().textContent).toBe(presentation.referenceText("encounter", "outside", "defeat"));
        expect(["info", "enemies", "rules", "footer"].map(section =>
            element(".kcq-encounter-details__" + section).textContent)).toEqual(unchanged);
        element<HTMLButtonElement>(".kcq-encounter-details__footer button:first-child").click();
        select("plains_1");
        expect(panel().textContent).toBe(presentation.encounter("plains_1", "desc"));
        expect(tabs()[0]!.getAttribute("aria-selected")).toBe("true");
        tabs()[1]!.click();
        expect(panel().textContent).toBe(presentation.referenceText("encounter", "plains_1", "victory"));
        element<HTMLButtonElement>(".kcq-encounter-details__footer button:last-child").click();
        expect(document.querySelector(".kcq-difficulty-select")).not.toBeNull();
        element<HTMLButtonElement>(".kcq-difficulty-select__footer button:first-child").click();
        expect(panel().textContent).toBe(presentation.encounter("plains_1", "desc"));
        expect(prepareBattle).not.toHaveBeenCalled();
        expect(document.querySelector('[role="dialog"]')).toBeNull();
    });
});
