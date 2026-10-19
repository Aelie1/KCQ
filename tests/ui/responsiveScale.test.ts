import { afterEach, describe, expect, it, vi } from "vitest";
import { LAYOUT_WIDTHS, calculateResponsiveLayout, layoutSize, setupResponsiveScale } from "../../src/ui/web/app/responsiveScale";

function viewport(width = 390, height = 844, visualHeight?: number, columns: "auto" | "1" | "2" | "3" = "auto") {
    const style = new Map<string, string>();
    const shell = {
        clientWidth: width,
        dataset: {} as Record<string, string>,
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
    const onLayout = vi.fn();
    const cleanup = setupResponsiveScale(shell as unknown as HTMLElement, {
        columns, enemyCards: "auto", setColumns: vi.fn(), setEnemyCards: vi.fn(), reset: vi.fn(),
    }, onLayout);
    return { shell, style, browser, visualViewport, observedResize, observe, disconnect, cleanup, onLayout };
}

afterEach(() => vi.unstubAllGlobals());

describe("graphical viewport sizing", () => {
    it("publishes usable width independently of forced battle columns for responsive screens", () => {
        const { shell, observedResize, onLayout } = viewport(390, 844, undefined, "3");
        expect(onLayout).toHaveBeenLastCalledWith({ columns: 3, size: "wide", zoom: 1, availableWidth: 366 });
        shell.clientWidth = 1920;
        observedResize();
        expect(onLayout).toHaveBeenLastCalledWith({ columns: 3, size: "wide", zoom: 1.5, availableWidth: 1896 });
    });

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
        [1, "narrow"], [2, "medium"], [3, "wide"],
    ] as const)("maps %i columns to %s", (columns, size) => {
        expect(layoutSize(columns)).toBe(size);
    });

    it.each([
        [296, 1, "narrow", 1], [366, 1, "narrow", 1], [500, 1, "narrow", 500 / 366], [755, 1, "narrow", 1.5],
        [755.999, 1, "narrow", 1.5], [756, 2, "medium", 1], [756.001, 2, "medium", 756.001 / 756],
        [900, 2, "medium", 900 / 756], [1145, 2, "medium", 1.5], [1145.999, 2, "medium", 1.5],
        [1146, 3, "wide", 1], [1146.001, 3, "wide", 1146.001 / LAYOUT_WIDTHS[3]],
        [1256, 3, "wide", 1256 / LAYOUT_WIDTHS[3]],
        [LAYOUT_WIDTHS[3] * 1.5 - 0.001, 3, "wide", (LAYOUT_WIDTHS[3] * 1.5 - 0.001) / LAYOUT_WIDTHS[3]],
        [LAYOUT_WIDTHS[3] * 1.5, 3, "wide", 1.5], [2500, 3, "wide", 1.5],
    ])("fits the maximum columns at 100%% into %ipx before scaling", (width, columns, size, zoom) => {
        expect(calculateResponsiveLayout(width)).toEqual({ columns, size, zoom });
    });

    it.each([
        ["1", "narrow"], ["2", "medium"], ["3", "wide"],
    ] as const)("keeps forced %s columns throughout resizing with size %s", (preference, size) => {
        const columns = Number(preference) as 1 | 2 | 3;
        for (const width of [296, 366, 755, 756, 1145, 1146, 1256, 2500, 366]) {
            const layout = calculateResponsiveLayout(width, preference);
            expect(layout.columns).toBe(columns);
            expect(layout.size).toBe(size);
            expect(layout.zoom).toBe(Math.max(1, Math.min(1.5, width / LAYOUT_WIDTHS[columns])));
            if (width < LAYOUT_WIDTHS[columns]) expect(layout.zoom).toBe(1);
        }
    });

    it("publishes canonical layout sizes as the shell crosses boundaries in both directions", () => {
        const { shell, style, observedResize, onLayout } = viewport(390);
        expect(shell.dataset.kcqLayout).toBe("narrow");
        for (const [availableWidth, size] of [
            [755.999, "narrow"], [756, "medium"], [1145.999, "medium"], [1146, "wide"],
            [1145.999, "medium"], [755.999, "narrow"],
        ] as const) {
            shell.clientWidth = availableWidth + 24;
            observedResize();
            expect(shell.dataset.kcqLayout).toBe(size);
            expect(onLayout.mock.lastCall![0]).toMatchObject({ size, availableWidth });
            expect(style.get("--kcq-layout-width")).toBe(`${LAYOUT_WIDTHS[calculateResponsiveLayout(availableWidth).columns]}px`);
        }
    });

    it.each([
        ["1", "narrow"], ["2", "medium"], ["3", "wide"],
    ] as const)("publishes forced %s columns as %s independently of shell width", (columns, size) => {
        const { shell, style, observedResize } = viewport(390, 844, undefined, columns);
        expect(shell.dataset.kcqLayout).toBe(size);
        expect(style.get("--kcq-layout-width")).toBe(`${LAYOUT_WIDTHS[Number(columns) as 1 | 2 | 3]}px`);
        shell.clientWidth = 1920;
        observedResize();
        expect(shell.dataset.kcqLayout).toBe(size);
        expect(style.get("--kcq-layout-width")).toBe(`${LAYOUT_WIDTHS[Number(columns) as 1 | 2 | 3]}px`);
        expect(shell.dataset.kcqTitleLayout).toBe("desktop");
    });

    it("uses the unzoomed shell width and stays stable at breakpoints", () => {
        const { shell, style, observedResize } = viewport(1280);
        expect(parseFloat(style.get("--kcq-ui-zoom")!)).toBeCloseTo((1280 - 24) / LAYOUT_WIDTHS[3]);
        for (const breakpoint of [LAYOUT_WIDTHS[2] + 24, LAYOUT_WIDTHS[3] + 24]) {
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

describe("title layout coordinated with scaling", () => {
    it("settles on both sides of the breakpoint using the same width as zoom", () => {
        const { shell, style, browser, observedResize } = viewport(800, 326);
        for (const width of [800, 781, 780, 779, 778, 779, 780, 781, 800]) {
            shell.clientWidth = width;
            browser.dispatchEvent(new Event("resize"));
            const expectedZoom = calculateResponsiveLayout(width - 24).zoom;
            const expectedTitle = width >= 780 ? "desktop" : "mobile";
            const before = new Map(style);
            for (let frame = 0; frame < 30; frame++) {
                observedResize();
                browser.dispatchEvent(new Event("resize"));
                expect(style).toEqual(before);
                expect(Number(style.get("--kcq-ui-zoom"))).toBe(expectedZoom);
                expect(shell.dataset.kcqTitleLayout).toBe(expectedTitle);
            }
        }
    });

    it.each([
        ["auto", 1024, "desktop"], ["auto", 1920, "desktop"],
        ["1", 1024, "mobile"], ["1", 1157, "mobile"], ["1", 1158, "desktop"],
        ["2", 779, "mobile"], ["2", 780, "desktop"],
        ["3", 779, "mobile"], ["3", 780, "desktop"],
    ] as const)("fits title panels with preference %s at %ipx without changing zoom", (columns, width, title) => {
        const { shell, style } = viewport(width, 800, undefined, columns);
        expect(shell.dataset.kcqTitleLayout).toBe(title);
        expect(Number(style.get("--kcq-ui-zoom"))).toBe(calculateResponsiveLayout(width - 24, columns).zoom);
    });
});
