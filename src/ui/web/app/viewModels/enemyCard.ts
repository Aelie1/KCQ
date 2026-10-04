import type { Enemy } from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import type { EnemyCardData } from "../components/componentTypes";
import { createIntentViewModel } from "./intentRow";

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
): EnemyCardData {
    const intentions = enemy.intentions.map((intention) =>
        createIntentViewModel(intention, presentation));
    const summary = summarizeIntentions(intentions);

    return {
        id: enemy.id,
        name: presentation.entity(enemy.id),
        currentHp: enemy.currHp,
        maxHp: enemy.maxHp,
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
