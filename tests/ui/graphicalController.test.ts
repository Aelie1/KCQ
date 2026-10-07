import { createRoot } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { createEngine } from "../../src/engine/public/engine";
import { createGraphicalController } from "../../src/ui/web/app/graphicalController";
import { DEFAULT_DIFFICULTY } from "../../src/ui/web/app";

function sessionFactory() {
    const session = { engine: createEngine(), dispose: vi.fn() };
    return { session, prepare: vi.fn(() => session) };
}

describe("outer graphical controller", () => {
    it("switches picker to details and back without preparing a battle", () => createRoot((dispose) => {
        const { prepare } = sessionFactory();
        const controller = createGraphicalController(prepare);
        expect(controller.screen()).toEqual({ screen: "picker" });
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
        const controller = createGraphicalController(prepare);
        controller.selectEncounter("outside");
        controller.startEncounter();
        expect(prepare).toHaveBeenCalledExactlyOnceWith("outside", DEFAULT_DIFFICULTY);
        const battle = controller.screen();
        expect(battle).toEqual({ screen: "battle", encounter: "outside", difficulty: DEFAULT_DIFFICULTY, session });
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

    it("ignores Start at the picker and safely disposes without an active battle", () => createRoot((dispose) => {
        const { prepare, session } = sessionFactory();
        const controller = createGraphicalController(prepare);
        controller.startEncounter();
        controller.backToPicker();
        controller.dispose();
        expect(controller.screen()).toEqual({ screen: "picker" });
        expect(prepare).not.toHaveBeenCalled();
        expect(session.dispose).not.toHaveBeenCalled();
        dispose();
    }));
});
