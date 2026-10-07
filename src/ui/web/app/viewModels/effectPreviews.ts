import type { ActionView, BindingLevel, BuffEffect, Effect, EntityId, GameState, HitBand, ModifierId, ThresholdInfo } from "../../../../engine/public/types";
import { getBindingProgress } from "../../../../engine/public/mechanics";
import type { Presentation } from "../../../presentation/presentation";
import { bindingLevelAtValue, formatSignedNumber, isHarmfulModifierChange } from "./presentationHelpers";

export type EffectTone = "danger" | "primary" | "special" | "success" | "warning";

export interface DamageBandViewModel {
    band: Exclude<HitBand, "none">; chance: number; chanceLabel: string; emphasized: boolean;
    label: string; max: number; min: number; rangeLabel: string; zero: boolean;
}
export interface DamageProfileViewModel {
    bands: readonly DamageBandViewModel[]; kind: "damage-profile"; label: string; tone: "danger";
}
export interface AccuracyBandViewModel {
    band: Exclude<HitBand, "none">; chance: number; chanceLabel: string; label: string; zero: boolean;
}
export interface AccuracyProfileViewModel {
    bands: readonly AccuracyBandViewModel[]; kind: "accuracy-profile"; label: string; tone: "primary"; type: "accuracy";
}
export interface CompactEffectViewModel {
    details: readonly string[]; id: string; kind: "compact"; label: string; payload: string;
    tone: EffectTone; type: Effect["type"] | "accuracy";
}
export interface BuffModifierViewModel {
    direction: "left" | "right"; harmful: boolean; label: string; signedValue: string; value: number;
}
export interface BuffEffectViewModel {
    details: readonly string[]; durationLabel?: string; id: string; kind: "buff"; label: string;
    modifiers: readonly BuffModifierViewModel[]; moveList: readonly string[]; name: string;
    operation: BuffEffect["operation"]; recipient?: string; tone: "special" | "success"; type: "buff";
}
export interface BindingEffectViewModel {
    bindingName: string; change: number; currentLevel: BindingLevel; currentLevelLabel: string; currentValue: number;
    id: string; kind: "binding"; label: string;
    max: number; projectedLevel: BindingLevel; projectedValue: number;
    projectedLevelLabel?: string; recipient?: string; tone: "binding"; type: "binding";
}
export type EffectPreviewViewModel = AccuracyProfileViewModel | BindingEffectViewModel | BuffEffectViewModel | CompactEffectViewModel | DamageProfileViewModel;

/** Runtime context is optional: public library effects need no fabricated battle state. */
export interface EffectContext {
    actions?: readonly ActionView[];
    presentation: Presentation;
    scopeTarget?: EntityId;
    state?: GameState;
    thresholds?: ThresholdInfo;
}

export function createEffectPreviewViewModels(
    effects: readonly Effect[], context: EffectContext, idPrefix = "effect",
): EffectPreviewViewModel[] {
    return effects.flatMap((effect, index) => createEffectPreviews(effect, `${idPrefix}-${index}`, context));
}

export function createEffectPreviews(effect: Effect, id: string, context: EffectContext): EffectPreviewViewModel[] {
    if (effect.type !== "intention" || effect.operation !== "cancel") {
        return [createEffectPreview(effect, id, context)];
    }

    const enemy = context.state?.enemies.find(({ id: enemyId }) => enemyId === effect.target);
    const boss = enemy?.rank === "boss";
    const label = context.presentation.ui(boss ? "targeting.effectWeaken" : "targeting.effectCancel");
    const percentage = context.presentation.ui("targeting.percentage", {
        value: effect.amount * 100,
    });
    const intentions = enemy?.intentions ?? [];

    if (intentions.length === 0) {
        return [compactEffect(
            id,
            effect.type,
            "primary",
            label,
            boss ? percentage : "",
            recipientDetails(effect.target, context),
        )];
    }

    return intentions.map((intention, index) => compactEffect(
        `${id}-intention-${index}`,
        effect.type,
        "primary",
        label,
        boss
            ? `${context.presentation.move(intention.move)} ${percentage}`
            : context.presentation.move(intention.move),
        recipientDetails(effect.target, context),
    ));
}

function createEffectPreview(effect: Effect, id: string, context: EffectContext): EffectPreviewViewModel {
    const { presentation } = context;
    switch (effect.type) {
        case "damage":
            return compactEffect(id, effect.type, "danger", presentation.ui("targeting.effectDamage"),
                presentation.ui("targeting.damageAmount", { amount: effect.amount }), recipientDetails(effect.target, context));
        case "binding": return createBindingEffect(effect, id, context);
        case "buff": return createBuffEffect(effect, id, context);
        case "enemy":
            return compactEffect(id, effect.type, effect.operation === "defeat" ? "danger" : "primary",
                presentation.ui(effect.operation === "defeat" ? "targeting.operationDefeat" : "targeting.operationSpawn"),
                context.scopeTarget === effect.target ? "" : presentation.entity(effect.target), []);
        case "trap":
            return compactEffect(id, effect.type, "warning", presentation.ui("targeting.effectTrap"), presentation.trap(effect.trap),
                [presentation.ui("targeting.trapAmount", { amount: effect.amount })]);
        case "move":
            return compactEffect(id, effect.type, "primary", presentation.ui("targeting.effectMove"), presentation.move(effect.move), []);
        case "data": {
            const resource = effect.name === "subspace";
            const name = context.scopeTarget === effect.target
                ? presentation.data(effect.name)
                : `${presentation.entity(effect.target)}   ${presentation.data(effect.name)}`;
            return compactEffect(id, effect.type, "primary",
                presentation.ui(resource ? "targeting.effectResource" : "targeting.effectData"),
                presentation.ui("targeting.dataAmount", {
                    name, amount: formatSignedNumber(effect.amount),
                }), []);
        }
        case "intention":
            return compactEffect(id, effect.type, "primary",
                presentation.ui(effect.operation === "cancel" ? "targeting.effectCancel" : "targeting.effectRetarget"),
                effect.operation === "cancel" ? effect.amount.toString() : presentation.entity(effect.destination),
                recipientDetails(effect.target, context));
        case "refresh":
            return compactEffect(id, effect.type, "primary", presentation.ui("targeting.effectRefresh"),
                context.scopeTarget === effect.target ? "" : presentation.entity(effect.target), []);
    }
}

