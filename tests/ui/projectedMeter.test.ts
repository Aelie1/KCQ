import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it, vi } from "vitest";
import { ProjectedMeter, type ProjectedMeterProps } from "../../src/ui/web/app/components/ProjectedMeter";

const render = (props: ProjectedMeterProps) => renderToString(() => createComponent(ProjectedMeter, props));

describe("projected meter", () => {
    it("renders current fill and the projected increase in the supplied tone", () => {
        const html = render({ value: 20, change: 30, max: 100, tone: "primary", ariaLabel: "Subspace" });
        expect(html).toContain("kcq-projected-meter--increase");
        expect(html).toContain('class="kcq-projected-meter__value" style="width:20%"');
        expect(html).toContain("kcq-projected-meter__change--primary");
        expect(html).toContain("left:calc(20% - var(--kcq-projected-meter-radius))");
        expect(html).toContain("width:calc(30% + var(--kcq-projected-meter-radius))");
        expect(html).toContain('aria-label="Subspace"');
        expect(html).toContain('aria-valuenow="20"');
    });

    it("renders retained fill and the projected decrease", () => {
        const html = render({ value: 70, change: -20, max: 100, tone: "warning", size: "compact" });
        expect(html).toContain("kcq-projected-meter--compact");
        expect(html).toContain("kcq-projected-meter--decrease");
        expect(html).toContain('class="kcq-projected-meter__value" style="width:50%"');
        expect(html).toContain("left:calc(50% - var(--kcq-projected-meter-radius))");
        expect(html).toContain("width:calc(20% + var(--kcq-projected-meter-radius))");
    });

    it.each([
        { value: 90, change: 50, fill: 90, delta: 10, current: 90 },
        { value: 20, change: -50, fill: 0, delta: 20, current: 20 },
        { value: -10, change: 30, fill: 0, delta: 20, current: 0 },
        { value: 120, change: -30, fill: 90, delta: 10, current: 100 },
    ])("clamps current and projected extents to the bounds: $value + $change", ({ value, change, fill, delta, current }) => {
        const html = render({ value, change, max: 100, tone: "primary" });
        expect(html).toContain('aria-valuenow="' + current + '"');
        expect(html).toContain('class="kcq-projected-meter__value" style="width:' + fill + '%"');
        expect(html).toContain(fill === 0 ? "left:0%;width:" + delta + "%" : "width:calc(" + delta + "% + var(--kcq-projected-meter-radius))");
    });

    it.each([
        { treatment: "increase", from: 20, to: 30, left: 20, width: 10 },
        { treatment: "recovery", from: 30, to: 20, left: 20, width: 10 },
        { treatment: "increase", from: 90, to: 120, left: 90, width: 10 },
        { treatment: "recovery", from: 20, to: -5, left: 0, width: 20 },
    ])("keeps $treatment glow geometry precise and resumes its remaining lifetime", ({ treatment, from, to, left, width }) => {
        const clock = vi.spyOn(Date, "now").mockReturnValue(1750);
        try {
            const html = render({ value: 30, max: 100, tone: "heavy", classPrefix: "kcq-binding-meter", reactions: [{
                kind: "binding", entity: "ko", detail: "latexHead", treatment, from, to,
                serial: 1, started: 1000, duration: 2500,
            }] });
            expect(html).toContain('data-combat-reaction="' + treatment + '"');
            expect(html).toContain('left:' + left + '%;width:' + width + '%');
            expect(html).toContain("kcq-react-binding-fade 2500ms linear -750ms forwards");
            expect(html).toContain("kcq-binding-meter--heavy");
            expect(html).toContain('aria-valuenow="30"');
            expect(html).toContain('class="kcq-binding-meter__value" style="width:30%"');
        } finally {
            clock.mockRestore();
        }
    });

    it("handles zero capacity without invalid geometry and clamps the peak", () => {
        const html = render({ value: 50, change: 20, max: 0, peak: 200, tone: "primary" });
        expect(html).toContain('aria-valuemax="0"');
        expect(html).toContain('aria-valuenow="0"');
        expect(html).toContain('class="kcq-projected-meter__peak" style="width:0%"');
        expect(html).not.toContain("kcq-projected-meter__change");
        expect(html).not.toMatch(/NaN|Infinity/);
    });

    it("rounds both ends of an increase from zero and retains standard peak sizing", () => {
        const html = render({ value: 0, change: 25, max: 50, peak: 100, tone: "warning" });
        expect(html).toContain("kcq-projected-meter--standard");
        expect(html).toContain("kcq-projected-meter__change--from-zero");
        expect(html).toContain('style="left:0%;width:50%"');
        expect(html).toContain('class="kcq-projected-meter__peak" style="width:100%"');
    });
});
