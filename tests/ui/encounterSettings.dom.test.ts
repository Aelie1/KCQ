import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DifficultyId, EncounterId } from "../../src/engine/public/types";
import { createStockEngine } from "../../src/stock";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createBattle } from "../../src/ui/web/app";
import { GraphicalApp } from "../../src/ui/web/app/GraphicalApp";
import type { LanguageOption } from "../../src/ui/web/app/language";
import { stockStrings } from "../helpers/stockStrings";

const screens = ["picker", "details", "difficulty"] as const;
type SelectionScreen = typeof screens[number];
const selectors = {
    picker: ".kcq-encounter-picker",
    details: ".kcq-encounter-details",
    difficulty: ".kcq-difficulty-select",
};
const presentation = new Presentation(stockStrings);
const alternate = new Presentation({
    ...stockStrings,
    "ui.battleSettings.resume": "Continue test",
    "ui.battleOverview.settings": "Test settings",
    "ui.title.name": "Test Quest",
    "encounter.plains_1.name": "Test Plains",
});
const languages: LanguageOption[] = [
    { id: "en", label: "English", presentation },
    { id: "test", label: "Test language", presentation: alternate },
];
let unmount: (() => void) | undefined;

afterEach(() => {
    unmount?.();
    unmount = undefined;
    document.body.replaceChildren();
});

function button(label: string): HTMLButtonElement {
    const found = [...document.querySelectorAll<HTMLButtonElement>("button")]
        .find(button => button.textContent?.trim() === label);
    if (!found) throw new Error("Missing button: " + label);
    return found;
}

function selectEncounter() {
    const row = [...document.querySelectorAll<HTMLButtonElement>(".kcq-encounter-picker__row")]
        .find(row => row.querySelector("strong")?.textContent === presentation.encounter("plains_1")
            || row.querySelector("strong")?.textContent === alternate.encounter("plains_1"));
    if (!row) throw new Error("Missing plains_1");
    row.click();
}

function mountSelection(screen: SelectionScreen) {
    const engine = createStockEngine();
    const prepareBattle = vi.fn((encounter: EncounterId, difficulty: DifficultyId) => {
        const battleEngine = createStockEngine(12345);
        createBattle(battleEngine, encounter, difficulty);
        return { engine: battleEngine, dispose: vi.fn() };
    });
    const root = document.createElement("div");
    document.body.append(root);
    unmount = render(() => createComponent(GraphicalApp, { engine, presentation, languages, prepareBattle }), root);
    if (screen !== "picker") selectEncounter();
    if (screen === "difficulty") {
        button("Choose Difficulty").click();
        button("Mythic").click();
    }
    return { engine, prepareBattle, panel: document.querySelector(selectors[screen])! };
}

function openSettings() {
    const gear = document.querySelector<HTMLButtonElement>(".kcq-combat-header__settings")!;
    expect(gear.disabled).toBe(false);
    gear.focus();
    gear.click();
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    return { gear, dialog };
}

function key(key: string, shiftKey = false) {
    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }));
}

