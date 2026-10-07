import { createRoot } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { createEngine } from "../../src/engine/public/engine";
import type { DifficultyId } from "../../src/engine/public/types";
import { createGraphicalController } from "../../src/ui/web/app/graphicalController";
import { DEFAULT_DIFFICULTY } from "../../src/ui/web/app";

const difficultyIds: DifficultyId[] = ["casual", "standard", "veteran", "extreme", "mythic"];

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

    it("enters Difficulty at Standard every time and returns to the same Details", () => createRoot((dispose) => {
        const { prepare } = sessionFactory();
        const controller = createGraphicalController(prepare);
        controller.selectEncounter("forest_3");
        controller.chooseDifficulty();
        expect(DEFAULT_DIFFICULTY).toBe("standard");
        expect(controller.screen()).toEqual({ screen: "difficulty", encounter: "forest_3", difficulty: DEFAULT_DIFFICULTY });
        controller.selectDifficulty("mythic");
        controller.backToDetails();
        expect(controller.screen()).toEqual({ screen: "details", encounter: "forest_3" });
        controller.chooseDifficulty();
        expect(controller.screen()).toEqual({ screen: "difficulty", encounter: "forest_3", difficulty: DEFAULT_DIFFICULTY });
        controller.backToDetails();
        controller.backToPicker();
        controller.selectEncounter("plains_1");
        controller.chooseDifficulty();
        expect(controller.screen()).toEqual({ screen: "difficulty", encounter: "plains_1", difficulty: DEFAULT_DIFFICULTY });
        expect(prepare).not.toHaveBeenCalled();
        dispose();
    }));

    it("selects every difficulty without preparing or modifying the engine", () => createRoot((dispose) => {
        const { prepare, session } = sessionFactory();
        const setDifficulty = vi.spyOn(session.engine, "setDifficulty");
        const loadEncounter = vi.spyOn(session.engine, "loadEncounter");
        const controller = createGraphicalController(prepare);
        controller.selectEncounter("outside");
        controller.chooseDifficulty();
        for (const difficulty of difficultyIds) {
            controller.selectDifficulty(difficulty);
            expect(controller.screen()).toEqual({ screen: "difficulty", encounter: "outside", difficulty });
        }
        expect(prepare).not.toHaveBeenCalled();
        expect(setDifficulty).not.toHaveBeenCalled();
        expect(loadEncounter).not.toHaveBeenCalled();
        expect(session.engine.getGameState().characters).toEqual([]);
        dispose();
    }));

    it.each(difficultyIds)("starts the selected encounter once at %s and preserves disposal", (difficulty) => createRoot((dispose) => {
        const { prepare, session } = sessionFactory();
        const controller = createGraphicalController(prepare);
        controller.selectEncounter("outside");
        controller.chooseDifficulty();
        controller.selectDifficulty(difficulty);
        controller.startEncounter();
        expect(prepare).toHaveBeenCalledExactlyOnceWith("outside", difficulty);
        const battle = controller.screen();
        expect(battle).toEqual({ screen: "battle", encounter: "outside", difficulty, session });
        controller.startEncounter();
        controller.selectEncounter("plains_1");
        controller.backToPicker();
        controller.backToDetails();
        controller.chooseDifficulty();
        controller.selectDifficulty("standard");
        expect(controller.screen()).toBe(battle);
        expect(prepare).toHaveBeenCalledTimes(1);
        controller.dispose();
        controller.dispose();
        expect(session.dispose).toHaveBeenCalledTimes(1);
        dispose();
    }));

    it("ignores actions outside their screens and safely disposes before a battle", () => createRoot((dispose) => {
        const { prepare, session } = sessionFactory();
        const controller = createGraphicalController(prepare);
        controller.startEncounter();
        controller.chooseDifficulty();
        controller.selectDifficulty("mythic");
        controller.backToDetails();
        controller.backToPicker();
        expect(controller.screen()).toEqual({ screen: "picker" });
        controller.selectEncounter("plains_1");
        controller.startEncounter();
        controller.selectDifficulty("mythic");
        controller.backToDetails();
        expect(controller.screen()).toEqual({ screen: "details", encounter: "plains_1" });
        controller.chooseDifficulty();
        controller.backToPicker();
        controller.selectEncounter("outside");
        expect(controller.screen()).toEqual({ screen: "difficulty", encounter: "plains_1", difficulty: DEFAULT_DIFFICULTY });
        controller.dispose();
        expect(prepare).not.toHaveBeenCalled();
        expect(session.dispose).not.toHaveBeenCalled();
        dispose();
    }));
});
