import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { escapeFixtures } from "../../src/ui/web/app/fixtures/escape";
import { beginEscapeExecution, EscapePanel } from "../../src/ui/web/app/panels/EscapePanel";
import { escapeChoiceId } from "../../src/ui/web/app/viewModels/escape";

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
        expect(html).toContain('<h2 class="kcq-player-identity--ko">Ko-chan</h2>');
        expect(html).toContain('<h2 class="kcq-player-identity--matsuko">Matsuko</h2>');
        expect(html).toContain('<h2 class="kcq-player-identity--hinari">Hinari</h2>');
        expect(countClass(html, "is-selected")).toBe(0);
        expect(executeButton).toContain("disabled");

        const css = readFileSync(resolve("src/ui/web/app/app.css"), "utf8");
        const choiceRule = css.match(/\.kcq-escape-choice\s*\{([^}]*)\}/)?.[1] ?? "";
        const displayOnlyRule = css.match(/\.kcq-escape-choice\.is-display-only\s*\{([^}]*)\}/)?.[1] ?? "";
        expect(css).not.toMatch(/\.kcq-escape-group\.is-selected\s*\{/);
        expect(choiceRule).toContain("border: 1px solid var(--kcq-structure-border)");
        expect(displayOnlyRule).toContain("background: var(--kcq-surface-card)");
        expect(displayOnlyRule).toContain("color: var(--kcq-text-dim)");
    });

    it("renders the selected assist, spread preview, and enabled execute control", () => {
        const html = renderToString(() => createComponent(
            EscapePanel,
            escapeFixtures.selectedAssist,
        ));
        const executeButton = html.match(/<button[^>]*class="kcq-escape__execute"[^>]*>/)?.[0];

        expect(countClass(html, "is-selected")).toBe(1);
        expect(countClass(html, "is-increase")).toBe(1);
        expect(html).toContain("Spread");
        expect(html).toContain("Assist Hinari's Skunk Legs");
        expect(executeButton).toBeDefined();
        expect(executeButton).not.toContain("disabled");
    });

    it("clears selection as execution begins so a retained bonus-Escape screen starts clean", () => {
        const fixture = escapeFixtures.selectedAssist;
        const escapes = fixture.actions.find(({ id }) => id === fixture.actorId)?.escapes ?? [];
        const selectedIndex = escapes.findIndex(({ target, binding }) =>
            target === fixture.initialSelectedEscape.target
            && binding === fixture.initialSelectedEscape.binding);
        const selectedId = escapeChoiceId(escapes[selectedIndex], selectedIndex);

        const transition = beginEscapeExecution(selectedId, escapes);

        expect(transition.escape).toMatchObject(fixture.initialSelectedEscape);
        expect(transition.selectedEscapeId).toBeUndefined();
    });
});
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
