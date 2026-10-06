import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { BindingMeter, type BindingMeterProps } from "../../src/ui/web/app/components/BindingMeter";

function render(props: BindingMeterProps): string {
    return renderToString(() => createComponent(BindingMeter, props));
}

describe("binding meter", () => {
    it("renders a solid current value with progressbar semantics", () => {
        const html = render({
            value: 40,
            max: 100,
            level: "heavy",
            ariaLabel: "Arms binding",
        });

        expect(html).toContain("kcq-binding-meter--standard");
        expect(html).toContain("kcq-binding-meter--heavy");
        expect(html).toContain("kcq-binding-meter--steady");
        expect(html).toContain('role="progressbar"');
        expect(html).toContain('aria-label="Arms binding"');
        expect(html).toContain('aria-valuenow="40"');
        expect(html).toContain('aria-valuemax="100"');
        expect(html).toContain('class="kcq-binding-meter__value" style="width:40%"');
        expect(html).not.toContain("kcq-binding-meter__change");
    });

    it("renders a positive signed delta after the current value in the result level color", () => {
        const html = render({
            value: 40,
            change: 20,
            max: 100,
            level: "heavy",
            resultLevel: "severe",
        });

        expect(html).toContain("kcq-binding-meter--increase");
        expect(html).toContain('class="kcq-binding-meter__value" style="width:40%"');
        expect(html).toContain("kcq-binding-meter__change--severe");
        expect(html).toContain('style="left:calc(40% - var(--kcq-binding-meter-radius));width:calc(20% + var(--kcq-binding-meter-radius))');
    });

    it("renders a negative signed delta as the portion removed from the current value", () => {
        const html = render({
            value: 60,
            change: -25,
            max: 100,
            level: "severe",
            resultLevel: "heavy",
            size: "compact",
        });

        expect(html).toContain("kcq-binding-meter--compact");
        expect(html).toContain("kcq-binding-meter--decrease");
        expect(html).toContain('class="kcq-binding-meter__value" style="width:35%"');
        expect(html).toContain("kcq-binding-meter__change--heavy");
        expect(html).toContain('style="left:calc(35% - var(--kcq-binding-meter-radius));width:calc(25% + var(--kcq-binding-meter-radius))"');
    });

    it("renders the historical peak as a separate outline extent", () => {
        const html = render({
            value: 35,
            peak: 75,
            max: 100,
            level: "heavy",
        });

        expect(html).toContain('class="kcq-binding-meter__peak" style="width:75%"');
    });

    it("rounds both ends when the change section begins at zero", () => {
        const html = render({
            value: 20,
            change: -20,
            max: 100,
            level: "moderate",
            resultLevel: "none",
        });

        expect(html).toContain("kcq-binding-meter__change--from-zero");
        expect(html).toContain('style="left:0%;width:20%"');
    });

    it("clamps geometry while retaining the supplied current value for ARIA", () => {
        const html = render({
            value: 90,
            change: 25,
            max: 100,
            level: "overwhelming",
            resultLevel: "max",
        });

        expect(html).toContain('aria-valuenow="90"');
        expect(html).toContain('class="kcq-binding-meter__value" style="width:90%"');
        expect(html).toContain('style="left:calc(90% - var(--kcq-binding-meter-radius));width:calc(10% + var(--kcq-binding-meter-radius))');
    });
});