function changeLanguage() {
    const select = document.querySelector<HTMLSelectElement>(".kcq-battle-settings select")!;
    select.value = "test";
    select.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("encounter screen settings", () => {
    it.each(screens)("opens %s settings with only Resume and Language and traps focus", screen => {
        const { panel, prepareBattle } = mountSelection(screen);
        const { dialog } = openSettings();
        expect([...dialog.querySelectorAll("button, label, hr")].map(element => element.tagName))
            .toEqual(["BUTTON", "LABEL"]);
        expect(button("Resume")).toBe(document.activeElement);
        expect(dialog.querySelector("label")?.textContent).toContain("Language");
        expect(dialog.querySelector("select")?.value).toBe("en");
        expect(dialog.textContent).not.toContain("Retry Battle");
        expect(dialog.textContent).not.toContain("Back to Level Select");
        expect(document.querySelector(selectors[screen])).toBe(panel);
        expect(panel.closest(".kcq-graphical-app__background")?.hasAttribute("inert")).toBe(true);
        expect(panel.closest(".kcq-graphical-app__background")?.getAttribute("aria-hidden")).toBe("true");
        expect(panel.contains(dialog)).toBe(false);
        key("Tab", true);
        expect(document.activeElement).toBe(dialog.querySelector("select"));
        key("Tab");
        expect(document.activeElement).toBe(button("Resume"));
        expect(prepareBattle).not.toHaveBeenCalled();
    });

    it.each(screens.flatMap(screen => ["Resume", "backdrop", "Escape"].map(method => ({ screen, method }))))(
        "dismisses $screen settings via $method and preserves selection", async ({ screen, method }) => {
            const { engine, prepareBattle, panel } = mountSelection(screen);
            const before = engine.getGameState();
            const { gear } = openSettings();
            if (method === "Resume") button("Resume").click();
            else if (method === "Escape") key("Escape");
            else document.querySelector<HTMLElement>(".kcq-battle-settings__overlay")!.click();
            expect(document.querySelector('[role="dialog"]')).toBeNull();
            expect(document.querySelector(selectors[screen])).toBe(panel);
            expect(panel.closest(".kcq-graphical-app__background")?.hasAttribute("inert")).toBe(false);
            expect(panel.closest(".kcq-graphical-app__background")?.hasAttribute("aria-hidden")).toBe(false);
            await Promise.resolve();
            expect(document.activeElement).toBe(gear);
            if (screen === "difficulty") {
                expect(document.querySelector('[aria-pressed="true"]')?.textContent).toBe("Mythic");
            }
            expect(engine.getGameState()).toEqual(before);
            expect(prepareBattle).not.toHaveBeenCalled();
        },
    );

    it.each(screens)("updates %s language in place and retains it when reopening settings", screen => {
        const { panel, engine, prepareBattle } = mountSelection(screen);
        const before = engine.getGameState();
        openSettings();
        changeLanguage();
        expect(document.querySelector<HTMLButtonElement>(".kcq-combat-header__settings")?.getAttribute("aria-label"))
            .toBe("Test settings");
        expect(panel.querySelector("h1")?.textContent).toBe(screen === "picker" ? "Test Quest" : "Test Plains");
        button("Continue test").click();
        expect(document.querySelector(selectors[screen])).toBe(panel);
        openSettings();
        expect(document.querySelector<HTMLSelectElement>(".kcq-battle-settings select")?.value).toBe("test");
        expect(engine.getGameState()).toEqual(before);
        expect(prepareBattle).not.toHaveBeenCalled();
    });

    it.each(screens)("blocks background navigation and battle setup on %s while settings is open", screen => {
        const { panel, prepareBattle } = mountSelection(screen);
        openSettings();
        if (screen === "picker") selectEncounter();
        else if (screen === "details") button("Choose Difficulty").click();
        else {
            button("Standard").click();
            button("Start Encounter").click();
            expect(document.querySelector('[aria-pressed="true"]')?.textContent).toBe("Mythic");
        }
        expect(document.querySelector(selectors[screen])).toBe(panel);
        expect(document.querySelector('[role="dialog"]')).not.toBeNull();
        expect(prepareBattle).not.toHaveBeenCalled();
    });

    it("shares language selection across picker, details, difficulty, battle, and return to picker", () => {
        const { prepareBattle } = mountSelection("picker");
        openSettings();
        changeLanguage();
        button("Continue test").click();
        selectEncounter();
        expect(document.querySelector(".kcq-encounter-details h1")?.textContent).toBe("Test Plains");
        button("Choose Difficulty").click();
        expect(document.querySelector(".kcq-difficulty-select h1")?.textContent).toBe("Test Plains");
        button("Mythic").click();
        button("Start Encounter").click();
        expect(prepareBattle).toHaveBeenCalledExactlyOnceWith("plains_1", "mythic");
        const { dialog } = openSettings();
        expect(dialog.querySelector("select")?.value).toBe("test");
        expect(dialog.querySelectorAll("button")).toHaveLength(3);
        button("Back to Level Select").click();
        expect(document.querySelector(".kcq-encounter-picker h1")?.textContent).toBe("Test Quest");
        openSettings();
        expect(document.querySelector<HTMLSelectElement>(".kcq-battle-settings select")?.value).toBe("test");
        expect(document.querySelector('[role="dialog"]')?.querySelectorAll("button")).toHaveLength(1);
    });
});
