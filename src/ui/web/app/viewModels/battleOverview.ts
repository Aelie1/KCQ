import type { ContentLibrary } from "../../../../engine/public/library";
import type {
    ActionView,
    BindingId,
    Enemy,
    GameState,
    Status,
    ThresholdInfo,
    Trap,
} from "../../../../engine/public/types";
import type { GameLogPresentationEntry } from "../../../presentation/gameLog";
import type { Presentation } from "../../../presentation/presentation";
import type { EnemyCardData, PartyCardData } from "../components/componentTypes";
import { createCombatHeaderViewModel } from "./combatHeader";
import { createEnemyCardViewModel } from "./enemyCard";
import { createPartyCardViewModel } from "./partyCard";

import { TRAP_METER_MAX } from "./meterValues";

export const BATTLE_OVERVIEW_TRAP_MAX = TRAP_METER_MAX;

export interface BattleOverviewTrapViewModel {
    amount: number;
    fillPercent: number;
    id: Trap["id"];
    label: string;
    max: number;
    valueLabel: string;
}

export interface BattleOverviewHeaderViewModel {
    difficultyLabel: string;
    encounterLabel: string;
    phaseLabel: string;
    roundLabel: string;
    trap?: BattleOverviewTrapViewModel;
    traps: readonly BattleOverviewTrapViewModel[];
}

export interface BattleOverviewViewModel {
    controls: {
        endTurnLabel: string;
        endTurnDimmed: boolean;
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
    history: readonly GameLogPresentationEntry[] = [],
    library?: ContentLibrary,
): BattleOverviewViewModel {
    const actionsById = new Map(actions.map((action) => [action.id, action]));
    const traps = state.traps.map((trap) => createTrapViewModel(trap, presentation));
    const party = state.characters.map((character) => {
        const action = actionsById.get(character.id);
        if (!action) {
            throw new Error(`Missing ActionView for character ${character.id}.`);
        }
        const incomingBindings: Record<BindingId, number> = {};

        for (const enemy of state.enemies) {
            if (!canProjectAttack(enemy, library)) continue;
            for (const intention of enemy.intentions) {
                if (intention.resolved) continue;
                const target = intention.targets.find(target => target.target === character.id);
                if (target) {
                    for (const effect of target.effects) {
                        if (effect.type === "binding" && effect.target === character.id && effect.amount) {
                            incomingBindings[effect.binding] = (incomingBindings[effect.binding] ?? 0) + effect.amount;
                        }
                    }
                }
            }
        }

        return createPartyCardViewModel(
            character,
            action,
            thresholds,
            presentation,
            state.encounter?.bindings,
            incomingBindings,
        );
    });
    const activePartyCount = party.filter(({ actionState }) =>
        actionState.kind !== "incapacitated").length;

    return {
        header: {
            ...createCombatHeaderViewModel(state, presentation),
            traps,
            ...(traps[0]
                ? { trap: traps[0] }
                : {}),
        },
        enemies: state.enemies.map((enemy) =>
            createEnemyCardViewModel(enemy, presentation, state.characters, history, state.enemies)),
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
            endTurnDimmed: state.turn.phase === "player"
                && state.characters.some(({ id }) => actionsById.get(id)?.available),
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

/** Eligibility comes from public status metadata, not buff names or past events. */
function canProjectAttack(enemy: Enemy, library: ContentLibrary | undefined): boolean {
    if (enemy.currHp <= 0) return false;
    const passives = (library?.enemies[enemy.defId]?.passives ?? [])
        .flatMap(id => library?.passives[id] ? [library.passives[id]!] : []);
    const immunities = new Set(passives.flatMap(passive => passive.immunities ?? []));
    const statuses = new Map<Status["id"], number>();
    for (const buff of enemy.buffs) {
        for (const status of buff.statuses ?? []) {
            if (!immunities.has(status.id)) {
                statuses.set(status.id, Math.max(statuses.get(status.id) ?? 0, status.value));
            }
        }
    }
    const flags = [
        ...passives.flatMap(passive => passive.status?.flags ?? []),
        ...[...statuses].flatMap(([id, level]) => library?.statuses[id]?.modifiers[level]?.flags ?? []),
    ];
    return !flags.includes("blocksAttack") && !flags.includes("skipsTurn");
}
