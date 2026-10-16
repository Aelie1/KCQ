import { afterEach, describe, expect, it, vi } from "vitest";
import { BATTLE_LAYOUT_WIDTHS, calculateResponsiveLayout, setupResponsiveScale } from "../../src/ui/web/app/responsiveScale";

function viewport(width = 390, height = 844, visualHeight?: number) {
    const style = new Map<string, string>();
    const shell = {
        clientWidth: width,
        style: { setProperty: (key: string, value: string) => style.set(key, value) },
    };
    const windowEvents = new EventTarget();
    const visualEvents = new EventTarget();
    const visualViewport = visualHeight === undefined ? undefined : Object.assign(visualEvents, { height: visualHeight });
    const browser = Object.assign(windowEvents, {
        innerHeight: height,
        visualViewport,
        getComputedStyle: () => ({ paddingLeft: "12px", paddingRight: "12px", paddingTop: "12px", paddingBottom: "12px" }),
    });
    let observedResize!: () => void;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal("window", browser);
    vi.stubGlobal("ResizeObserver", class {
        constructor(callback: () => void) { observedResize = callback; }
        observe = observe;
        disconnect = disconnect;
    });
    const cleanup = setupResponsiveScale(shell as unknown as HTMLElement);
    return { shell, style, browser, visualViewport, observedResize, observe, disconnect, cleanup };
}

afterEach(() => vi.unstubAllGlobals());

describe("graphical viewport sizing", () => {
    it.each([400, 600, 844, 1200])("uses the actual %ipx height with the existing desktop zoom cap", (height) => {
        const { style } = viewport(1920, height);
        expect(style.get("--kcq-ui-zoom")).toBe("1.5");
        expect(parseFloat(style.get("--kcq-ui-height")!)).toBeCloseTo((height - 24) / 1.5);
    });

    it("uses visual viewport height and updates on both viewport resize sources", () => {
        const { style, browser, visualViewport } = viewport(390, 844, 700);
        expect(style.get("--kcq-ui-height")).toBe("676px");
        visualViewport!.height = 480;
        visualViewport!.dispatchEvent(new Event("resize"));
        expect(style.get("--kcq-ui-height")).toBe("456px");
        visualViewport!.height = 920;
        browser.dispatchEvent(new Event("resize"));
        expect(style.get("--kcq-ui-height")).toBe("896px");
    });

    it("updates zoom and pre-zoom height when the shell width changes", () => {
        const { shell, style, observedResize, observe } = viewport();
        expect(observe).toHaveBeenCalledWith(shell);
        expect(style.get("--kcq-ui-zoom")).toBe("1");
        shell.clientWidth = 463.2;
        observedResize();
        expect(parseFloat(style.get("--kcq-ui-zoom")!)).toBeCloseTo(1.2);
        expect(parseFloat(style.get("--kcq-ui-height")!)).toBeCloseTo(820 / 1.2);
    });

    it("reads current padding and cleans up resize subscriptions", () => {
        const { browser, visualViewport, style, disconnect, cleanup, observedResize } = viewport(390, 844, 600);
        browser.getComputedStyle = () => ({ paddingLeft: "0px", paddingRight: "0px", paddingTop: "5px", paddingBottom: "15px" });
        observedResize();
        expect(parseFloat(style.get("--kcq-ui-height")!)).toBeCloseTo(580 / (390 / 366));
        cleanup();
        expect(disconnect).toHaveBeenCalledOnce();
        const before = new Map(style);
        visualViewport!.height = 300;
        visualViewport!.dispatchEvent(new Event("resize"));
        browser.dispatchEvent(new Event("resize"));
        expect(style).toEqual(before);
    });
});

describe("column-first scaling", () => {
    it.each([
        [296, 1, 1], [366, 1, 1], [500, 1, 500 / 366], [755, 1, 1.5],
        [756, 2, 1], [900, 2, 900 / 756], [1067, 2, 1067 / 756],
        [1068, 3, 1], [1256, 3, 1256 / 1068], [1602, 3, 1.5], [2500, 3, 1.5],
    ])("fits the maximum columns at 100%% into %ipx before scaling", (width, columns, zoom) => {
        expect(calculateResponsiveLayout(width)).toEqual({ columns, zoom });
    });

    it.each(["1", "2", "3"] as const)("keeps forced %s columns throughout resizing", preference => {
        const columns = Number(preference) as 1 | 2 | 3;
        for (const width of [296, 366, 755, 756, 1067, 1068, 1256, 2500, 366]) {
            const layout = calculateResponsiveLayout(width, preference);
            expect(layout.columns).toBe(columns);
            expect(layout.zoom).toBe(Math.max(1, Math.min(1.5, width / BATTLE_LAYOUT_WIDTHS[columns])));
            if (width < BATTLE_LAYOUT_WIDTHS[columns]) expect(layout.zoom).toBe(1);
        }
    });

    it("uses the unzoomed shell width and stays stable at breakpoints", () => {
        const { shell, style, observedResize } = viewport(1280);
        expect(parseFloat(style.get("--kcq-ui-zoom")!)).toBeCloseTo(1.176);
        for (const breakpoint of [780, 1092]) {
            for (const width of [breakpoint - 1, breakpoint, breakpoint + 1, breakpoint, breakpoint - 1]) {
                shell.clientWidth = width;
                observedResize();
                const before = new Map(style);
                for (let index = 0; index < 10; index++) observedResize();
                expect(style).toEqual(before);
                expect(Number(style.get("--kcq-ui-zoom"))).toBe(calculateResponsiveLayout(width - 24).zoom);
            }
        }
        expect(style.get("--kcq-ui-min-width")).toBe("366px");
    });
});
