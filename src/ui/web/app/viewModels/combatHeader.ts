import type { GameState } from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";

export interface CombatHeaderViewModel {
    difficultyLabel: string;
    encounterLabel: string;
    phaseLabel: string;
    roundLabel: string;
}

export function createCombatHeaderViewModel(
    state: GameState,
    presentation: Presentation,
): CombatHeaderViewModel {
    return {
        encounterLabel: state.encounter
            ? presentation.encounter(state.encounter.id)
            : presentation.ui("battleOverview.noEncounter"),
        difficultyLabel: presentation.difficulty(state.difficulty.id),
        roundLabel: presentation.ui("battleOverview.round", {
            round: state.turn.round,
        }),
        phaseLabel: presentation.ui("battleOverview.phase", {
            phase: presentation.phase(state.turn.phase),
        }),
    };
}
