import type { Effect, EntityId, HitBand, Intention } from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import type { IntentRowData } from "../components/componentTypes";
import { effectRecipient } from "./effectGroups";
import { createEffectPreviews, type EffectContext } from "./effectPreviews";
import { playerTone } from "./linkedEntities";
import { formatSignedNumber } from "./presentationHelpers";

/** Uses public previews and shared presentation projections; never resolves combat. */
export function createIntentPreviewRows(
    intention: Intention, presentation: Presentation, actor: EntityId,
    context: Pick<EffectContext, "state" | "thresholds"> = {},
): IntentRowData[] {
    const row = (target: EntityId | undefined, effects: readonly Effect[], band?: HitBand): IntentRowData => ({
        moveLabel: presentation.move(intention.move),
        resolved: intention.resolved,
        ...(target === undefined ? {} : {
            targetLabel: presentation.entity(target),
            targets: [{ id: target, label: presentation.entity(target), tone: playerTone(target) }],
        }),
        ...(band && band !== "none" ? { outcome: band, outcomeLabel: presentation.hitBand(band) } : {}),
        consequences: effects.flatMap(effect => summarizeEffect(effect, target, presentation, context)),
    });
    const rowsForEffects = (effects: readonly Effect[], target?: EntityId, band?: HitBand): IntentRowData[] => {
        const groups = new Map<EntityId | undefined, Effect[]>();
        if (target !== undefined) groups.set(target, []);
        for (const effect of effects) {
            const recipient = effectRecipient(effect, actor) ?? target;
            const group = groups.get(recipient) ?? [];
            group.push(effect);
            groups.set(recipient, group);
        }
        return [...groups].map(([recipient, effects]) => row(recipient, effects, recipient === target ? band : undefined));
    };
    // Keep separate TargetInfo entries, including repeated attacks on the same entity.
    const rows = intention.targets.flatMap(target => {
        const targetBuffIds = new Set(
            target.effects
                .filter(effect => effect.type === "buff")
                .filter(effect => effect.operation === "add" && effect.target === target.target)
                .map(effect => effect.buff.id)
        );

        const effects = target.effects.filter(effect =>
            !(effect.type === "buff" &&
                effect.operation === "add" &&
                effect.target === actor &&
                target.target !== actor &&
                targetBuffIds.has(effect.buff.id))
        );

        return rowsForEffects(effects, target.target, target.band);
    });
    rows.push(...rowsForEffects(intention.effects));
    if (rows.length === 0) rows.push(row(undefined, []));
    if (intention.targets.length === 0 && intention.band) {
        rows[0] = { ...rows[0]!, outcome: intention.band, outcomeLabel: presentation.hitBand(intention.band) };
    }
    return rows;
}

function summarizeEffect(
    effect: Effect, target: EntityId | undefined, presentation: Presentation,
    context: Pick<EffectContext, "state" | "thresholds">,
): string[] {
    // Public damage previews encode healing as a negative amount.
    if (effect.type === "damage" && effect.amount < 0) {
        return [presentation.ui("targeting.effectHealing") + " " + formatSignedNumber(-effect.amount)];
    }
    const bindingName = effect.type === "binding" ? presentation.binding(effect.binding, "short") : undefined;
    return createEffectPreviews(effect, "intent", {
        ...context, presentation, scopeTarget: target, completeModifiers: true,
    }).map(preview => {
        if (preview.kind === "buff") {
            return [preview.label, preview.name, preview.recipient,].filter(Boolean).join(" · ");
        }
        if (preview.kind === "compact") {
            const needsLabel = preview.type !== "binding" && preview.type !== "damage" && preview.type !== "data";
            return [needsLabel ? preview.label : undefined, bindingName ?? preview.payload, ...preview.details].filter(Boolean).join(" ");
        }
        if (preview.kind === "binding") {
            const name = bindingName ?? preview.bindingName;
            return preview.mode === "amount"
                ? name + " " + preview.amountLabel
                : name + " " + formatSignedNumber(preview.change);
        }
        if (preview.kind === "resource") return preview.resourceName + " " + formatSignedNumber(preview.change);
        if (preview.kind === "trap") return preview.trapName + " " + formatSignedNumber(preview.change);
        return preview.label;
    });
}
