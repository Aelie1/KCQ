import { createRoot } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { createStockEngine } from "../../src/stock";
import type { DifficultyId } from "../../src/engine/public/types";
import { createGraphicalController } from "../../src/ui/web/app/graphicalController";
import { createBattle, DEFAULT_DIFFICULTY } from "../../src/ui/web/app";

const difficultyIds: DifficultyId[] = ["casual", "standard", "veteran", "extreme", "mythic"];

function sessionFactory() {
    const session = { engine: createStockEngine(), dispose: vi.fn() };
    return { session, prepare: vi.fn(() => session) };
}

describe("outer graphical controller", () => {
    it("starts at title, selects a campaign without a battle, and clears selection on return", () => createRoot(dispose => {
        const { prepare } = sessionFactory();
        const controller = createGraphicalController(prepare);
        expect(controller.screen()).toEqual({ screen: "title" });
        controller.selectEncounter("outside");
        controller.startEncounter();
        expect(controller.screen()).toEqual({ screen: "title" });
        controller.selectCampaign("skunk");
        expect(controller.screen()).toEqual({ screen: "picker", campaign: "skunk" });
        expect(controller.party()).toEqual(["ko", "matsuko", "hinari"]);
        controller.returnToTitle();
        expect(controller.screen()).toEqual({ screen: "title" });
        expect(prepare).not.toHaveBeenCalled();
        dispose();
    }));

    it("blocks incomplete parties and preserves the chosen order through navigation and retry", () => createRoot(dispose => {
        const { prepare } = sessionFactory();
        const controller = createGraphicalController(prepare);
        controller.selectCampaign("skunk");
        controller.changeParty();
        controller.toggleCharacter("ko");
        expect(controller.canConfirmParty()).toBe(false);
        controller.confirmParty();
        expect(controller.screen().screen).toBe("party");
        expect(prepare).not.toHaveBeenCalled();
        controller.toggleCharacter("unknown" as "ko");
        expect(controller.draftParty()).toEqual(["matsuko", "hinari"]);
        expect(controller.party()).toEqual(["ko", "matsuko", "hinari"]);
        controller.toggleCharacter("ko");
        const selected = ["matsuko", "hinari", "ko"];
        expect(controller.canConfirmParty()).toBe(true);
        controller.confirmParty();
        controller.toggleCharacter("ko");
        expect(controller.party()).toEqual(selected);
        controller.changeParty();
        expect(controller.screen().screen).toBe("party");
        expect(controller.party()).toEqual(selected);
        controller.confirmParty();
        controller.selectEncounter("outside");
        controller.backToPicker();
        controller.selectEncounter("plains_1");
        controller.chooseDifficulty();
        controller.backToDetails();
        controller.chooseDifficulty();
        controller.selectDifficulty("mythic");
        controller.startEncounter();
        controller.changeParty();
        expect(controller.screen().screen).toBe("battle");
        controller.retryEncounter();
        expect(prepare).toHaveBeenNthCalledWith(1, "skunk", "plains_1", "mythic", selected);
        expect(prepare).toHaveBeenNthCalledWith(2, "skunk", "plains_1", "mythic", selected);
        controller.returnToLevelSelect();
        expect(controller.party()).toEqual(selected);
        controller.returnToTitle();
        controller.selectCampaign("skunk");
        expect(controller.party()).toEqual(selected);
        controller.dispose();
        dispose();
    }));

    it("switches picker to details and back without preparing a battle", () => createRoot((dispose) => {
        const { prepare } = sessionFactory();
        const controller = createGraphicalController(prepare);
        controller.selectCampaign("skunk"); controller.confirmParty();
        expect(controller.screen()).toEqual({ screen: "picker", campaign: "skunk" });
        controller.selectEncounter("forest_3");
        expect(controller.screen()).toEqual({ screen: "details", campaign: "skunk", encounter: "forest_3" });
        controller.backToPicker();
        expect(controller.screen()).toEqual({ screen: "picker", campaign: "skunk" });
        controller.selectEncounter("tower_2");
        expect(controller.screen()).toEqual({ screen: "details", campaign: "skunk", encounter: "tower_2" });
        expect(prepare).not.toHaveBeenCalled();
        dispose();
    }));

    it("defaults to Standard, remembers explicit selections and returns to the same Details", () => createRoot((dispose) => {
        const { prepare } = sessionFactory();
        const controller = createGraphicalController(prepare);
        controller.selectCampaign("skunk"); controller.confirmParty();
        controller.selectEncounter("forest_3");
        controller.chooseDifficulty();
        expect(DEFAULT_DIFFICULTY).toBe("standard");
        expect(controller.screen()).toEqual({ screen: "difficulty", campaign: "skunk", encounter: "forest_3", difficulty: DEFAULT_DIFFICULTY });
        controller.selectDifficulty("mythic");
        controller.backToDetails();
        expect(controller.screen()).toEqual({ screen: "details", campaign: "skunk", encounter: "forest_3" });
        controller.chooseDifficulty();
        expect(controller.screen()).toEqual({ screen: "difficulty", campaign: "skunk", encounter: "forest_3", difficulty: "mythic" });
        controller.backToDetails();
        controller.backToPicker();
        controller.selectEncounter("plains_1");
        controller.chooseDifficulty();
        expect(controller.screen()).toEqual({ screen: "difficulty", campaign: "skunk", encounter: "plains_1", difficulty: "mythic" });
        expect(prepare).not.toHaveBeenCalled();
        dispose();
    }));

    it("selects every difficulty without preparing or modifying the engine", () => createRoot((dispose) => {
        const { prepare, session } = sessionFactory();
        const setDifficulty = vi.spyOn(session.engine, "setDifficulty");
        const loadEncounter = vi.spyOn(session.engine, "loadEncounter");
        const controller = createGraphicalController(prepare);
        controller.selectCampaign("skunk"); controller.confirmParty();
        controller.selectEncounter("outside");
        controller.chooseDifficulty();
        for (const difficulty of difficultyIds) {
            controller.selectDifficulty(difficulty);
            expect(controller.screen()).toEqual({ screen: "difficulty", campaign: "skunk", encounter: "outside", difficulty });
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
        controller.selectCampaign("skunk"); controller.confirmParty();
        controller.selectEncounter("outside");
        controller.chooseDifficulty();
        controller.selectDifficulty(difficulty);
        controller.startEncounter();
        expect(prepare).toHaveBeenCalledExactlyOnceWith("skunk", "outside", difficulty, ["ko", "matsuko", "hinari"]);
        const battle = controller.screen();
        expect(battle).toEqual({ screen: "battle", campaign: "skunk", encounter: "outside", difficulty, session });
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
        const prepare = vi.fn((campaign, encounter, difficulty) => {
            const engine = createStockEngine(12345);
            createBattle(engine, encounter, difficulty);
            return { engine, dispose: vi.fn() };
        });
        const controller = createGraphicalController(prepare);
        controller.selectCampaign("skunk"); controller.confirmParty();
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
        expect(prepare).toHaveBeenNthCalledWith(2, "skunk", "forest_3", "mythic", ["ko", "matsuko", "hinari"]);
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
        expect(controller.screen()).toEqual({ screen: "picker", campaign: "skunk" });
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
        controller.selectCampaign("skunk"); controller.confirmParty();
        controller.startEncounter();
        controller.retryEncounter();
        controller.returnToLevelSelect();
        controller.chooseDifficulty();
        controller.selectDifficulty("mythic");
        controller.backToDetails();
        controller.backToPicker();
        expect(controller.screen()).toEqual({ screen: "picker", campaign: "skunk" });
        controller.selectEncounter("plains_1");
        controller.startEncounter();
        controller.selectDifficulty("mythic");
        controller.backToDetails();
        expect(controller.screen()).toEqual({ screen: "details", campaign: "skunk", encounter: "plains_1" });
        controller.chooseDifficulty();
        controller.backToPicker();
        controller.selectEncounter("outside");
        expect(controller.screen()).toEqual({ screen: "difficulty", campaign: "skunk", encounter: "plains_1", difficulty: DEFAULT_DIFFICULTY });
        controller.dispose();
        expect(prepare).not.toHaveBeenCalled();
        expect(session.dispose).not.toHaveBeenCalled();
        dispose();
    }));
});
