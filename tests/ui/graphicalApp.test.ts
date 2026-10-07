import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it, vi } from "vitest";
import { englishStrings } from "../../localization/en";
import { createEngine } from "../../src/engine/public/engine";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createBattle } from "../../src/ui/web/app";
import { GraphicalApp } from "../../src/ui/web/app/GraphicalApp";
import type { GraphicalRoute } from "../../src/ui/web/app/entry";

const presentation = new Presentation(englishStrings);

describe("outer graphical application", () => {
    it.each([
        [{ screen: "picker" }, "kcq-encounter-picker"],
        [{ screen: "details", encounter: "forest_3" }, "kcq-encounter-details"],
        [{ screen: "error" }, "kcq-entry-error"],
    ] as const)("renders initial %o without loading a battle", (initialRoute, className) => {
        const engine = createEngine();
        const prepareBattle = vi.fn(() => ({ engine, dispose: () => {} }));
        const html = renderToString(() => createComponent(GraphicalApp, { engine, presentation, initialRoute, prepareBattle }));
        expect(html).toContain(className);
        expect(prepareBattle).not.toHaveBeenCalled();
        expect(engine.getGameState().characters).toEqual([]);
        expect(html).not.toContain("href=");
    });

    it("prepares a deep-linked battle once and renders the existing BattleApp", () => {
        const engine = createEngine();
        const initialRoute: GraphicalRoute = { screen: "battle", encounter: "plains_2", difficulty: "veteran" };
        const prepareBattle = vi.fn((encounter, difficulty) => {
            createBattle(engine, encounter, difficulty);
            return { engine, dispose: () => {} };
        });
        const html = renderToString(() => createComponent(GraphicalApp, { engine, presentation, initialRoute, prepareBattle }));
        expect(prepareBattle).toHaveBeenCalledExactlyOnceWith("plains_2", "veteran");
        expect(html).toContain("kcq-battle-overview");
        expect(html).toContain(presentation.encounter("plains_2"));
        expect(engine.getGameState().difficulty.id).toBe("veteran");
    });
});
