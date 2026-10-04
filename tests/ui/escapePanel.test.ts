import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { escapeFixtures } from "../../src/ui/web/app/fixtures/escape";
import { EscapePanel } from "../../src/ui/web/app/panels/EscapePanel";

function countClass(html: string, className: string): number {
    return [...html.matchAll(/class="([^"]*)"/g)]
        .filter((match) => match[1].split(/\s+/).includes(className))
        .length;
}

describe("escape workflow composition", () => {
    it("renders each shared character-details section once and replaces commands", () => {
        const html = renderToString(() => createComponent(
            EscapePanel,
            escapeFixtures.unselected,
        ));
        const executeButton = html.match(/<button[^>]*class="kcq-escape__execute"[^>]*>/)?.[0];

        expect(countClass(html, "kcq-character-details__header")).toBe(1);
        expect(countClass(html, "kcq-character-roster")).toBe(1);
        expect(countClass(html, "kcq-focused-character")).toBe(1);
        expect(countClass(html, "kcq-character-capabilities")).toBe(1);
        expect(countClass(html, "kcq-character-bindings")).toBe(1);
        expect(countClass(html, "kcq-character-effects")).toBe(1);
        expect(countClass(html, "kcq-character-commands")).toBe(0);
        expect(countClass(html, "kcq-escape")).toBe(1);
        expect(countClass(html, "kcq-escape-group")).toBe(3);
        expect(executeButton).toContain("disabled");
    });

    it("renders the selected assist, spread preview, and enabled execute control", () => {
        const html = renderToString(() => createComponent(
            EscapePanel,
            escapeFixtures.selectedAssist,
        ));
        const executeButton = html.match(/<button[^>]*class="kcq-escape__execute"[^>]*>/)?.[0];

        expect(countClass(html, "is-selected")).toBe(2);
        expect(countClass(html, "is-increase")).toBe(1);
        expect(html).toContain("Spread");
        expect(html).toContain("Assist Hinari's Skunk Legs");
        expect(executeButton).toBeDefined();
        expect(executeButton).not.toContain("disabled");
    });
});
