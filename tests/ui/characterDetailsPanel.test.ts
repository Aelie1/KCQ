import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { characterDetailsFixture } from "../../src/ui/web/app/fixtures/characterDetails";
import { CharacterDetailsPanel } from "../../src/ui/web/app/panels/CharacterDetailsPanel";
import { ModifierMeter } from "../../src/ui/web/app/components/ModifierMeter";

describe("character details panel", () => {
    it("keeps an incapacitated roster character selectable for inspection", () => {
        const selected: string[] = [];
        const html = renderToString(() => createComponent(CharacterDetailsPanel, {
            ...characterDetailsFixture,
            onSelectCharacter: (id) => selected.push(id),
        }));
        const rosterButton = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)]
            .map(([button]) => button)
            .find((button) => button.includes("Matsuko"));

        expect(rosterButton).toBeDefined();
        expect(rosterButton).toContain("kcq-character-roster__card--disabled");
        expect(rosterButton).not.toMatch(/\sdisabled(?:[\s=>]|$)/);
        expect(selected).toEqual([]);
    });

    it("renders linked buffs with the shared chain-link component", () => {
        const html = renderToString(() => createComponent(CharacterDetailsPanel, characterDetailsFixture));

        expect(html).toContain("kcq-linked-entity-chip__icon");
        expect(html).toContain("Skunkette 1");
        expect(html).not.toContain("↗ Skunkette 1");
    });

    it("renders exactly eight fixed-geometry modifier pips", () => {
        const html = renderToString(() => createComponent(ModifierMeter, {
            metric: { blocked: false, label: "Defense", tone: "success", value: 3, valueLabel: "+3" },
        }));

        expect((html.match(/class="kcq-pip-meter__pip(?: |")/g) ?? []).length).toBe(8);
        expect(html).toContain("kcq-pip-meter");

        const css = readFileSync(resolve("src/ui/web/app/app.css"), "utf8");
        const meterRule = css.match(/\.kcq-pip-meter\s*\{([^}]*)\}/)?.[1] ?? "";
        const pipRule = css.match(/\.kcq-pip-meter__pip\s*\{([^}]*)\}/)?.[1] ?? "";
        expect(meterRule).toContain("grid-template-columns: repeat(8, 4px)");
        expect(meterRule).toContain("gap: 4px");
        expect(meterRule).toContain("width: 60px");
        expect(pipRule).toContain("width: 4px");
    });
});
