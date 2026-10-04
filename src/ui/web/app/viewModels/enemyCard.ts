import type { Character, Enemy } from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import type { EnemyCardData } from "../components/componentTypes";
import { createIntentViewModel } from "./intentRow";
import { projectLinkedPlayers } from "./linkedEntities";

export const ENEMY_CARD_VISIBLE_INTENTIONS = 2;

export interface IntentionSummary<T> {
    overflowCount: number;
    visibleIntentions: readonly T[];
}

export function summarizeIntentions<T>(intentions: readonly T[]): IntentionSummary<T> {
    return {
        visibleIntentions: intentions.slice(0, ENEMY_CARD_VISIBLE_INTENTIONS),
        overflowCount: Math.max(0, intentions.length - ENEMY_CARD_VISIBLE_INTENTIONS),
    };
}

export function createEnemyCardViewModel(
    enemy: Enemy,
    presentation: Presentation,
    characters: readonly Character[] = [],
): EnemyCardData {
    const partyIds = new Set(characters.map(({ id }) => id));
    const intentions = enemy.intentions.map((intention) => {
        const model = createIntentViewModel(intention, presentation);
        const targetIds = new Set(intention.targets.map(({ target }) => target));
        const targetsFullParty = partyIds.size > 0
            && targetIds.size === partyIds.size
            && [...partyIds].every((id) => targetIds.has(id));

        return targetsFullParty
            ? {
                ...model,
                allTargetsLabel: presentation.ui("intentions.all"),
                targetLabel: presentation.ui("intentions.all"),
                targets: undefined,
            }
            : model;
    });
    const summary = summarizeIntentions(intentions);

    return {
        id: enemy.id,
        name: presentation.entity(enemy.id),
        currentHp: enemy.currHp,
        maxHp: enemy.maxHp,
        linkedEntities: projectLinkedPlayers(enemy.buffs, characters, presentation),
        intentions,
        ...summary,
        ...(summary.overflowCount > 0 ? {
            overflowLabel: presentation.ui("intentions.more", { count: summary.overflowCount }),
            overflowAriaLabel: presentation.ui("intentions.moreAccessible", {
                count: summary.overflowCount,
            }),
        } : {}),
    };
}
