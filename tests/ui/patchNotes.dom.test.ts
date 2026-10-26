import type { Window as HappyWindow } from "happy-dom";
import { readFileSync } from "node:fs";
import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStringTable } from "../../localization";
import { createCampaignLibrary, createCharacterLibrary, createEngine } from "../../src/content";
import type { DifficultyId, EncounterId } from "../../src/engine/public/types";
import { stockCharacters } from "../../src/stock";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createBattle } from "../../src/ui/web/app";
import { GraphicalApp } from "../../src/ui/web/app/GraphicalApp";
import type { LanguageOption } from "../../src/ui/web/app/language";
import { BattleSettingsPanel } from "../../src/ui/web/app/panels/BattleSettingsPanel";
import { PATCH_NOTES_STORAGE_KEY } from "../../src/ui/web/app/patchNotes";
import { releaseHistory } from "../../src/ui/web/app/content/releaseHistory";
import { displayVersion } from "../../src/ui/web/app/version";
import { createViewPreferences } from "../../src/ui/web/app/viewPreferences";

const strings = getStringTable("en", stockCharacters, "skunk");
const presentation = new Presentation(strings);
const bulletKeys = releaseHistory.releases.flatMap(release => release.sections.flatMap(section => section.bulletKeys));
const viewport = (window as unknown as HappyWindow).happyDOM;
const initialViewport = { width: window.innerWidth, height: window.innerHeight };
let unmount: (() => void) | undefined;
beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("__KCQ_GIT_REVISION__", "abc1234");
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => window.innerWidth);
});
afterEach(() => {
    unmount?.(); unmount = undefined; document.body.replaceChildren();
    vi.restoreAllMocks(); vi.unstubAllGlobals(); window.localStorage.clear();
    delete document.documentElement.dataset.kcqTheme;
    viewport.setViewport(initialViewport);
});

function element<T extends HTMLElement = HTMLElement>(selector: string): T {
    const found = document.querySelector<T>(selector);
    if (!found) throw new Error("Missing " + selector);
    return found;
}
const close = () => element<HTMLButtonElement>(".kcq-patch-notes__footer button").click();
const open = () => element<HTMLButtonElement>(".kcq-title-screen__patch-notes").click();
function press(key: string, options: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
    (document.activeElement ?? document).dispatchEvent(event);
    document.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
    return event;
}
function mount(release = "1.1.0", languages?: readonly LanguageOption[]) {
    unmount?.(); document.body.replaceChildren();
    const composeCampaign = vi.fn(() => ({ library: createCampaignLibrary(stockCharacters, "skunk"), presentation }));
    const prepareBattle = vi.fn((campaign: "skunk", encounter: EncounterId, difficulty: DifficultyId) => {
        const engine = createEngine(stockCharacters, campaign, 12345);
        createBattle(engine, encounter, difficulty);
        return { engine, dispose: vi.fn() };
    });
    const style = document.createElement("style");
    style.textContent = readFileSync("src/ui/web/app/tokens.css", "utf8") + readFileSync("src/ui/web/app/app.css", "utf8");
    const root = document.createElement("div"); document.body.append(style, root);
    unmount = render(() => createComponent(GraphicalApp, {
        campaigns: ["skunk"], release, presentation, languages, composeCampaign, prepareBattle,
        characterLibrary: createCharacterLibrary(), createEngine,
    }), root);
    return { composeCampaign, prepareBattle };
}

