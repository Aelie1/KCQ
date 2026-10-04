import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { characterDetailsFixture } from "../../src/ui/web/app/fixtures/characterDetails";
import { CharacterDetailsPanel } from "../../src/ui/web/app/panels/CharacterDetailsPanel";

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
});
