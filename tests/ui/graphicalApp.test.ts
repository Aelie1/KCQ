import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { stockStrings } from "../helpers/stockStrings";
import { createStockEngine } from "../../src/stock";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createBattle } from "../../src/ui/web/app";
import * as controllers from "../../src/ui/web/app/graphicalController";
import { GraphicalApp, type GraphicalAppProps } from "../../src/ui/web/app/GraphicalApp";

const presentation = new Presentation(stockStrings);

afterEach(() => vi.restoreAllMocks());

describe("outer graphical application", () => {
    it("starts at the Encounter Picker without preparing a battle", () => {
        const engine = createStockEngine();
        const prepareBattle = vi.fn(() => ({ engine, dispose: () => {} }));
        const html = renderToString(() => createComponent(GraphicalApp, { engine, presentation, prepareBattle }));
        expect(html).toContain("kcq-encounter-picker");
        expect(prepareBattle).not.toHaveBeenCalled();
        expect(engine.getGameState().characters).toEqual([]);
        expect(html).not.toContain("href=");
        expect(html).not.toContain("kcq-entry-error");
        expect(html).not.toMatch(/class="[^"]*\bkcq-battle-overview\b(?:\s|")/);
    });

    it("renders Details, Difficulty and Battle from the controller's in-app transitions", () => {
        const engine = createStockEngine();
        const prepareBattle = vi.fn((encounter, difficulty) => {
            createBattle(engine, encounter, difficulty);
            return { engine, dispose: vi.fn() };
        });
        const controller = controllers.createGraphicalController(prepareBattle);
        // SSR renders one screen at a time; reuse the real controller to inspect transitions.
        vi.spyOn(controllers, "createGraphicalController").mockReturnValue(controller);
        const renderScreen = () => renderToString(() => createComponent(GraphicalApp, { engine, presentation, prepareBattle }));
        controller.selectEncounter("forest_3");
        expect(renderScreen()).toContain("kcq-encounter-details");
        expect(prepareBattle).not.toHaveBeenCalled();
        controller.backToPicker();
        expect(renderScreen()).toContain("kcq-encounter-picker");
        controller.selectEncounter("plains_2");
        controller.chooseDifficulty();
        expect(renderScreen()).toContain("kcq-difficulty-select");
        expect(renderScreen()).toContain("Standard");
        controller.selectDifficulty("mythic");
        expect(renderScreen()).toContain(presentation.difficulty("mythic", "desc"));
        expect(prepareBattle).not.toHaveBeenCalled();
        expect(engine.getGameState().characters).toEqual([]);
        controller.startEncounter();
        const battleHtml = renderScreen();
        expect(battleHtml).toMatch(/class="[^"]*\bkcq-battle-overview\b[^"]*"/);
        expect(battleHtml).toContain(presentation.encounter("plains_2"));
        expect(prepareBattle).toHaveBeenCalledExactlyOnceWith("plains_2", "mythic");
        expect(engine.getGameState().difficulty.id).toBe("mythic");
        controller.dispose();
        expect(prepareBattle.mock.results[0].value.dispose).toHaveBeenCalledOnce();
    });

    it("accepts battle preparation without an initial route", () => {
        expectTypeOf<GraphicalAppProps>().toEqualTypeOf<{
            engine: GraphicalAppProps["engine"];
            presentation: GraphicalAppProps["presentation"];
            prepareBattle: GraphicalAppProps["prepareBattle"];
            languages?: GraphicalAppProps["languages"];
        }>();
    });
});
