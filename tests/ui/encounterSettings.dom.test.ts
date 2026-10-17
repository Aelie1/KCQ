import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    "ui.battleSettings.theme": "Test theme",
    "ui.battleSettings.theme.dark": "Test dark",
    "ui.battleSettings.theme.light": "Test light",
    "ui.battleSettings.theme.system": "Test system",
    "ui.battleSettings.backToTitle": "Test title screen",
    "ui.version.name": "Release {version}",
    "ui.battleOverview.settings": "Test settings",
    "ui.title.name": "Test Quest",
    "campaign.skunk.name": "Test campaign",
    "encounter.plains_1.name": "Test Plains",
});
const languages: LanguageOption[] = [
    { id: "en", label: "English", presentation },
    { id: "test", label: "Test language", presentation: alternate },
];
let unmount: (() => void) | undefined;

beforeEach(() => vi.stubGlobal("__KCQ_GIT_REVISION__", "abc1234"));

afterEach(() => {
    unmount?.();
    unmount = undefined;
    document.body.replaceChildren();
    vi.unstubAllGlobals();
    window.localStorage.clear();
});

function button(label: string): HTMLButtonElement {
    const found = [...document.querySelectorAll<HTMLButtonElement>("button")]
        .find(button => {
            const content = button.cloneNode(true) as HTMLElement;
            content.querySelectorAll(".kcq-shortcut").forEach(shortcut => shortcut.remove());
            return content.textContent?.trim() === label;
        });
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

function mountSelection(screen: SelectionScreen, release = "v0.8-settings-test") {
    const engine = createStockEngine();
    const prepareBattle = vi.fn((campaign: "skunk", encounter: EncounterId, difficulty: DifficultyId) => {
        const battleEngine = createStockEngine(12345);
        createBattle(battleEngine, encounter, difficulty);
        return { engine: battleEngine, dispose: vi.fn() };
    });
    const root = document.createElement("div");
    document.body.append(root);
    unmount = render(() => createComponent(GraphicalApp, { campaigns: ["skunk"], release, composeCampaign: () => ({ engine, presentation, languages }), presentation, languages, prepareBattle }), root);
    document.querySelector<HTMLButtonElement>(".kcq-title-screen__campaign")!.click();
    document.querySelector<HTMLButtonElement>('.kcq-encounter-picker__row[data-kcq-shortcut="1"]')!.click();
    document.querySelector<HTMLButtonElement>(".kcq-encounter-details__footer button")!.click();
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
    it.each(screens)("opens %s settings with Resume, Language, title navigation, and release and traps focus", screen => {
        const { panel, prepareBattle } = mountSelection(screen);
        const { dialog } = openSettings();
        expect([...dialog.querySelectorAll("button, label, hr")].map(element => element.tagName))
            .toEqual(["BUTTON", ...Array(7).fill("LABEL"), "BUTTON", "HR", "BUTTON"]);
        expect([...dialog.querySelectorAll("button")].map(control => control.textContent))
            .toEqual(["Resume", "Reset to Defaults", "Back to Title Screen"]);
        expect(document.querySelector(".kcq-combat-header__library")?.getAttribute("aria-label"))
            .toBe(presentation.ui("library.title"));
        expect(dialog.querySelector(".kcq-battle-settings__version")?.textContent).toBe("v0.8-settings-test · abc1234");
        expect(button("Back to Title Screen")).toBeDefined();
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
        expect(document.activeElement).toBe(button("Back to Title Screen"));
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
        expect(document.querySelector(".kcq-battle-settings__theme span")?.textContent).toBe("Test theme");
        expect([...document.querySelectorAll(".kcq-battle-settings__theme option")].map(option => option.textContent))
            .toEqual(["Test dark", "Test light", "Test system"]);
        expect(document.querySelector(".kcq-battle-settings__version")?.textContent).toBe("Release v0.8-settings-test · abc1234");
        expect(button("Test title screen")).toBeDefined();
        expect(document.querySelector<HTMLButtonElement>(".kcq-combat-header__settings")?.getAttribute("aria-label"))
            .toBe("Test settings");
        expect(panel.querySelector("h1")?.textContent).toBe(screen === "picker" ? "Test campaign" : "Test Plains");
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

    it.each(screens)("shows the development version in %s settings when no release is supplied", screen => {
        vi.stubGlobal("__KCQ_GIT_REVISION__", "abc1234");
        mountSelection(screen, "");
        const { dialog } = openSettings();
        expect(dialog.querySelector(".kcq-battle-settings__version")?.textContent).toBe("rev. abc1234");
        changeLanguage();
        expect(dialog.querySelector(".kcq-battle-settings__version")?.textContent).toBe("Release rev. abc1234");
    });

    it.each(screens)("returns from %s settings to title with language retained and settings closed", screen => {
        const { prepareBattle } = mountSelection(screen);
        openSettings();
        changeLanguage();
        button("Test title screen").click();
        expect(document.querySelector(".kcq-title-screen h1")?.textContent).toBe("Test Quest");
        expect(document.querySelector<HTMLSelectElement>(".kcq-title-screen__language select")?.value).toBe("test");
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(document.querySelector(".kcq-combat-header__settings")).toBeNull();
        expect(document.querySelector(".kcq-graphical-app__background")?.hasAttribute("inert")).toBe(false);
        expect(prepareBattle).not.toHaveBeenCalled();
        document.querySelector<HTMLButtonElement>(".kcq-title-screen__campaign")!.click();
        expect(document.querySelector(".kcq-encounter-picker")).not.toBeNull();
        openSettings();
        expect(document.querySelector(".kcq-battle-settings__version")?.textContent).toBe("Release v0.8-settings-test · abc1234");
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
        expect(prepareBattle).toHaveBeenCalledExactlyOnceWith("skunk", "plains_1", "mythic");
        const { dialog } = openSettings();
        expect(dialog.querySelector("select")?.value).toBe("test");
        expect([...dialog.querySelectorAll("button")].map(control => control.textContent))
            .toEqual(["Continue test", "Reset to Defaults", "Retry Battle", "Back to Level Select", "Test title screen"]);
        button("Back to Level Select").click();
        expect(document.querySelector(".kcq-encounter-picker h1")?.textContent).toBe("Test campaign");
        openSettings();
        expect(document.querySelector<HTMLSelectElement>(".kcq-battle-settings select")?.value).toBe("test");
        expect([...document.querySelectorAll('[role="dialog"] button')].map(control => control.textContent))
            .toEqual(["Continue test", "Reset to Defaults", "Test title screen"]);
    });
});
it("applies and resets shared view preferences from encounter Settings without changing the selection", () => {
    const style = document.createElement("style"); style.textContent = ".kcq-app { padding: 12px; }"; document.body.append(style);
    const { panel, prepareBattle } = mountSelection("picker");
    const { dialog } = openSettings();
    const columns = dialog.querySelector<HTMLSelectElement>(".kcq-battle-settings__columns select")!;
    columns.value = "3"; columns.dispatchEvent(new Event("change", { bubbles: true }));
    const shell = document.querySelector<HTMLElement>(".kcq-app")!;
    expect(shell.style.getPropertyValue("--kcq-ui-zoom")).toBe("1");
    const theme = dialog.querySelector<HTMLSelectElement>(".kcq-battle-settings__theme select")!;
    theme.value = "light"; theme.dispatchEvent(new Event("change", { bubbles: true }));
    expect(document.documentElement.dataset.kcqTheme).toBe("light");
    button("Reset to Defaults").click();
    expect(theme.value).toBe("dark");
    expect(document.documentElement.dataset.kcqTheme).toBe("dark");
    expect(document.querySelector('[role="dialog"]')).toBe(dialog);
    expect(columns.value).toBe("auto");
    expect(dialog.querySelector('[aria-label="Zoom"]')).toBeNull();
    expect(shell.style.getPropertyValue("--kcq-ui-zoom")).toBe("1");
    button("Resume").click();
    expect(document.querySelector(".kcq-encounter-picker")).toBe(panel);
    expect(prepareBattle).not.toHaveBeenCalled();
});


it("shares theme through selection, battle retry, Library, and return to title without resetting UI state", () => {
    window.localStorage.setItem("kcq.theme", "light");
    const { engine, panel, prepareBattle } = mountSelection("picker");
    expect(document.documentElement.dataset.kcqTheme).toBe("light");
    const before = engine.getGameState();
    const { dialog } = openSettings();
    const theme = dialog.querySelector<HTMLSelectElement>(".kcq-battle-settings__theme select")!;
    expect(theme.closest("label")?.querySelector("span")?.textContent).toBe("Theme");
    expect([...theme.options].map(option => [option.value, option.textContent]))
        .toEqual([["dark", "Dark"], ["light", "Light"], ["system", "System"]]);
    for (const choice of ["dark", "system", "light"]) {
        theme.value = choice; theme.dispatchEvent(new Event("change", { bubbles: true }));
        expect(theme.value).toBe(choice);
        expect(document.querySelector(".kcq-encounter-picker")).toBe(panel);
        expect(engine.getGameState()).toEqual(before);
        expect(prepareBattle).not.toHaveBeenCalled();
    }
    button("Resume").click();
    document.querySelector<HTMLButtonElement>(".kcq-combat-header__library")!.click();
    expect(document.querySelector(".kcq-library-overlay")).not.toBeNull();
    expect(document.documentElement.dataset.kcqTheme).toBe("light");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    selectEncounter(); button("Choose Difficulty").click(); button("Mythic").click(); button("Start Encounter").click();
    expect(prepareBattle).toHaveBeenCalledOnce();
    const battleEngine = prepareBattle.mock.results[0]!.value.engine;
    const battleBefore = battleEngine.getGameState();
    const execute = vi.spyOn(battleEngine, "executeAction");
    const background = document.querySelector(".kcq-battle-stage__background");
    const battleDialog = openSettings().dialog;
    const battleTheme = battleDialog.querySelector<HTMLSelectElement>(".kcq-battle-settings__theme select")!;
    expect(battleTheme.value).toBe("light");
    battleTheme.value = "dark"; battleTheme.dispatchEvent(new Event("change", { bubbles: true }));
    expect(document.documentElement.dataset.kcqTheme).toBe("dark");
    expect(document.querySelector(".kcq-battle-stage__background")).toBe(background);
    expect(battleEngine.getGameState()).toEqual(battleBefore);
    expect(execute).not.toHaveBeenCalled(); expect(prepareBattle).toHaveBeenCalledOnce();
    battleTheme.value = "light"; battleTheme.dispatchEvent(new Event("change", { bubbles: true }));
    button("Retry Battle").click();
    expect(prepareBattle).toHaveBeenCalledTimes(2);
    expect(document.documentElement.dataset.kcqTheme).toBe("light");
    expect(openSettings().dialog.querySelector<HTMLSelectElement>(".kcq-battle-settings__theme select")?.value).toBe("light");
    button("Back to Level Select").click();
    expect(openSettings().dialog.querySelector<HTMLSelectElement>(".kcq-battle-settings__theme select")?.value).toBe("light");
    button("Back to Title Screen").click();
    expect(document.querySelector(".kcq-title-screen")).not.toBeNull();
    expect(document.documentElement.dataset.kcqTheme).toBe("light");
    expect(window.localStorage.getItem("kcq.theme")).toBe("light");
});