describe("Patch Notes startup and navigation", () => {
    it("shows the first visitor all releases without preparing a campaign or recording a dismissal", () => {
        const { composeCampaign, prepareBattle } = mount();
        expect(element(".kcq-patch-notes h1").textContent).toBe("Patch Notes");
        expect(document.activeElement).toBe(element(".kcq-patch-notes h1"));
        expect(getComputedStyle(element(".kcq-patch-notes h1")).outlineStyle).toBe("none");
        expect(document.querySelector(".kcq-title-screen")).not.toBeNull();
        expect(element(".kcq-graphical-app__background").hasAttribute("inert")).toBe(true);
        expect(element(".kcq-graphical-app__background").getAttribute("aria-hidden")).toBe("true");
        expect(element(".kcq-app").contains(element(".kcq-patch-notes"))).toBe(false);
        expect(document.querySelectorAll(".kcq-patch-notes__release")).toHaveLength(3);
        expect([...document.querySelectorAll(".kcq-patch-notes li")].map(note => note.textContent)).toEqual(bulletKeys.map(key => presentation.ui(key)));
        expect(document.querySelector(".kcq-patch-notes__notice")).toBeNull();
        expect(window.localStorage.getItem(PATCH_NOTES_STORAGE_KEY)).toBeNull();
        expect(composeCampaign).not.toHaveBeenCalled(); expect(prepareBattle).not.toHaveBeenCalled();
    });

    it("shows the normal title for a returning visitor who has seen the visible version", () => {
        window.localStorage.setItem(PATCH_NOTES_STORAGE_KEY, displayVersion("1.1.0"));
        mount();
        expect(document.querySelector(".kcq-patch-notes")).toBeNull();
        expect(element(".kcq-title-screen__version").textContent).toContain(displayVersion("1.1.0"));
        expect(element(".kcq-title-screen__version .kcq-title-screen__patch-notes").textContent).toBe("Patch Notes");
    });

    it("shows updates after a version change and persists the new version only on dismissal", () => {
        window.localStorage.setItem(PATCH_NOTES_STORAGE_KEY, displayVersion("1.0.1"));
        mount();
        expect(document.querySelector(".kcq-patch-notes")).not.toBeNull();
        expect(window.localStorage.getItem(PATCH_NOTES_STORAGE_KEY)).toBe(displayVersion("1.0.1"));
        close();
        expect(window.localStorage.getItem(PATCH_NOTES_STORAGE_KEY)).toBe(displayVersion("1.1.0"));
        expect(document.activeElement).toBe(element(".kcq-title-screen__patch-notes"));
        mount(); expect(document.querySelector(".kcq-patch-notes")).toBeNull();
        mount("preview"); expect(document.querySelector(".kcq-patch-notes")).not.toBeNull();
    });

    it.each(["", "custom-release"])("tracks the existing visible fallback for release %j", release => {
        vi.stubGlobal("__KCQ_GIT_REVISION__", "");
        mount(release); close();
        expect(window.localStorage.getItem(PATCH_NOTES_STORAGE_KEY)).toBe(release || "v0.0.0");
        mount(release); expect(document.querySelector(".kcq-patch-notes")).toBeNull();
    });

    it("allows manual reopening and persists on every close", () => {
        window.localStorage.setItem(PATCH_NOTES_STORAGE_KEY, displayVersion("1.1.0"));
        mount();
        const title = element(".kcq-title-screen"); open();
        expect(document.querySelector(".kcq-patch-notes")).not.toBeNull();
        expect(element(".kcq-title-screen")).toBe(title);
        window.localStorage.removeItem(PATCH_NOTES_STORAGE_KEY); close();
        expect(window.localStorage.getItem(PATCH_NOTES_STORAGE_KEY)).toBe(displayVersion("1.1.0"));
        expect(document.activeElement).toBe(element(".kcq-title-screen__patch-notes"));
        open(); close(); expect(element(".kcq-title-screen")).toBe(title);
        expect(element(".kcq-graphical-app__background").hasAttribute("inert")).toBe(false);
        expect(element(".kcq-graphical-app__background").hasAttribute("aria-hidden")).toBe(false);
    });

    it("supports native keyboard focus, scrolling and Escape back navigation", () => {
        mount();
        const screen = element(".kcq-patch-notes");
        const history = element(".kcq-patch-notes__history");
        const back = element<HTMLButtonElement>(".kcq-patch-notes__footer button");
        expect(screen.getAttribute("role")).toBe("dialog");
        expect(screen.getAttribute("aria-modal")).toBe("true");
        expect(screen.getAttribute("aria-labelledby")).toBe(element(".kcq-patch-notes h1").id);
        expect(history.tabIndex).toBe(0); history.focus(); expect(document.activeElement).toBe(history);
        expect(press("PageDown").defaultPrevented).toBe(false);
        expect(press("Tab").defaultPrevented).toBe(false);
        expect(press("Tab", { shiftKey: true }).defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(back);
        expect(press("Tab").defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(history);
        expect(back.type).toBe("button"); expect(back.tabIndex).toBe(0);
        back.focus(); expect(document.activeElement).toBe(back);
        expect(press("Escape", { ctrlKey: true }).defaultPrevented).toBe(false);
        expect(press("Escape").defaultPrevented).toBe(true);
        const trigger = element<HTMLButtonElement>(".kcq-title-screen__patch-notes");
        expect(document.activeElement).toBe(trigger);
        expect(trigger.type).toBe("button"); expect(trigger.tabIndex).toBe(0);
        // Native button activation remains available to the browser.
        expect(press("Enter").defaultPrevented).toBe(false);
        expect(press(" ").defaultPrevented).toBe(false);
        trigger.click(); expect(document.activeElement).toBe(element(".kcq-patch-notes h1"));
    });

    it("dismisses by clicking the backdrop or its viewport and preserves clicks within the modal", () => {
        mount();
        element(".kcq-patch-notes li").click();
        expect(document.querySelector(".kcq-patch-notes")).not.toBeNull();
        element(".kcq-patch-notes__overlay .kcq-battle-result__viewport").click();
        expect(document.querySelector(".kcq-patch-notes")).toBeNull();
        expect(window.localStorage.getItem(PATCH_NOTES_STORAGE_KEY)).toBe(displayVersion("1.1.0"));
        open(); element(".kcq-patch-notes__overlay").click();
        expect(document.activeElement).toBe(element(".kcq-title-screen__patch-notes"));
        expect(document.querySelector(".kcq-patch-notes")).toBeNull();
    });

    it("blocks title navigation and shortcuts behind the modal", () => {
        const { composeCampaign, prepareBattle } = mount();
        element<HTMLButtonElement>(".kcq-title-screen__campaign").click();
        element<HTMLButtonElement>(".kcq-title-screen__change-party").click();
        press("1"); press(" ");
        expect(document.querySelector(".kcq-patch-notes")).not.toBeNull();
        expect(document.querySelector(".kcq-party-selection")).toBeNull();
        expect(composeCampaign).not.toHaveBeenCalled(); expect(prepareBattle).not.toHaveBeenCalled();
    });

    it("does not reopen on party/campaign navigation, during battle, or after returning to title", () => {
        const { prepareBattle } = mount(); close();
        window.localStorage.removeItem(PATCH_NOTES_STORAGE_KEY);
        element<HTMLButtonElement>(".kcq-title-screen__change-party").click(); press("Escape");
        expect(document.querySelector(".kcq-patch-notes")).toBeNull();
        element<HTMLButtonElement>(".kcq-title-screen__campaign").click();
        element<HTMLInputElement>(".kcq-encounter-picker__show-all input").click();
        element<HTMLButtonElement>('.kcq-encounter-picker__row[data-kcq-shortcut="2"]').click();
        element<HTMLButtonElement>(".kcq-encounter-details .kcq-battle-overview__primary-action").click();
        element<HTMLButtonElement>(".kcq-difficulty-select .kcq-battle-overview__primary-action").click();
        const battle = element(".kcq-battle-stage");
        window.dispatchEvent(new StorageEvent("storage", { key: PATCH_NOTES_STORAGE_KEY, newValue: "old" }));
        window.dispatchEvent(new Event("resize"));
        expect(element(".kcq-battle-stage")).toBe(battle);
        expect(document.querySelector(".kcq-patch-notes")).toBeNull(); expect(prepareBattle).toHaveBeenCalledOnce();
        element<HTMLButtonElement>(".kcq-battle-overview .kcq-combat-header__settings").click();
        const toTitle = [...document.querySelectorAll<HTMLButtonElement>(".kcq-battle-settings button")]
            .find(button => button.textContent?.trim() === presentation.ui("battleSettings.backToTitle"))!;
        toTitle.click();
        expect(document.querySelector(".kcq-title-screen")).not.toBeNull();
        expect(document.querySelector(".kcq-patch-notes")).toBeNull();
    });

    it.each(["", "{}", "null", "{broken", "\"1.1.0\""])("recovers from malformed storage %j", value => {
        window.localStorage.setItem(PATCH_NOTES_STORAGE_KEY, value); mount(); close();
        expect(window.localStorage.getItem(PATCH_NOTES_STORAGE_KEY)).toBe(displayVersion("1.1.0"));
    });

    it("stays dismissed in this session when reading and writing localStorage both throw", () => {
        vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new Error("denied"); });
        expect(() => mount()).not.toThrow(); close(); open(); close();
        element<HTMLButtonElement>(".kcq-title-screen__campaign").click(); press("Escape");
        expect(document.querySelector(".kcq-title-screen")).not.toBeNull();
        expect(document.querySelector(".kcq-patch-notes")).toBeNull();
    });

    it("allows dismissal when storage can be read but writes exceed quota", () => {
        mount();
        const storage = window.localStorage;
        vi.spyOn(window, "localStorage", "get").mockReturnValue({
            length: storage.length,
            clear: storage.clear.bind(storage),
            key: storage.key.bind(storage),
            removeItem: storage.removeItem.bind(storage),
            getItem: storage.getItem.bind(storage),
            setItem: () => { throw new Error("quota"); },
        });
        expect(close).not.toThrow(); expect(document.querySelector(".kcq-title-screen")).not.toBeNull();
        expect(window.localStorage.getItem(PATCH_NOTES_STORAGE_KEY)).toBeNull();
    });

    it("uses the selected language for the footer, heading, controls and release text", () => {
        const localized = new Presentation({
            ...strings,
            "ui.patchNotes.title": "Localized updates", "ui.patchNotes.back": "Retour",
            "ui.patchNotes.1.1.0.title": "Localized title", "ui.patchNotes.1.1.0.line1": "Nouveaux r?cits.",
        });
        const languages = [{ id: "en", label: "English", presentation }, { id: "test", label: "Test", presentation: localized }];
        window.localStorage.setItem("kcq.language", "test"); mount("1.1.0", languages);
        expect(element(".kcq-patch-notes h1").textContent).toBe("Localized updates");
        expect(element(".kcq-patch-notes h2").textContent).toBe("1.1.0 \u2014 Localized title");
        expect(element(".kcq-patch-notes li").textContent).toBe("Nouveaux r?cits.");
        expect(element(".kcq-patch-notes button").textContent).toBe("Retour"); close();
        expect(element(".kcq-title-screen__patch-notes").textContent).toBe("Localized updates");
        const select = element<HTMLSelectElement>(".kcq-title-screen select");
        select.value = "en"; select.dispatchEvent(new Event("change", { bubbles: true })); open();
        expect(element(".kcq-patch-notes h1").textContent).toBe("Patch Notes");
    });
});

