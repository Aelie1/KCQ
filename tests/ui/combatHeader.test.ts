import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { CombatHeader } from "../../src/ui/web/app/components/CombatHeader";

describe("combat header", () => {
    const withoutHydrationMarkers = (html: string): string => html.replace(/<!--[^>]*-->/g, "");

    it("renders overview-only difficulty, trap, and settings metadata", () => {
        const html = withoutHydrationMarkers(renderToString(() => createComponent(CombatHeader, {
            variant: "overview",
            encounterLabel: "Skunk Queen's Rematch",
            difficultyLabel: "Veteran",
            roundLabel: "Round 1",
            phaseLabel: "Player Phase",
            settingsLabel: "Settings",
            trap: {
                amount: 100,
                fillPercent: 100,
                label: "Latex Puddle",
                max: 100,
                valueLabel: "100/100",
            },
        })));

        expect(html).toContain("kcq-combat-header--overview");
        expect(html).toContain("kcq-combat-header__difficulty\">Veteran");
        expect(html).toContain("kcq-combat-header__trap-meter");
        expect(html).toContain("kcq-combat-header__settings");
    });

    it("renders a mode-first subscreen breadcrumb without overview controls", () => {
        const html = withoutHydrationMarkers(renderToString(() => createComponent(CombatHeader, {
            variant: "subscreen",
            encounterLabel: "A Very Long Encounter Name That Must Truncate Cleanly",
            contextLabel: "Targeting",
            characterLabel: "Ko-chan",
            roundLabel: "Round 1",
            phaseLabel: "Player Phase",
            backLabel: "Go Back",
        })));

        expect(html).toContain("kcq-combat-header--subscreen");
        expect(html).toContain("Targeting / Ko-chan");
        expect(html).toContain("A Very Long Encounter Name That Must Truncate Cleanly");
        expect(html).not.toContain("kcq-combat-header__difficulty");
        expect(html).not.toContain("kcq-combat-header__settings");
        expect(html).not.toContain("kcq-combat-header__trap");

        const css = readFileSync(resolve("src/ui/web/app/app.css"), "utf8");
        const sharedTextRule = css.match(/\.kcq-combat-header__title,\s*\.kcq-combat-header__breadcrumb,\s*\.kcq-combat-header__metadata p\s*\{([^}]*)\}/)?.[1] ?? "";
        const titleRule = css.match(/\.kcq-combat-header__title\s*\{([^}]*)\}/)?.[1] ?? "";
        expect(sharedTextRule).toContain("text-overflow: ellipsis");
        expect(titleRule).toContain("font-weight: 700");
    });

    it("does not invent a character suffix for Game Log", () => {
        const html = withoutHydrationMarkers(renderToString(() => createComponent(CombatHeader, {
            variant: "subscreen",
            encounterLabel: "Fight with Skunks",
            contextLabel: "Game Log",
            roundLabel: "Round 4",
            phaseLabel: "Player Phase",
            backLabel: "Go Back",
        })));

        expect(html).toContain("kcq-combat-header__breadcrumb\">Game Log");
        expect(html).not.toContain("Game Log /");
    });
});
