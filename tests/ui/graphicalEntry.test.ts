import { describe, expect, it } from "vitest";
import { createEngine } from "../../src/engine/public/engine";
import { createBattle, DEFAULT_DIFFICULTY, ENCOUNTER_DIFFICULTIES } from "../../src/ui/web/app";
import { encounterStartRoute, graphicalRouteSearch, selectGraphicalRoute } from "../../src/ui/web/app/entry";

const library = createEngine().getLibrary();
const select = (search: string) => selectGraphicalRoute(new URLSearchParams(search), library);

describe("graphical entry", () => {
    it("opens the picker with no encounter and the briefing with an encounter alone", () => {
        expect(select("")).toEqual({ screen: "picker" });
        expect(select("?encounter=forest_3")).toEqual({ screen: "details", encounter: "forest_3" });
    });

    it.each(ENCOUNTER_DIFFICULTIES)("preserves valid direct battle links for $id", ({ id }) => {
        expect(select(`?encounter=tower_1&difficulty=${id}`)).toEqual({ screen: "battle", encounter: "tower_1", difficulty: id });
    });

    it.each(["?encounter=missing", "?encounter=plains_1&difficulty=missing", "?encounter=plains_1&difficulty="])("rejects invalid supplied link values: %s", (search) => {
        expect(select(search)).toEqual({ screen: "error" });
    });

    it("round trips selection and Start to the intended encounter at default Standard difficulty", () => {
        const details = select(graphicalRouteSearch({ screen: "details", encounter: "outside" }));
        expect(details).toEqual({ screen: "details", encounter: "outside" });
        if (details.screen !== "details") throw new Error("Expected details");
        const start = encounterStartRoute(details.encounter);
        expect(start.difficulty).toBe(DEFAULT_DIFFICULTY);
        expect(start.difficulty).toBe("standard");
        expect(select(graphicalRouteSearch(start))).toEqual(start);
        const engine = createEngine();
        const battle = createBattle(engine, start.encounter, start.difficulty);
        expect(battle.encounterId).toBe("outside");
        expect(engine.getGameState().difficulty.id).toBe("standard");
        expect(battle.loadEvents.some((event) => event.type === "loadEncounter" && event.id === "outside" && event.success)).toBe(true);
    });
});
