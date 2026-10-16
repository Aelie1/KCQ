import type { Buff, Character, Enemy, EntityId, ModifierId } from "../../../../engine/public/types";
import type { GameLogPresentationEntry } from "../../../presentation/gameLog";
import type { Presentation } from "../../../presentation/presentation";
import type { EnemyCardData } from "../components/componentTypes";
import { createIntentViewModel } from "./intentRow";
import type { EffectContext } from "./effectPreviews";
import { createIntentPreviewRows } from "./intentPreview";
import { playerTone, projectLinkedPlayers } from "./linkedEntities";
import { formatSignedNumber } from "./presentationHelpers";

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
    enemies: readonly Enemy[] = [enemy],
    previewContext: Pick<EffectContext, "state" | "thresholds"> = {},
): EnemyCardData {
    const partyIds = new Set(characters.map(({ id }) => id));
    const enemyIds = new Set(enemies.map(({ id }) => id));
    const intentions = enemy.intentions.map((intention) => {
        const model = createIntentViewModel(intention, presentation);
        const targetIds = new Set(intention.targets.map(({ target }) => target));
        const targetsFullParty = partyIds.size > 0
            && targetIds.size === partyIds.size
            && [...partyIds].every((id) => targetIds.has(id));

        return {
            ...model,
            ...(targetsFullParty ? {
                allTargetsLabel: presentation.ui("intentions.all"),
                targetLabel: presentation.ui("intentions.all"),
                targets: undefined,
            } : {}),
            // Only the wide card reads detailed previews; other layouts keep their summary cost.
            get previewRows() {
                return createIntentPreviewRows(intention, presentation, enemy.id, previewContext);
            },
        };
    });
    const summary = summarizeIntentions(intentions);

    return {
        id: enemy.id,
        name: presentation.entity(enemy.id),
        currentHp: enemy.currHp,
        maxHp: enemy.maxHp,
        linkedEntities: projectLinkedPlayers(enemy.buffs, characters, presentation),
        permanentEffects: enemy.buffs.flatMap(buff => {
            if (buff.duration !== undefined || !buff.icon) return [];
            const modifiers = (Object.entries(buff.modifiers ?? {}) as [ModifierId, number][])
                .map(([modifier, value]) => presentation.ui("characterDetails.effectModifier", {
                    modifier: presentation.modifier(modifier), value: formatSignedNumber(value),
                }));
            return [{
                id: buff.id, icon: buff.icon,
                // The compact bonus is hit; all authored modifiers remain in the tooltip and Details.
                valueLabel: buff.modifiers?.hit === undefined ? undefined : formatSignedNumber(buff.modifiers.hit),
                accessibleLabel: [presentation.buff(buff.id, buff.severity), ...modifiers].join(": "),
            }];
        }),
        effectDurations: enemy.buffs.flatMap(buff => {
            const duration = buff.duration;
            if (duration === undefined || !Number.isInteger(duration) || duration <= 0) return [];
            const source = effectSource(enemy.id, buff, history);
            const tone = source === undefined ? "neutral"
                : partyIds.has(source) ? playerTone(source)
                : enemyIds.has(source) ? "enemy" : "neutral";
            return [{
                id: buff.id, duration, tone, icon: buff.icon,
                accessibleLabel: (source === undefined ? "" : presentation.entity(source) + ": ")
                    + presentation.buff(buff.id, buff.severity)
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
function effectSource(target: EntityId, buff: Buff, history: readonly GameLogPresentationEntry[]): EntityId | undefined {
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
