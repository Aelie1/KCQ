import type { Effect, EntityId } from "../../../../engine/public/types";
import { createEffectPreviews, type EffectContext, type EffectPreviewViewModel } from "./effectPreviews";

export interface EffectGroupViewModel {
    effects: readonly EffectPreviewViewModel[]; id: EntityId; name: string;
}

/** Groups recipients in first-occurrence order; each group retains source effect order. */
export function groupEffectPreviews(
    effects: readonly Effect[], context: Omit<EffectContext, "scopeTarget"> & { actor?: EntityId },
    idPrefix = "effect", shouldGroup: (target: EntityId) => boolean = () => true,
): { groups: EffectGroupViewModel[]; ungrouped: EffectPreviewViewModel[] } {
    const groups: EffectGroupViewModel[] = [];
    const groupsById = new Map<EntityId, EffectPreviewViewModel[]>();
    const ungrouped: EffectPreviewViewModel[] = [];
    effects.forEach((effect, index) => {
        const id = `${idPrefix}-${index}`;
        // A projected spawn names a definition, not an existing recipient.
        // Follow-up moves belong to the actor, even when nested in target effects.
        const target = "target" in effect && !(effect.type === "enemy" && effect.operation === "spawn")
            ? effect.target : effect.type === "move" ? context.actor : undefined;
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

/** Static reference rows use the same first-recipient ordering as encounter setup. */
export function groupReferenceRecipients<T extends { recipient: string }>(rows: readonly T[], force = false): {
    groups: { id: string; effects: T[] }[]; ungrouped: T[];
} {
    const recipients = new Set(rows.map(row => row.recipient).filter(Boolean));
    if (!force && recipients.size <= 1) return { groups: [], ungrouped: [...rows] };
    const groups: { id: string; effects: T[] }[] = [];
    const ungrouped: T[] = [];
    for (const row of rows) {
        if (!row.recipient) { ungrouped.push(row); continue; }
        let group = groups.find(group => group.id === row.recipient);
        if (!group) { group = { id: row.recipient, effects: [] }; groups.push(group); }
        group.effects.push(row);
    }
    return { groups, ungrouped };
}
