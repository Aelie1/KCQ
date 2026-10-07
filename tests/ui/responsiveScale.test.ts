import { afterEach, describe, expect, it, vi } from "vitest";
import { setupResponsiveScale } from "../../src/ui/web/app/responsiveScale";

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
        const { style } = viewport(900, height);
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
