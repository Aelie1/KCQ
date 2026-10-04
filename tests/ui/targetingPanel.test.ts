import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { targetingFixtures } from "../../src/ui/web/app/fixtures/targeting";
import { TargetingPanel } from "../../src/ui/web/app/panels/TargetingPanel";
import type { ActionInfo } from "../../src/engine/public/types";

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

    it("renders a zero-target buff without an Automatic Target card", () => {
        const fixture = targetingFixtures.telekinesisChoose;
        const action: ActionInfo = {
            move: { id: "fairyTransformation", targetSide: "player", targets: 0, type: "mouth" },
            available: true,
            targets: [{
                valid: true,
                target: null,
                effects: [{
                    type: "buff", target: "ko", operation: "add",
                    buff: { id: "transformation", duration: 3, modifiers: { defense: 3 } },
                }],
            }],
            effects: [],
        };
        const html = renderToString(() => createComponent(TargetingPanel, { ...fixture, action }));

        expect(html).not.toContain("Automatic Target");
        expect(html).not.toContain("Target / Automatic");
        expect(countClass(html, "kcq-target-card")).toBe(0);
        expect(html).toContain("Fairy Transformation");
        expect(html).toContain("3 Rounds");
    });
});
