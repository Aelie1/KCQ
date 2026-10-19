import { afterEach, describe, expect, it, vi } from "vitest";
import {
    AUTO_MEDIUM_BREAKPOINT,
    AUTO_WIDE_BREAKPOINT,
    SHELL_HORIZONTAL_PADDING,
    availableWidthFromViewport,
    LAYOUT_WIDTHS,
    calculateResponsiveLayout,
    layoutSize,
    setupResponsiveScale,
} from "../../src/ui/web/app/responsiveScale";

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
        getComputedStyle: () => ({ paddingLeft: `${SHELL_HORIZONTAL_PADDING / 2}px`, paddingRight: `${SHELL_HORIZONTAL_PADDING / 2}px`, paddingTop: "12px", paddingBottom: "12px" }),
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

    it("preserves the canonical canvases independently of auto breakpoints", () => {
        expect(LAYOUT_WIDTHS).toEqual({ 1: 366, 2: 756, 3: 1146 });
        expect(availableWidthFromViewport(390)).toBe(366);
    });

    it.each([
        [296, 1, "narrow"], [366, 1, "narrow"], [500, 1, "narrow"],
        [LAYOUT_WIDTHS[2], 1, "narrow"], [900, 2, "medium"],
        [LAYOUT_WIDTHS[3], 2, "medium"], [availableWidthFromViewport(1280), 2, "medium"],
        ...([-1, -0.001, 0, 0.001, 1] as const).flatMap(offset => [
            [availableWidthFromViewport(AUTO_MEDIUM_BREAKPOINT) + offset, offset < 0 ? 1 : 2, offset < 0 ? "narrow" : "medium"],
            [availableWidthFromViewport(AUTO_WIDE_BREAKPOINT) + offset, offset < 0 ? 2 : 3, offset < 0 ? "medium" : "wide"],
        ] as const),
    ] as const)("selects %s available pixels by viewport policy (%i columns, %s)", (availableWidth, columns, size) => {
        expect(calculateResponsiveLayout(availableWidth)).toEqual({
            columns, size,
            zoom: Math.min(1.5, Math.max(1, availableWidth / LAYOUT_WIDTHS[columns])),
        });
    });

    it.each([
        [LAYOUT_WIDTHS[3] * 1.5 - 0.001, (LAYOUT_WIDTHS[3] * 1.5 - 0.001) / LAYOUT_WIDTHS[3]],
        [LAYOUT_WIDTHS[3] * 1.5, 1.5], [2500, 1.5],
    ])("caps wide zoom at 1.5 for %s available pixels", (availableWidth, zoom) => {
        expect(calculateResponsiveLayout(availableWidth)).toEqual({ columns: 3, size: "wide", zoom });
    });

    it.each([
        ["1", "narrow"], ["2", "medium"], ["3", "wide"],
    ] as const)("keeps forced %s columns throughout resizing with size %s", (preference, size) => {
        const columns = Number(preference) as 1 | 2 | 3;
        for (const availableWidth of [
            296, 366, LAYOUT_WIDTHS[2], LAYOUT_WIDTHS[3],
            ...[AUTO_MEDIUM_BREAKPOINT, AUTO_WIDE_BREAKPOINT].flatMap(breakpoint =>
                [-1, 0, 1].map(offset => availableWidthFromViewport(breakpoint + offset))),
            2500, 366,
        ]) {
            const layout = calculateResponsiveLayout(availableWidth, preference);
            expect(layout.columns).toBe(columns);
            expect(layout.size).toBe(size);
            expect(layout.zoom).toBe(Math.max(1, Math.min(1.5, availableWidth / LAYOUT_WIDTHS[columns])));
            if (availableWidth < LAYOUT_WIDTHS[columns]) expect(layout.zoom).toBe(1);
        }
    });

    it("publishes canonical layout sizes as the shell crosses boundaries in both directions", () => {
        const { shell, style, observedResize, onLayout } = viewport(390);
        expect(shell.dataset.kcqLayout).toBe("narrow");
        for (const [viewportWidth, size] of [
            [AUTO_MEDIUM_BREAKPOINT - 1, "narrow"], [AUTO_MEDIUM_BREAKPOINT, "medium"], [AUTO_MEDIUM_BREAKPOINT + 1, "medium"],
            [AUTO_WIDE_BREAKPOINT - 1, "medium"], [AUTO_WIDE_BREAKPOINT, "wide"], [AUTO_WIDE_BREAKPOINT + 1, "wide"],
            [AUTO_WIDE_BREAKPOINT - 1, "medium"], [AUTO_MEDIUM_BREAKPOINT - 1, "narrow"],
        ] as const) {
            shell.clientWidth = viewportWidth;
            const availableWidth = availableWidthFromViewport(viewportWidth);
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
    });

    it("uses the unzoomed shell width and stays stable at breakpoints", () => {
        const { shell, style, observedResize } = viewport(1280);
        expect(parseFloat(style.get("--kcq-ui-zoom")!)).toBeCloseTo(1.5);
        for (const breakpoint of [AUTO_MEDIUM_BREAKPOINT, AUTO_WIDE_BREAKPOINT]) {
            for (const width of [breakpoint - 1, breakpoint, breakpoint + 1, breakpoint, breakpoint - 1]) {
                shell.clientWidth = width;
                observedResize();
                const before = new Map(style);
                for (let index = 0; index < 10; index++) observedResize();
                expect(style).toEqual(before);
                const expected = calculateResponsiveLayout(availableWidthFromViewport(width));
                expect(Number(style.get("--kcq-ui-zoom"))).toBe(expected.zoom);
                expect(shell.dataset.kcqLayout).toBe(expected.size);
            }
        }
    });
});
