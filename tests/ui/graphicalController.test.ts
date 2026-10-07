import { createRoot } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { createEngine } from "../../src/engine/public/engine";
import { createGraphicalController } from "../../src/ui/web/app/graphicalController";
import { selectGraphicalRoute } from "../../src/ui/web/app/entry";

function sessionFactory() {
    const session = { engine: createEngine(), dispose: vi.fn() };
    return { session, prepare: vi.fn(() => session) };
}

describe("outer graphical controller", () => {
    it("switches picker to details and back without preparing a battle", () => createRoot((dispose) => {
        const { prepare } = sessionFactory();
        const controller = createGraphicalController({ screen: "picker" }, prepare);
        controller.selectEncounter("forest_3");
        expect(controller.screen()).toEqual({ screen: "details", encounter: "forest_3" });
        controller.backToPicker();
        expect(controller.screen()).toEqual({ screen: "picker" });
        controller.selectEncounter("tower_2");
        expect(controller.screen()).toEqual({ screen: "details", encounter: "tower_2" });
        expect(prepare).not.toHaveBeenCalled();
        dispose();
    }));

    it("starts the selected encounter once at Standard and delegates battle navigation", () => createRoot((dispose) => {
        const { prepare, session } = sessionFactory();
        const controller = createGraphicalController({ screen: "picker" }, prepare);
        controller.selectEncounter("outside");
        controller.startEncounter();
        expect(prepare).toHaveBeenCalledExactlyOnceWith("outside", "standard");
        const battle = controller.screen();
        expect(battle).toEqual({ screen: "battle", encounter: "outside", difficulty: "standard", session });
        controller.startEncounter();
        controller.selectEncounter("plains_1");
        controller.backToPicker();
        expect(controller.screen()).toBe(battle);
        expect(prepare).toHaveBeenCalledTimes(1);
        controller.dispose();
        controller.dispose();
        expect(session.dispose).toHaveBeenCalledTimes(1);
        dispose();
    }));

    it("initializes a direct battle link with its supplied difficulty", () => createRoot((dispose) => {
        const { prepare, session } = sessionFactory();
        const route = selectGraphicalRoute(new URLSearchParams("?encounter=tower_1&difficulty=mythic"), session.engine.getLibrary());
        const controller = createGraphicalController(route, prepare);
        expect(prepare).toHaveBeenCalledExactlyOnceWith("tower_1", "mythic");
        expect(controller.screen()).toMatchObject({ screen: "battle", encounter: "tower_1", difficulty: "mythic" });
        controller.dispose();
        dispose();
    }));

    it("initializes details from a deep link and returns to the list in app", () => createRoot((dispose) => {
        const { prepare } = sessionFactory();
        const controller = createGraphicalController({ screen: "details", encounter: "forest_1" }, prepare);
        expect(controller.screen()).toEqual({ screen: "details", encounter: "forest_1" });
        controller.backToPicker();
        expect(controller.screen()).toEqual({ screen: "picker" });
        expect(prepare).not.toHaveBeenCalled();
        dispose();
    }));

    it("returns from an invalid initial link to the picker without starting a battle", () => createRoot((dispose) => {
        const { prepare } = sessionFactory();
        const controller = createGraphicalController({ screen: "error" }, prepare);
        controller.backToPicker();
        expect(controller.screen()).toEqual({ screen: "picker" });
        controller.dispose();
        expect(prepare).not.toHaveBeenCalled();
        dispose();
    }));
});
