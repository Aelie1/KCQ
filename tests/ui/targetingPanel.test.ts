import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
        expect(html).toContain("kcq-target-header__value\">152</span>");
        expect(html).not.toContain("152 / 200");
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

    it("uses the compact growing specialized-effect layout and legible damage text", () => {
        const css = readFileSync(resolve("src/ui/web/app/app.css"), "utf8");
        const specializedRule = css.match(/\.kcq-buff-effect,\s*\.kcq-binding-effect\s*\{([^}]*)\}/)?.[1] ?? "";
        const accentRule = css.match(/\.kcq-buff-effect>\.kcq-preview-effect__accent,\s*\.kcq-binding-effect>\.kcq-preview-effect__accent\s*\{([^}]*)\}/)?.[1] ?? "";
        const modifiersRule = css.match(/\.kcq-buff-effect__modifiers\s*\{([^}]*)\}/)?.[1] ?? "";
        const detailsRule = css.match(/\.kcq-buff-effect__details\s*\{([^}]*)\}/)?.[1] ?? "";
        const bandRule = css.match(/\.kcq-damage-profile__band\s*\{([^}]*)\}/)?.[1] ?? "";
        const valueRule = css.match(/\.kcq-damage-profile__band strong\s*\{([^}]*)\}/)?.[1] ?? "";

        expect(specializedRule).toContain("grid-template-columns: 3px auto minmax(0, 1fr)");
        expect(accentRule).toContain("height: auto");
        expect(modifiersRule).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
        expect(detailsRule).toContain("flex-wrap: wrap");
        expect(bandRule).toContain("font-size: 10px");
        expect(valueRule).toContain("font-size: 11px");
    });
});
