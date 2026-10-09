import type { Effect, EntityId } from "../../../../engine/public/types";
import { createEffectPreviews, type EffectContext, type EffectPreviewViewModel } from "./effectPreviews";

export interface EffectGroupViewModel {
    effects: readonly EffectPreviewViewModel[]; id: EntityId; name: string;
}

/** Groups recipients in first-occurrence order; each group retains source effect order. */
export function groupEffectPreviews(
    effects: readonly Effect[], context: Omit<EffectContext, "scopeTarget">,
    idPrefix = "effect", shouldGroup: (target: EntityId) => boolean = () => true,
): { groups: EffectGroupViewModel[]; ungrouped: EffectPreviewViewModel[] } {
    const groups: EffectGroupViewModel[] = [];
    const groupsById = new Map<EntityId, EffectPreviewViewModel[]>();
    const ungrouped: EffectPreviewViewModel[] = [];
    effects.forEach((effect, index) => {
        const id = `${idPrefix}-${index}`;
        // A projected spawn names a definition, not an existing recipient.
        const target = "target" in effect && !(effect.type === "enemy" && effect.operation === "spawn")
            ? effect.target : undefined;
        if (target === undefined || !shouldGroup(target)) {
            ungrouped.push(...createEffectPreviews(effect, id, context));
            return;
        }
        let group = groupsById.get(target);
        if (!group) {
            group = [];
            groupsById.set(target, group);
            groups.push({ id: target, name: context.presentation.entity(target), effects: group });
        }
        group.push(...createEffectPreviews(effect, id, { ...context, scopeTarget: target }));
    });
    return { groups, ungrouped };
}
