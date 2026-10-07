import { createRoot } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { createEngine } from "../../src/engine/public/engine";
import type { DifficultyId } from "../../src/engine/public/types";
import { createGraphicalController } from "../../src/ui/web/app/graphicalController";
import { createBattle, DEFAULT_DIFFICULTY } from "../../src/ui/web/app";

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

    it.each(["ongoing", "victory", "defeat"] as const)("retries a %s with a fresh session and returns to level select", outcome => createRoot(dispose => {
        const prepare = vi.fn((encounter, difficulty) => {
            const engine = createEngine(12345);
            createBattle(engine, encounter, difficulty);
            return { engine, dispose: vi.fn() };
        });
        const controller = createGraphicalController(prepare);
        controller.selectEncounter("forest_3");
        controller.chooseDifficulty();
        controller.selectDifficulty("mythic");
        controller.startEncounter();
        expect(prepare).toHaveBeenCalledTimes(1);
        const first = prepare.mock.results[0].value;
        const completed = first.engine.getGameState();
        completed.turn.outcome = outcome;
        vi.spyOn(first.engine, "getGameState").mockReturnValue(completed);
        controller.retryEncounter();
        expect(first.dispose).toHaveBeenCalledOnce();
        expect(prepare).toHaveBeenNthCalledWith(2, "forest_3", "mythic");
        const current = controller.screen();
        expect(current.screen).toBe("battle");
        if (current.screen !== "battle") throw new Error("Expected battle");
        expect(current.session.engine).not.toBe(first.engine);
        expect(current.session.engine.getGameState().turn.outcome).toBe("ongoing");
        expect(current.session.engine.getGameState().turn.round).toBe(1);
        expect(current.session.engine.getGameState().characters).toHaveLength(3);
        const terminal = current.session.engine.getGameState();
        terminal.turn.outcome = outcome;
        vi.spyOn(current.session.engine, "getGameState").mockReturnValue(terminal);
        controller.returnToLevelSelect();
        expect(controller.screen()).toEqual({ screen: "picker" });
        expect(current.session.dispose).toHaveBeenCalledOnce();
        controller.retryEncounter();
        controller.dispose();
        expect(prepare).toHaveBeenCalledTimes(2);
        expect(first.dispose).toHaveBeenCalledOnce();
        expect(current.session.dispose).toHaveBeenCalledOnce();
        dispose();
    }));

    it("ignores actions outside their screens and safely disposes before a battle", () => createRoot((dispose) => {
        const { prepare, session } = sessionFactory();
        const controller = createGraphicalController(prepare);
        controller.startEncounter();
        controller.retryEncounter();
        controller.returnToLevelSelect();
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
