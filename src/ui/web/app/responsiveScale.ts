import { createContext, createRenderEffect, createRoot, useContext, type Accessor } from "solid-js";
import { ViewPreferencesContext, type BattleColumns, type ViewPreferences } from "./viewPreferences";

const COLUMN_WIDTH = 366;
const COLUMN_GAP = 24;

export const LAYOUT_WIDTHS = {
    1: COLUMN_WIDTH,
    2: COLUMN_WIDTH * 2 + COLUMN_GAP,
    3: COLUMN_WIDTH * 3 + COLUMN_GAP * 2,
} as const;

export type LayoutSize = "narrow" | "medium" | "wide";

export function layoutSize(columns: 1 | 2 | 3): LayoutSize {
    return columns === 1 ? "narrow" : columns === 2 ? "medium" : "wide";
}

export interface ResponsiveLayout {
    columns: 1 | 2 | 3;
    size: LayoutSize;
    zoom: number;
    availableWidth?: number;
}
export const ResponsiveLayoutContext = createContext<Accessor<ResponsiveLayout>>();

/** Choose columns at 100% first, then fit that layout without shrinking it. */
export function calculateResponsiveLayout(availableWidth: number, preference: BattleColumns = "auto"): ResponsiveLayout {
    const columns = preference === "auto"
        ? availableWidth >= LAYOUT_WIDTHS[3] ? 3 : availableWidth >= LAYOUT_WIDTHS[2] ? 2 : 1
        : Number(preference) as 1 | 2 | 3;
    return { columns, size: layoutSize(columns), zoom: Math.min(1.5, Math.max(1, availableWidth / LAYOUT_WIDTHS[columns])) };
}

/** Publish viewport dimensions in the coordinates used by the zoomed screens. */
export function setupResponsiveScale(
    shell: HTMLElement,
    preferences: ViewPreferences | undefined = useContext(ViewPreferencesContext),
    onLayout?: (layout: ResponsiveLayout) => void,
): () => void {
    const visualViewport = window.visualViewport;
    // Body portals use the shell's exact layout even in an embedded viewport.
    const sharedLayout = useContext(ResponsiveLayoutContext);

    const resizeGame = (): void => {
        const style = window.getComputedStyle(shell);
        const horizontalPadding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
        const verticalPadding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
        const availableWidth = shell.clientWidth - horizontalPadding;
        // Only the children are zoomed. Never measure their scaled width here.
        const layout = sharedLayout?.() ?? calculateResponsiveLayout(availableWidth, preferences?.columns);
        const { zoom } = layout;
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;

        shell.style.setProperty("--kcq-ui-zoom", String(zoom));
        shell.style.setProperty("--kcq-layout-width", `${LAYOUT_WIDTHS[layout.columns]}px`);
        shell.style.setProperty("--kcq-ui-min-width", "366px");
        shell.style.setProperty("--kcq-ui-height", `${Math.max(0, viewportHeight - verticalPadding) / zoom}px`);
        shell.dataset.kcqLayout = layout.size;
        // Decide title layout from the same unzoomed width as the scaler.
        // Comparing ratios also avoids rounding at exactly two scaled panels.
        shell.dataset.kcqTitleLayout = zoom <= availableWidth / LAYOUT_WIDTHS[2] ? "desktop" : "mobile";
        onLayout?.({ ...layout, availableWidth });
    };

    const observer = new ResizeObserver(resizeGame);
    observer.observe(shell);
    window.addEventListener("resize", resizeGame);
    visualViewport?.addEventListener("resize", resizeGame);
    resizeGame();
    const dispose = createRoot(dispose => {
        if (preferences || sharedLayout) createRenderEffect(resizeGame);
        return dispose;
    });

    return () => {
        dispose();
        observer.disconnect();
        window.removeEventListener("resize", resizeGame);
        visualViewport?.removeEventListener("resize", resizeGame);
    };
}
