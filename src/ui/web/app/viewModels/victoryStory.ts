import type { GameState } from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";

export interface VictoryStoryViewModel {
    heading: string;
    encounter: string;
    narrative: string;
    continueLabel: string;
}

export function createVictoryStoryViewModel(
    state: GameState, presentation: Presentation,
): VictoryStoryViewModel | undefined {
    if (state.turn.outcome !== "victory" || !state.encounter) return undefined;
    const narrative = presentation.referenceText("encounter", state.encounter.id, "victory");
    if (!narrative) return undefined;
    return {
        heading: presentation.battleState("victory"),
        encounter: presentation.encounter(state.encounter.id),
        narrative,
        continueLabel: presentation.ui("victoryStory.continue"),
    };
}