/** Compare computed sizing against the actual settings panel at the same viewport. */
function expectSettingsSizing(): void {
    const host = document.createElement("div"); document.body.append(host);
    const dispose = render(() => createComponent(BattleSettingsPanel, {
        presentation, release: "1.1.0", viewPreferences: createViewPreferences(), onResume: () => { },
    }), host);
    try {
        const settingsOverlay = element(".kcq-battle-settings__overlay");
        const notesOverlay = element(".kcq-patch-notes__overlay");
        expect(notesOverlay.dataset.kcqLayout).toBe(settingsOverlay.dataset.kcqLayout);
        expect(notesOverlay.style.getPropertyValue("--kcq-ui-zoom")).toBe(settingsOverlay.style.getPropertyValue("--kcq-ui-zoom"));
        for (const [notes, settings, properties] of [
            [notesOverlay, settingsOverlay, ["position", "inset", "padding", "zIndex"]],
            [element(".kcq-patch-notes__overlay .kcq-battle-result__viewport"),
            element(".kcq-battle-settings__overlay .kcq-battle-result__viewport"), ["width", "minWidth", "maxWidth", "height", "padding"]],
            [element(".kcq-patch-notes"), element(".kcq-battle-settings"), ["width", "maxWidth", "maxHeight", "padding", "gap"]],
        ] as const) {
            const notesStyle = getComputedStyle(notes); const settingsStyle = getComputedStyle(settings);
            for (const property of properties) expect(notesStyle[property]).toBe(settingsStyle[property]);
        }
    } finally { dispose(); host.remove(); }
}

