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
        const previewRule = css.match(/\.kcq-preview-effect\s*\{([^}]*)\}/)?.[1] ?? "";
        const specializedRule = css.match(/\.kcq-buff-effect,\s*\.kcq-binding-effect\s*\{([^}]*)\}/)?.[1] ?? "";
        const accentRule = css.match(/\.kcq-buff-effect>\.kcq-preview-effect__accent,\s*\.kcq-binding-effect>\.kcq-preview-effect__accent\s*\{([^}]*)\}/)?.[1] ?? "";
        const modifiersRule = css.match(/\.kcq-buff-effect__modifiers\s*\{([^}]*)\}/)?.[1] ?? "";
        const detailsRule = css.match(/\.kcq-buff-effect__details\s*\{([^}]*)\}/)?.[1] ?? "";
        const bandRule = css.match(/\.kcq-damage-profile__band\s*\{([^}]*)\}/)?.[1] ?? "";
        const valueRule = css.match(/\.kcq-damage-profile__band strong\s*\{([^}]*)\}/)?.[1] ?? "";
        const groupHeadingRule = css.match(/\.kcq-targeting__action-effect-group h3\s*\{([^}]*)\}/)?.[1] ?? "";
        const actionEffectsRule = css.match(/\.kcq-targeting__action-effects\s*\{([^}]*)\}/)?.[1] ?? "";

        expect(previewRule).toContain("background: var(--kcq-surface-panel-alt)");
        expect(previewRule).toContain("padding: 2px 4px 2px 0");
        expect(specializedRule).toContain("grid-template-columns: 3px auto minmax(0, 1fr)");
        expect(specializedRule).not.toContain("overflow: hidden");
        expect(accentRule).toContain("height: auto");
        expect(modifiersRule).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
        expect(detailsRule).toContain("flex-wrap: wrap");
        expect(bandRule).toContain("font-size: 10px");
        expect(valueRule).toContain("font-size: 11px");
        expect(valueRule).toContain("font-weight: 600");
        expect(groupHeadingRule).toContain("letter-spacing: 0.015em");
        expect(actionEffectsRule).toContain("gap: 7px");
    });

    it("renders four structured accuracy bands with pipe separators and dim zero bands", () => {
        const fixture = targetingFixtures.telekinesisChoose;
        const action: ActionInfo = {
            ...fixture.action,
            targets: [{
                valid: true,
                target: "skunkette1",
                accuracy: { miss: 40, hit: 60 },
                effects: [],
            }],
        };
        const html = renderToString(() => createComponent(TargetingPanel, { ...fixture, action }));

        expect(countClass(html, "kcq-accuracy-profile__band")).toBe(4);
        expect(countClass(html, "kcq-accuracy-profile__separator")).toBe(3);
        expect(countClass(html, "is-zero")).toBe(2);
        expect(html).toContain("Miss · 40%");
        expect(html).toContain("Graze · 0%");
        expect(html).toContain(">|</span>");
        expect(html).not.toContain("Ã‚");
    });

    it("stacks localized BuffEffect operation and type labels", () => {
        const fixture = targetingFixtures.telekinesisChoose;
        const action: ActionInfo = {
            ...fixture.action,
            effects: [{
                type: "buff",
                target: "ko",
                operation: "remove",
                buff: { id: "subspaceClutter", modifiers: { defense: -2 } },
            }],
        };
        const html = renderToString(() => createComponent(TargetingPanel, { ...fixture, action }));

        expect(html).toContain('class="kcq-preview-effect__tag kcq-buff-effect__tag"');
        expect(html).toContain('aria-label="Remove Debuff"');
        expect(html).toContain("<span>Remove</span><span>Debuff</span>");
    });

    it("allows the selected command name to wrap to two lines without displacing tags", () => {
        const fixture = targetingFixtures.telekinesisChoose;
        const action: ActionInfo = {
            ...fixture.action,
            move: { ...fixture.action.move, id: "obey" },
        };
        const html = renderToString(() => createComponent(TargetingPanel, { ...fixture, action }));
        const css = readFileSync(resolve("src/ui/web/app/app.css"), "utf8");
        const headingRule = css.match(/\.kcq-selected-command h2\s*\{([^}]*)\}/)?.[1] ?? "";
        const tagsRule = css.match(/\.kcq-selected-command__tags\s*\{([^}]*)\}/)?.[1] ?? "";

        expect(html).toContain("[Power of Compulsion: Obey]");
        expect(headingRule).toContain("white-space: normal");
        expect(headingRule).toContain("-webkit-line-clamp: 2");
        expect(headingRule).not.toContain("text-overflow: ellipsis");
        expect(tagsRule).toContain("flex-wrap: wrap");
        expect(tagsRule).toContain("min-width: 0");
    });
});
