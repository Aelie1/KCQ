import { describe, expect, it, vi } from "vitest";
import { Presentation } from "../../src/ui/presentation/presentation";
import { createVictoryStoryViewModel } from "../../src/ui/web/app/viewModels/victoryStory";
import { makePublicGameState } from "../helpers/publicTestData";
import { stockStrings } from "../helpers/stockStrings";
import { victoryNarrative, victoryStoryStrings } from "../helpers/victoryStory";

const victory = () => makePublicGameState({
    turn: { round: 2, step: 1, phase: "player", outcome: "victory" },
    encounter: { id: "plains_1", enemies: [], bindings: [], traps: [] },
});

describe("victory story view model", () => {
    it("uses optional encounter victory text and localized labels, preserving line breaks", () => {
        const presentation = new Presentation({ ...stockStrings, ...victoryStoryStrings,
            "battleState.victory.name": "Localized Victory",
            "encounter.plains_1.name": "Localized Encounter",
            "ui.victoryStory.continue": "Localized Continue",
        });
        const reference = vi.spyOn(presentation, "referenceText");
        expect(createVictoryStoryViewModel(victory(), presentation)).toEqual({
            heading: "Localized Victory", encounter: "Localized Encounter",
            narrative: victoryNarrative, continueLabel: "Localized Continue",
        });
        expect(reference).toHaveBeenCalledExactlyOnceWith("encounter", "plains_1", "victory");
    });

    it.each([undefined, "", " \n\t ", "...", "  ...\n"])("omits missing or incomplete text: %s", text => {
        const strings = { ...stockStrings };
        if (text !== undefined) strings["encounter.plains_1.victory"] = text;
        expect(createVictoryStoryViewModel(victory(), new Presentation(strings))).toBeUndefined();
    });

    it.each(["ongoing", "defeat"] as const)("does not look up stories for %s", outcome => {
        const state = victory();
        state.turn.outcome = outcome;
        const presentation = new Presentation({ ...stockStrings, ...victoryStoryStrings });
        const reference = vi.spyOn(presentation, "referenceText");
        expect(createVictoryStoryViewModel(state, presentation)).toBeUndefined();
        expect(reference).not.toHaveBeenCalled();
    });

    it("omits stories for a battle without an encounter", () => {
        const state = victory(); state.encounter = null;
        expect(createVictoryStoryViewModel(state, new Presentation(victoryStoryStrings))).toBeUndefined();
    });
});
