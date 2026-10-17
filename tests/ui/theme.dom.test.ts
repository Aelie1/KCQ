import { readFileSync } from "node:fs";
import { createComponent, createRoot } from "solid-js";
import { render } from "solid-js/web";
import { createStockEngine } from "../../src/stock";
import { createBattle } from "../../src/ui/web/app";
import { BattleApp } from "../../src/ui/web/app/BattleApp";
import { battleOverviewFixture } from "../../src/ui/web/app/fixtures/battleOverview";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createThemePreference, type ThemePreference } from "../../src/ui/web/app/theme";
import { resetPreferences } from "../../src/ui/web/app/resetPreferences";

const disposers: (() => void)[] = [];
let media: MediaQueryList;
function mount(): ThemePreference {
    return createRoot(dispose => { disposers.push(dispose); return createThemePreference(); });
}
function systemLight(light: boolean): void {
    Object.defineProperty(media, "matches", { value: light, configurable: true });
    media.dispatchEvent(new Event("change"));
}
beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-kcq-theme");
    media = Object.assign(new EventTarget(), { matches: false, media: "(prefers-color-scheme: light)" }) as MediaQueryList;
    vi.spyOn(window, "matchMedia").mockReturnValue(media);
});
afterEach(() => {
    disposers.splice(0).forEach(dispose => dispose());
    document.body.replaceChildren();
    vi.restoreAllMocks(); window.localStorage.clear();
    document.documentElement.removeAttribute("data-kcq-theme");
});
const applied = () => document.documentElement.dataset.kcqTheme;

describe("theme preference", () => {
    it.each([null, "invalid", "", "LIGHT"])("defaults to Dark for stored %s even on a light OS", saved => {
        if (saved !== null) window.localStorage.setItem("kcq.theme", saved);
        systemLight(true);
        expect(mount().value).toBe("dark"); expect(applied()).toBe("dark");
    });
    it.each(["dark", "light", "system"] as const)("restores and persists %s across owners", choice => {
        systemLight(true);
        const preference = mount(); preference.onChange(choice);
        expect(preference.value).toBe(choice);
        expect(window.localStorage.getItem("kcq.theme")).toBe(choice);
        disposers.pop()!();
        expect(mount().value).toBe(choice);
        expect(applied()).toBe(choice === "dark" ? "dark" : "light");
    });
    it("switches all three choices immediately and only follows OS changes in System", () => {
        const preference = mount();
        for (const choice of ["light", "system", "dark", "system", "light", "dark"] as const) {
            preference.onChange(choice);
            for (const light of [true, false, true]) {
                systemLight(light);
                expect(preference.value).toBe(choice);
                expect(applied()).toBe(choice === "system" ? light ? "light" : "dark" : choice);
            }
        }
        preference.onChange("invalid" as "dark");
        expect(preference.value).toBe("dark");
    });
    it("resets System to Dark immediately and stops following the OS", () => {
        const theme = mount(); systemLight(true); theme.onChange("system");
        expect(applied()).toBe("light");
        resetPreferences({ theme });
        expect(theme.value).toBe("dark"); expect(applied()).toBe("dark");
        expect(window.localStorage.getItem("kcq.theme")).toBe("dark");
        systemLight(false); systemLight(true); expect(applied()).toBe("dark");
    });
    it("keeps session changes and reset usable when storage throws", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
        const theme = mount(); expect(theme.value).toBe("dark");
        theme.onChange("light"); expect(applied()).toBe("light");
        theme.onChange("system"); systemLight(true); expect(applied()).toBe("light");
        resetPreferences({ theme }); expect(applied()).toBe("dark");
    });
    it("falls back to Dark for System when matchMedia is unavailable", () => {
        Object.defineProperty(window, "matchMedia", { value: undefined, configurable: true });
        const theme = mount(); theme.onChange("system"); expect(applied()).toBe("dark");
        theme.onChange("light"); expect(applied()).toBe("light");
    });
    it("removes its OS listener on disposal without flashing the last palette", () => {
        const remove = vi.spyOn(media, "removeEventListener");
        const theme = mount(); theme.onChange("system"); systemLight(true);
        disposers.pop()!();
        expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
        systemLight(false); expect(applied()).toBe("light");
    });
});