function createBuffEffect(effect: BuffEffect, id: string, context: EffectContext): BuffEffectViewModel {
    const { presentation } = context;
    const modifierEntries = Object.entries(effect.buff.modifiers ?? {}) as [ModifierId, number][];
    const classifications = modifierEntries.map(([modifier, value]) => isHarmfulModifierChange(modifier, value));
    const debuff = (effect.buff.statuses?.length ?? 0) > 0 || (classifications.length > 0 && classifications.every((value) => value === true));
    const operationKey = effect.operation === "add"
        ? (debuff ? "targeting.effectAddDebuff" : "targeting.effectAddBuff")
        : (debuff ? "targeting.effectRemoveDebuff" : "targeting.effectRemoveBuff");
    const applying = effect.operation === "add";
    const currentMoves = new Set(context.actions
        ?.find(({ id: targetId }) => targetId === effect.target)
        ?.moves.map(({ move }) => move.id) ?? []);
    return {
        kind: "buff", id, type: "buff", tone: applying === debuff ? "special" : "success", operation: effect.operation,
        label: presentation.ui(operationKey), name: presentation.buff(effect.buff.id),
        ...(applying && effect.buff.duration !== undefined
            ? { durationLabel: presentation.ui("characterDetails.rounds", { count: effect.buff.duration }) }
            : {}),
        modifiers: applying ? modifierEntries.slice(0, 2).map(([modifier, value]) => ({
            label: presentation.modifier(modifier, "compact"), value, signedValue: formatSignedNumber(value),
            harmful: isHarmfulModifierChange(modifier, value) === true,
            direction: value >= 0 ? "left" : "right",
        })) : [],
        moveList: applying ? [
            ...(effect.buff.moveList?.addedMoves ?? []).map((move) => presentation.ui("targeting.addMove", { move: presentation.move(move) })),
            ...(effect.buff.moveList?.blockedMoves ?? [])
                .filter((move) => context.actions === undefined || currentMoves.has(move))
                .map((move) => presentation.ui("targeting.blockMove", { move: presentation.move(move) })),
        ] : [],
        details: applying ? [
            ...(effect.buff.statuses ?? []).map((status) => status.value > 1
                ? presentation.ui("characterDetails.statusValue", { status: presentation.status(status.id), value: status.value })
                : presentation.status(status.id)),
            ...(effect.buff.linkedEntity ? [presentation.entity(effect.buff.linkedEntity)] : []),
        ] : [],
        ...(context.scopeTarget !== effect.target ? { recipient: presentation.entity(effect.target) } : {}),
    };
}

function createBindingEffect(
    effect: Extract<Effect, { type: "binding" }>, id: string, context: EffectContext,
): EffectPreviewViewModel {
    const target = context.state?.characters.find(({ id: targetId }) => targetId === effect.target);
    if (!target || effect.amount === undefined || !context.thresholds) {
        return compactEffect(id, "binding", "special", context.presentation.ui("targeting.effectBinding"),
            context.presentation.binding(effect.binding), [
            ...recipientDetails(effect.target, context),
            ...(effect.amount === undefined ? [] : [context.presentation.ui("targeting.bindingAmount", {
                amount: formatSignedNumber(effect.amount),
            })]),
        ]);
    }
    const currentValue = target.bindings.find(({ id: binding }) => binding === effect.binding)?.value ?? 0;
    const change = effect.amount > 0
        ? getBindingProgress(currentValue, effect.amount)
        : Math.max(-currentValue, effect.amount);
    const projectedValue = currentValue + change;
    const currentLevel = bindingLevelAtValue(currentValue, context.thresholds);
    const projectedLevel = bindingLevelAtValue(projectedValue, context.thresholds);
    return {
        kind: "binding", id, type: "binding", tone: "binding",
        label: context.presentation.ui("targeting.effectBinding"),
        bindingName: context.presentation.binding(effect.binding), currentValue, change, projectedValue,
        max: context.thresholds.max,
        currentLevel,
        currentLevelLabel: context.presentation.bindingLevel(currentLevel),
        projectedLevel,
        ...(currentLevel !== projectedLevel ? {
            projectedLevelLabel: context.presentation.bindingLevel(projectedLevel),
        } : {}),
        ...(context.scopeTarget !== effect.target ? { recipient: context.presentation.entity(effect.target) } : {}),
    };
}

function recipientDetails(target: EntityId, context: EffectContext): string[] {
    return context.scopeTarget === target ? [] : [context.presentation.entity(target)];
}
function compactEffect(
    id: string, type: CompactEffectViewModel["type"], tone: EffectTone, label: string,
    payload: string, details: readonly string[],
): CompactEffectViewModel {
    return { kind: "compact", id, type, tone, label, payload, details };
}
