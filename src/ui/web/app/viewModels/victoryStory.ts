import type { GameState } from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";

export interface VictoryStoryViewModel {
    outcome: "victory" | "defeat";
    heading: string;
    encounter: string;
    narrative: string;
    continueLabel: string;
}

export function createVictoryStoryViewModel(
    state: GameState, presentation: Presentation,
): VictoryStoryViewModel | undefined {
    const outcome = state.turn.outcome;

    if (outcome === "ongoing" || !state.encounter) return undefined;

    const narrative = presentation.referenceText(
        "encounter", state.encounter.id, outcome
    );

    if (!narrative) return undefined;

    return {
        outcome,
        heading: presentation.battleState(outcome),
        encounter: presentation.encounter(state.encounter.id),
        narrative,
        continueLabel: presentation.ui("victoryStory.continue"),
    };
}
