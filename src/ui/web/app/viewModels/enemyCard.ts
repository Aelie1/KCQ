import type { Buff, Character, Enemy, EntityId } from "../../../../engine/public/types";
import type { GameLogPresentationEntry } from "../../../presentation/gameLog";
import type { Presentation } from "../../../presentation/presentation";
import type { EnemyCardData } from "../components/componentTypes";
import { createIntentViewModel } from "./intentRow";
import { playerTone, projectLinkedPlayers } from "./linkedEntities";
import { isDebuff } from "./presentationHelpers";

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
    history: readonly GameLogPresentationEntry[] = [],
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
        debuffDurations: enemy.buffs.flatMap(buff => {
            const duration = buff.duration;
            if (duration === undefined || !Number.isInteger(duration) || duration <= 0 || !isDebuff(buff)) return [];
            const source = debuffSource(enemy.id, buff, history);
            if (source === undefined || !partyIds.has(source)) return [];
            const tone = playerTone(source);
            if (tone === "neutral") return [];
            return [{
                duration, tone,
                accessibleLabel: presentation.entity(source) + ": " + presentation.buff(buff.id, buff.severity)
                    + " (" + presentation.ui("characterDetails.rounds", { count: duration }) + ")",
            }];
        }),
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

/** Public Buff has no source. Use recorded application actors, never buff names or
 * linkedEntity (which can identify a victim rather than the effect's applier).
 * A later removal or mutation without a move actor invalidates earlier ownership. */
function debuffSource(target: EntityId, buff: Buff, history: readonly GameLogPresentationEntry[]): EntityId | undefined {
    for (let index = history.length - 1; index >= 0; index--) {
        const entry = history[index]!;
        for (const outcome of [...entry.outcomes].reverse()) {
            if (outcome.kind !== "buff" || outcome.buff !== buff.id) continue;
            const participant = outcome.participants.find(participant => participant.target === target);
            if (!participant) continue;
            return participant.final.present && entry.kind === "move" ? entry.actor : undefined;
        }
    }
    return undefined;
}
