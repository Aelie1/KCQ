import type { ActionView, EntityId, GameState, ModifierId, ThresholdInfo } from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import { createEffectDetail, createModifierMeterViewModel } from "./characterDetails";
import { createCombatHeaderViewModel } from "./combatHeader";
import { groupEffectPreviews } from "./effectGroups";
import { createIntentViewModel } from "./intentRow";
import { createTargetPreviewViewModel } from "./targeting";

export function createEnemyDetailsViewModel(
    state: GameState,
    actions: readonly ActionView[],
    enemyId: EntityId,
    thresholds: ThresholdInfo,
    presentation: Presentation,
) {
    const enemy = state.enemies.find(({ id }) => id === enemyId);
    if (!enemy) throw new Error(`Missing Enemy for details ${enemyId}.`);
    const identity = createTargetPreviewViewModel(state, actions,
        { valid: true, target: enemy.id, effects: [] }, 0, presentation, thresholds);
    const context = { actions, state, presentation, thresholds, actor: enemy.id };
    // Calculated totals must come from the engine, never be reconstructed from buffs.
    const modifiers = enemy.modifiers;

    return {
        header: createCombatHeaderViewModel(state, presentation),
        identity: {
            ...identity,
            health: identity.health ? {
                ...identity.health,
                currentLabel: `${enemy.currHp} / ${enemy.maxHp}`,
            } : undefined,
        },
        initial: identity.name.trim().charAt(0).toLocaleUpperCase(),
        modifiers: (Object.entries(modifiers) as [ModifierId, number][])
            .filter(([, value]) => value !== 0)
            .map(([id, value]) => createModifierMeterViewModel(id, value, presentation)),
        effects: enemy.buffs.map(buff => createEffectDetail(buff, state, presentation)),
        intentions: enemy.intentions.map((intention, intentionIndex) => {
            const summary = createIntentViewModel(intention, presentation);
            const grouped = groupEffectPreviews([
                ...intention.targets.flatMap(target => target.effects), ...intention.effects,
            ], context, `intent-${intentionIndex}`);
            const effectsByRecipient = new Map(grouped.groups.map(group => [group.id, group.effects]));
            const targetIds = new Set(intention.targets.map(target => target.target));
            return {
                name: summary.moveLabel,
                targets: intention.targets.map((target, index) => ({
                    preview: {
                        ...createTargetPreviewViewModel(state, actions,
                            { valid: true, target: target.target, effects: [] }, index, presentation, thresholds),
                        effects: effectsByRecipient.get(target.target) ?? [],
                    },
                    ...(target.band !== "none" ? { outcome: {
                        band: target.band,
                        label: presentation.hitBand(target.band),
                    } } : {}),
                })),
                effectTargets: grouped.groups.filter(group => !targetIds.has(group.id)).map((group, index) => ({
                    ...createTargetPreviewViewModel(state, actions,
                        { valid: true, target: group.id, effects: [] }, index, presentation, thresholds),
                    effects: group.effects,
                })),
                effects: grouped.ungrouped,
            };
        }),
        labels: {
            context: presentation.ui("enemyDetails.title"),
            status: presentation.ui("enemyDetails.statusHeading"),
            effects: presentation.ui("enemyDetails.effectsHeading"),
            intentions: presentation.ui("enemyDetails.intentionsHeading"),
            noIntentions: presentation.ui("enemyDetails.noIntentions"),
            back: presentation.ui("characterDetails.back"),
        },
    };
}
