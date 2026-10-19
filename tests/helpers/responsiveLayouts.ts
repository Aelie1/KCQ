import { LAYOUT_WIDTHS, type ResponsiveLayout } from "../../src/ui/web/app/responsiveScale";

export const responsiveLayouts = {
    narrow: { columns: 1, size: "narrow", zoom: 1, availableWidth: LAYOUT_WIDTHS[1] },
    medium: { columns: 2, size: "medium", zoom: 1, availableWidth: LAYOUT_WIDTHS[2] },
    wide: { columns: 3, size: "wide", zoom: 1, availableWidth: LAYOUT_WIDTHS[3] },
} satisfies Record<string, ResponsiveLayout>;

// Physical width and zoom must not override the selected presentation.
export const responsivePresentationCases: [ResponsiveLayout, boolean][] = [
    [responsiveLayouts.narrow, false],
    [responsiveLayouts.medium, true],
    [responsiveLayouts.wide, true],
    [{ ...responsiveLayouts.wide, availableWidth: LAYOUT_WIDTHS[1] }, true],
    [{ ...responsiveLayouts.medium, zoom: 1.5, availableWidth: LAYOUT_WIDTHS[1] }, true],
    [{ ...responsiveLayouts.narrow, zoom: 1.5, availableWidth: LAYOUT_WIDTHS[3] * 1.5 }, false],
    [{ columns: 2, size: "medium", zoom: 1 }, true],
    [{ columns: 3, size: "wide", zoom: 1 }, true],
];