it("applies stored preferences in a standalone BattleApp and resets without changing the battle", () => {
    window.localStorage.setItem("kcq.theme", "light");
    const engine = createStockEngine(12345); createBattle(engine, "plains_1", "standard");
    const before = engine.getGameState(); const execute = vi.spyOn(engine, "executeAction");
    const host = document.createElement("div"); document.body.append(host);
    disposers.push(render(() => createComponent(BattleApp, { engine, presentation: battleOverviewFixture.presentation }), host));
    expect(applied()).toBe("light");
    const overview = document.querySelector(".kcq-battle-overview");
    document.querySelector<HTMLButtonElement>(".kcq-combat-header__settings")!.click();
    const dialog = document.querySelector('[role="dialog"]')!;
    const select = dialog.querySelector<HTMLSelectElement>(".kcq-battle-settings__theme select")!;
    expect(select.value).toBe("light");
    select.value = "system"; select.dispatchEvent(new Event("change", { bubbles: true }));
    systemLight(true); expect(applied()).toBe("light");
    systemLight(false); expect(applied()).toBe("dark");
    [...dialog.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Reset to Defaults")!.click();
    expect(select.value).toBe("dark");
    systemLight(true); expect(applied()).toBe("dark");
    expect(document.querySelector('[role="dialog"]')).toBe(dialog);
    expect(document.querySelector(".kcq-battle-overview")).toBe(overview);
    expect(engine.getGameState()).toEqual(before); expect(execute).not.toHaveBeenCalled();
});

it("switches shell colors and shared portal tokens while keeping binding and graze hues", () => {
    const style = document.createElement("style");
    style.textContent = readFileSync("src/ui/web/app/tokens.css", "utf8") + readFileSync("src/ui/web/app/app.css", "utf8");
    const host = document.createElement("div");
    host.innerHTML = '<main class="kcq-app"><span class="kcq-binding-metric__value--moderate">25</span></main><div class="kcq-library-overlay"></div><span class="kcq-hp-reaction" data-hit-strength="graze">-1</span>';
    document.body.append(style, host);
    const theme = mount();
    const shell = host.querySelector("main")!;
    // Happy DOM does not resolve modern alpha backgrounds or inherited custom-property enumeration.
    // Check the portal rule and its root token; a real browser inherits this token across portals.
    expect(style.textContent).toMatch(/\.kcq-library-overlay\s*\{[^}]*background: var\(--kcq-surface-overlay\)/);
    const binding = host.querySelector(".kcq-binding-metric__value--moderate")!, graze = host.querySelector(".kcq-hp-reaction")!;
    const darkBackground = getComputedStyle(shell).backgroundColor, darkOverlay = getComputedStyle(document.documentElement).getPropertyValue("--kcq-surface-overlay");
    const bindingColor = getComputedStyle(binding).color, grazeColor = getComputedStyle(graze).color;
    expect(bindingColor).not.toBe(""); expect(grazeColor).not.toBe("");
    expect(darkOverlay).not.toBe("");
    theme.onChange("light");
    expect(getComputedStyle(shell).backgroundColor).not.toBe(darkBackground);
    expect(getComputedStyle(document.documentElement).getPropertyValue("--kcq-surface-overlay")).not.toBe(darkOverlay);
    expect(getComputedStyle(binding).color).toBe(bindingColor);
    expect(getComputedStyle(graze).color).toBe(grazeColor);
    expect(getComputedStyle(document.documentElement).getPropertyValue("--kcq-semantic-text-shadow")).toContain("rgb(15 23 42");
    expect(style.textContent).toMatch(/:where\([^}]*\.kcq-binding-metric__value--moderate[^}]*text-shadow: var\(--kcq-semantic-text-shadow\)/);
    theme.onChange("dark");
    expect(getComputedStyle(shell).backgroundColor).toBe(darkBackground);
    expect(getComputedStyle(document.documentElement).getPropertyValue("--kcq-surface-overlay")).toBe(darkOverlay);
});
