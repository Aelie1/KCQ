import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { targetingFixtures } from "../../src/ui/web/app/fixtures/targeting";
import { TargetingPanel } from "../../src/ui/web/app/panels/TargetingPanel";

function countClass(html: string, className: string): number {
    return [...html.matchAll(/class="([^"]*)"/g)]
        .filter((match) => match[1].split(/\s+/).includes(className))
        .length;
}

describe("targeting workflow composition", () => {
    it("renders each shared character-details section once and replaces commands", () => {
        const html = renderToString(() => createComponent(
            TargetingPanel,
            targetingFixtures.telekinesisChoose,
        ));

        expect(countClass(html, "kcq-character-details__header")).toBe(1);
        expect(countClass(html, "kcq-character-roster")).toBe(1);
        expect(countClass(html, "kcq-focused-character")).toBe(1);
        expect(countClass(html, "kcq-character-capabilities")).toBe(1);
        expect(countClass(html, "kcq-character-bindings")).toBe(1);
        expect(countClass(html, "kcq-character-effects")).toBe(1);
        expect(countClass(html, "kcq-character-commands")).toBe(0);
        expect(countClass(html, "kcq-targeting")).toBe(1);
    });

    it("preserves the composed ready state", () => {
        const html = renderToString(() => createComponent(
            TargetingPanel,
            targetingFixtures.telekinesisReady,
        ));
        const executeButton = html.match(/<button[^>]*class="kcq-targeting__execute"[^>]*>/)?.[0];

        expect(countClass(html, "is-selected")).toBe(1);
        expect(executeButton).toBeDefined();
        expect(executeButton).not.toContain("disabled");
    });
});
