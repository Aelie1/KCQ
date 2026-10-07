import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { englishStrings } from "../../localization/en/index";
import { createEngine } from "../../src/engine/public/engine";
import { createBattle } from "../../src/ui/web/app";
import { BattleApp } from "../../src/ui/web/app/BattleApp";
import { DevApp } from "../../src/ui/web/app/dev/DevApp";
import { Presentation } from "../../src/ui/presentation/presentation";

describe("playable Solid battle application", () => {
    it("renders its initial overview from an already prepared real Engine", () => {
        const engine = createEngine(12345);
        createBattle(engine, "plains_1", "standard");
        const presentation = new Presentation(englishStrings);

        const html = renderToString(() => createComponent(BattleApp, {
            engine,
            presentation,
        }));

        expect(html).toMatch(/class="[^"]*\bkcq-battle-overview\b[^"]*"/);
        expect(html).toContain(presentation.encounter("plains_1"));
        for (const character of engine.getGameState().characters) {
            expect(html).toContain(presentation.entity(character.id));
        }
    });

    it("keeps the static fixture panels renderable without callback props", () => {
        for (const initialPanel of ["battle", "character", "targeting", "escape", "log"] as const) {
            expect(() => renderToString(() => createComponent(DevApp, { initialPanel })))
                .not.toThrow();
        }
    });

    it("exposes the deterministic playable battle debug entry", () => {
        const html = renderToString(() => createComponent(DevApp, {
            initialPanel: "playable" as const,
        }));

        expect(html).toMatch(/class="[^"]*\bkcq-battle-overview\b[^"]*"/);
        expect(html).toContain(new Presentation(englishStrings).encounter("plains_1"));
    });
});