describe("Patch Notes responsive presentation", () => {
    it.each([
        [390, 480, "narrow"], [1280, 720, "medium"], [2200, 900, "wide"],
    ] as const)("matches settings sizing with scrolling notes at %ix%i (%s)", (width, height, layout) => {
        viewport.setViewport({ width, height }); mount();
        expect(element(".kcq-app").dataset.kcqLayout).toBe(layout);
        const screen = element(".kcq-patch-notes");
        expect([...screen.children].map(child => child.className)).toEqual([
            "kcq-patch-notes__header", "kcq-patch-notes__history", "kcq-battle-result__actions kcq-patch-notes__footer",
        ]);
        expect(getComputedStyle(screen).width).toBe("100%");
        expectSettingsSizing();
        expect(getComputedStyle(element(".kcq-patch-notes__history")).overflowY).toBe("auto");
        expect(element(".kcq-patch-notes__history").querySelector("button")).toBeNull();
        expect(document.querySelectorAll(".kcq-patch-notes__release")).toHaveLength(3); close();
        expect(getComputedStyle(element(".kcq-title-screen__version")).flexWrap).toBe("wrap");
        open(); expect(document.querySelectorAll(".kcq-patch-notes__release")).toHaveLength(3);
    });

    it.each([
        [390, "3", "wide"], [2200, "1", "narrow"],
    ] as const)("honors a forced %s viewport / %s-column preference", (width, columns, layout) => {
        viewport.setViewport({ width }); window.localStorage.setItem("kcq.battleColumns", columns);
        mount();
        expect(element(".kcq-app").dataset.kcqLayout).toBe(layout);
        expect(getComputedStyle(element(".kcq-patch-notes")).width).toBe("100%");
        expectSettingsSizing();
        close(); open(); expect(document.querySelectorAll(".kcq-patch-notes li")).toHaveLength(bulletKeys.length);
    });

    it.each(["light", "dark"])("uses the %s theme's text and release separators", theme => {
        window.localStorage.setItem("kcq.theme", theme); mount();
        expect(document.documentElement.dataset.kcqTheme).toBe(theme);
        const style = getComputedStyle(element(".kcq-patch-notes__release + .kcq-patch-notes__release"));
        expect(style.borderTopStyle).toBe("solid");
        expect(style.color).toBe(getComputedStyle(document.body).color);
    });
});
