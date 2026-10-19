import type { Window as HappyWindow } from "happy-dom";
import { readFileSync } from "node:fs";
import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../../src/ui/web/app/App";
import { AUTO_MEDIUM_BREAKPOINT, AUTO_WIDE_BREAKPOINT, LAYOUT_WIDTHS, SHELL_HORIZONTAL_PADDING } from "../../src/ui/web/app/responsiveScale";
import { createViewPreferences, ViewPreferencesContext } from "../../src/ui/web/app/viewPreferences";

const viewport = (window as unknown as HappyWindow).happyDOM;
const initialViewport = { width: window.innerWidth, height: window.innerHeight };
let dispose: (() => void) | undefined;
afterEach(() => {
    dispose?.();
    document.body.replaceChildren();
    viewport.setViewport(initialViewport);
    window.localStorage.clear();
});

// Exercise the selectors that previously chose independent outer canvases.
describe("canonical graphical canvas", () => {
    it.each([
        "kcq-battle-overview-medium", "kcq-character-details-medium", "kcq-battle-overview-wide", "kcq-character-details-wide",
        "kcq-encounter-screen kcq-encounter-picker--overview",
        "kcq-encounter-screen kcq-encounter-picker--overview kcq-encounter-picker--wide",
        "kcq-encounter-screen kcq-encounter-details--non-narrow",
        "kcq-encounter-screen kcq-difficulty-select--non-narrow",
        "kcq-party-selection", "kcq-title-screen",
    ])("keeps %s on the selected canvas through forced and automatic resizing", screenClass => {
        viewport.setViewport({ width: 390, height: 844 });
        const preferences = createViewPreferences();
        const style = document.createElement("style");
        style.textContent = readFileSync("src/ui/web/app/app.css", "utf8");
        const host = document.createElement("div");
        const background = document.createElement("div");
        background.className = "kcq-graphical-app__background";
        const screen = document.createElement("div");
        screen.className = screenClass;
        background.append(screen);
        document.body.append(style, host);
        dispose = render(() => createComponent(ViewPreferencesContext.Provider, {
            value: preferences,
            get children() { return createComponent(App, { children: background }); },
        }), host);
        const shell = host.querySelector<HTMLElement>(".kcq-app")!;
        const shellStyle = getComputedStyle(shell);
        expect(parseFloat(shellStyle.paddingLeft) + parseFloat(shellStyle.paddingRight)).toBe(SHELL_HORIZONTAL_PADDING);
        // Happy DOM does not calculate element geometry.
        Object.defineProperty(shell, "clientWidth", { get: () => window.innerWidth });
        for (const columns of ["1", "2", "3", "auto"] as const) {
            preferences.setColumns(columns);
            for (const width of [
                390, AUTO_MEDIUM_BREAKPOINT - 1, AUTO_MEDIUM_BREAKPOINT, AUTO_MEDIUM_BREAKPOINT + 1,
                AUTO_WIDE_BREAKPOINT - 1, AUTO_WIDE_BREAKPOINT, AUTO_WIDE_BREAKPOINT + 1, 1280, 390,
            ]) {
                viewport.setViewport({ width });
                window.dispatchEvent(new Event("resize"));
                const count = columns === "auto"
                    ? width >= AUTO_WIDE_BREAKPOINT ? 3 : width >= AUTO_MEDIUM_BREAKPOINT ? 2 : 1
                    : Number(columns) as 1 | 2 | 3;
                const expected = `${LAYOUT_WIDTHS[count]}px`;
                expect(shell.style.getPropertyValue("--kcq-layout-width")).toBe(expected);
                const canvas = getComputedStyle(background);
                expect(canvas.width).toBe(expected);
                expect(canvas.minWidth).toBe(expected);
                expect(canvas.maxWidth).toBe("");
                expect(canvas.flexShrink).toBe("0");
                expect(getComputedStyle(shell).overflowX).toBe("auto");
            }
        }
    });
});
