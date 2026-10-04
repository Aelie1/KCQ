import type {
    ActionView,
    GameState,
    ThresholdInfo,
    Trap,
} from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import type { EnemyCardData, PartyCardData } from "../components/componentTypes";
import { createEnemyCardViewModel } from "./enemyCard";
import { createPartyCardViewModel } from "./partyCard";

export const BATTLE_OVERVIEW_TRAP_MAX = 100;

export interface BattleOverviewTrapViewModel {
    amount: number;
    fillPercent: number;
    id: Trap["id"];
    label: string;
    max: number;
    valueLabel: string;
}

export interface BattleOverviewHeaderViewModel {
    encounterLabel: string;
    phaseLabel: string;
    roundLabel: string;
    trap?: BattleOverviewTrapViewModel;
    traps: readonly BattleOverviewTrapViewModel[];
}

export interface BattleOverviewViewModel {
    controls: {
        endTurnLabel: string;
        gameLogLabel: string;
        settingsLabel: string;
    };
    enemies: readonly EnemyCardData[];
    enemiesCountLabel: string;
    enemiesHeading: string;
    header: BattleOverviewHeaderViewModel;
    party: readonly PartyCardData[];
    partyCountLabel: string;
    partyHeading: string;
}

export function createBattleOverviewViewModel(
    state: GameState,
    actions: readonly ActionView[],
    thresholds: ThresholdInfo,
    presentation: Presentation,
): BattleOverviewViewModel {
    const actionsById = new Map(actions.map((action) => [action.id, action]));
    const traps = state.traps.map((trap) => createTrapViewModel(trap, presentation));
    const party = state.characters.map((character) => {
        const action = actionsById.get(character.id);
        if (!action) {
            throw new Error(`Missing ActionView for character ${character.id}.`);
        }

        return createPartyCardViewModel(character, action, thresholds, presentation);
    });
    const activePartyCount = party.filter(({ actionState }) =>
        actionState.kind !== "incapacitated").length;

    return {
        header: {
            encounterLabel: state.encounter
                ? presentation.encounter(state.encounter.id)
                : presentation.ui("battleOverview.noEncounter"),
            roundLabel: presentation.ui("battleOverview.round", {
                round: state.turn.round,
            }),
            phaseLabel: presentation.ui("battleOverview.phase", {
                phase: presentation.phase(state.turn.phase),
            }),
            traps,
            ...(traps[0]
                ? { trap: traps[0] }
                : {}),
        },
        enemies: state.enemies.map((enemy) =>
            createEnemyCardViewModel(enemy, presentation)),
        enemiesHeading: presentation.ui("battleOverview.enemies"),
        enemiesCountLabel: presentation.ui("battleOverview.enemiesRemaining", {
            count: state.enemies.length,
        }),
        party,
        partyHeading: presentation.ui("battleOverview.party"),
        partyCountLabel: presentation.ui("battleOverview.partyCount", {
            active: activePartyCount,
            total: party.length,
        }),
        controls: {
            settingsLabel: presentation.ui("battleOverview.settings"),
            gameLogLabel: presentation.ui("battleOverview.gameLog"),
            endTurnLabel: presentation.ui("battleOverview.endTurn"),
        },
    };
}

function createTrapViewModel(
    trap: Trap,
    presentation: Presentation,
): BattleOverviewTrapViewModel {
    return {
        id: trap.id,
        label: presentation.trap(trap.id),
        amount: trap.amount,
        max: BATTLE_OVERVIEW_TRAP_MAX,
        fillPercent: Math.min(100, Math.max(0,
            (trap.amount * 100) / BATTLE_OVERVIEW_TRAP_MAX)),
        valueLabel: `${trap.amount}/${BATTLE_OVERVIEW_TRAP_MAX}`,
    };
}
