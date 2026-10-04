import type {
    AccuracyProfile, ActionInfo, ActionView, BandPreview, BuffEffect, Character, Effect,
    EntityId, GameState, HitBand, ModifierId, PreviewProfile, ThresholdInfo,
} from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import { createMoveTags, type CommandTagViewModel } from "./characterDetails";
import { createCharacterActionState, createCharacterStanceState } from "./characterState";
import { projectLinkedPlayers, type LinkedEntityViewModel } from "./linkedEntities";
import { bindingLevelAtValue, formatSignedNumber, isHarmfulModifierChange } from "./presentationHelpers";

export type TargetingMode = "predetermined" | "selectable";
export type EffectTone = "danger" | "primary" | "special" | "warning";

export interface DamageBandViewModel {
    band: Exclude<HitBand, "none">; chance: number; chanceLabel: string; emphasized: boolean;
    label: string; max: number; min: number; rangeLabel: string;
}
export interface DamageProfileViewModel {
    bands: readonly DamageBandViewModel[]; kind: "damage-profile"; label: string; tone: "danger";
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
    operation: BuffEffect["operation"]; recipient?: string; tone: "special"; type: "buff";
}
export interface BindingEffectViewModel {
    bindingName: string; currentPercent: number; currentValue: number; deltaLabel: string; id: string;
    kind: "binding"; label: string; level: ReturnType<typeof bindingLevelAtValue>; levelLabel: string;
    projectedPercent: number; projectedValue: number; recipient?: string; tone: "special"; type: "binding";
}
export type EffectPreviewViewModel = BindingEffectViewModel | BuffEffectViewModel | CompactEffectViewModel | DamageProfileViewModel;

export interface TargetPreviewViewModel {
    accuracy?: AccuracyProfile; characterSummary?: string; damage?: PreviewProfile;
    effects: readonly EffectPreviewViewModel[]; fillPercent?: number; id: string;
    linkedEntities: readonly LinkedEntityViewModel[]; maxValue?: number; name: string;
    reasonLabel?: string; target: EntityId | null; valid: boolean; value?: number; valueLabel?: string;
}
export interface TargetingViewModel {
    actionEffects: readonly EffectPreviewViewModel[]; actionEffectGroups: readonly ActionEffectGroupViewModel[];
    available: boolean; command: { id: string; name: string; tags: readonly CommandTagViewModel[] };
    controls: { backLabel: string; executeLabel: string }; heading?: string;
    labels: { actionEffects: string }; mode: TargetingMode; reasonLabel?: string;
    requiredTargetCount: number; targets: readonly TargetPreviewViewModel[];
}
export interface ActionEffectGroupViewModel {
    effects: readonly EffectPreviewViewModel[]; id: EntityId; name: string;
}
interface EffectContext {
    presentation: Presentation; scopeTarget?: EntityId; state: GameState; thresholds?: ThresholdInfo;
}

const DAMAGE_BANDS = ["miss", "graze", "hit", "crit"] as const;

export function createTargetingViewModel(
    state: GameState,
    actorId: EntityId,
    action: ActionInfo,
    presentation: Presentation,
    actions: readonly ActionView[] = [],
    thresholds?: ThresholdInfo,
): TargetingViewModel {
    const actor = state.characters.find(({ id }) => id === actorId);
    if (!actor) throw new Error(`Missing Character for targeting actor ${actorId}.`);

    const mode: TargetingMode = typeof action.move.targets === "number" && action.move.targets > 0 ? "selectable" : "predetermined";
    const requiredTargetCount = mode === "selectable" ? action.move.targets as number : 0;
    const moveName = presentation.move(action.move.id);
    const context = { state, presentation, thresholds };
    const grouped = groupActionEffects(action.effects, context);
    const zeroTargetPreviewEffects = action.move.targets === 0
        ? action.targets.flatMap((preview, index) => preview.valid
            ? createPreviewEffects(preview, `action-preview-${index}`, context)
            : [])
        : [];
    const heading = targetingHeading(action, presentation);

    return {
        mode,
        requiredTargetCount,
        available: action.available,
        ...(heading ? { heading } : {}),
        command: { id: action.move.id, name: moveName, tags: createMoveTags(action, state, actor, presentation) },
        targets: action.move.targets === 0 ? [] : action.targets.map((preview, index) => createTargetPreview(
            state, actions, preview, index, presentation, thresholds,
        )),
        actionEffects: [...zeroTargetPreviewEffects, ...grouped.ungrouped],
        actionEffectGroups: grouped.groups,
        labels: { actionEffects: presentation.ui("targeting.actionEffects") },
        controls: {
            backLabel: presentation.ui("targeting.back"),
            executeLabel: presentation.ui("targeting.use", { move: moveName }),
        },
        ...(action.reason ? { reasonLabel: presentation.failure(action.reason) } : {}),
    };
}

export function toggleTargetSelection(selected: readonly EntityId[], target: EntityId, requiredTargetCount: number): EntityId[] {
    if (selected.includes(target)) return selected.filter((id) => id !== target);
    if (requiredTargetCount === 1) return [target];
    if (requiredTargetCount <= 0 || selected.length >= requiredTargetCount) return [...selected];
    return [...selected, target];
}
export function targetingActionIdentity(actorId: EntityId, action: ActionInfo): string {
    return JSON.stringify([actorId, action.move.id]);
}
export function reconcileTargetSelection(
    previousActionIdentity: string, nextActionIdentity: string, currentSelection: readonly EntityId[],
    initialSelection: readonly EntityId[], model: TargetingViewModel,
): EntityId[] {
    return sanitizeTargetSelection(previousActionIdentity === nextActionIdentity ? currentSelection : initialSelection, model);
}
export function sanitizeTargetSelection(selected: readonly EntityId[], model: TargetingViewModel): EntityId[] {
    if (model.mode !== "selectable" || !model.available) return [];
    const validTargets = new Set(model.targets.flatMap((target) => target.valid && target.target ? [target.target] : []));
    const result: EntityId[] = [];
    for (const id of selected) {
        if (validTargets.has(id) && !result.includes(id)) result.push(id);
        if (result.length === model.requiredTargetCount) break;
    }
    return result;
}
export function isTargetingReady(model: TargetingViewModel, selected: readonly EntityId[]): boolean {
    if (!model.available) return false;
    return model.mode === "predetermined" || sanitizeTargetSelection(selected, model).length === model.requiredTargetCount;
}

function targetingHeading(action: ActionInfo, presentation: Presentation): string | undefined {
    if (typeof action.move.targets === "number" && action.move.targets > 0) {
        return action.move.targets === 1 ? presentation.ui("targeting.chooseOne") : presentation.ui("targeting.chooseMany", { count: action.move.targets });
    }
    if (action.move.targets === "all") {
        if (action.move.targetSide === "player") return presentation.ui("targeting.allPlayers");
        if (action.move.targetSide === "enemy") return presentation.ui("targeting.allEnemies");
        return presentation.ui("targeting.allTargets");
    }
    return undefined;
}

function createTargetPreview(
    state: GameState, actions: readonly ActionView[], preview: ActionInfo["targets"][number], index: number,
    presentation: Presentation, thresholds?: ThresholdInfo,
): TargetPreviewViewModel {
    const targetId = preview.target;
    const enemy = targetId ? state.enemies.find(({ id }) => id === targetId) : undefined;
    const character = targetId ? state.characters.find(({ id }) => id === targetId) : undefined;
    const base = {
        id: targetId ?? `preview-${index}`,
        target: targetId,
        name: targetId ? presentation.entity(targetId) : "",
        linkedEntities: enemy ? projectLinkedPlayers(enemy.buffs, state.characters, presentation) : [],
    };
    const identity = targetIdentity(enemy?.currHp, enemy?.maxHp, character, actions, presentation);
    if (!preview.valid) {
        return { ...base, ...identity, valid: false, effects: [], reasonLabel: presentation.failure(preview.reason) };
    }
    return {
        ...base, ...identity, valid: true, accuracy: preview.accuracy, damage: preview.damage,
        effects: createPreviewEffects(preview, base.id, {
            state, presentation, thresholds, ...(targetId ? { scopeTarget: targetId } : {}),
        }),
    };
}

function createPreviewEffects(
    preview: Extract<ActionInfo["targets"][number], { valid: true }>, id: string, context: EffectContext,
): EffectPreviewViewModel[] {
    const effects: EffectPreviewViewModel[] = [];
    if (preview.damage) effects.push(createDamageProfile(preview.damage, context.presentation));
    else if (preview.accuracy) effects.push(createAccuracyEffect(preview.accuracy, context.presentation));
    effects.push(...preview.effects.map((effect, index) => createEffectPreview(effect, `${id}-effect-${index}`, context)));
    return effects;
}

function targetIdentity(
    current: number | undefined, max: number | undefined, character: Character | undefined,
    actions: readonly ActionView[], presentation: Presentation,
): Partial<TargetPreviewViewModel> {
    if (current !== undefined && max !== undefined) {
        return {
            value: current, maxValue: max,
            valueLabel: presentation.ui("targeting.value", { current, max }),
            fillPercent: max > 0 ? Math.min(100, Math.max(0, (current / max) * 100)) : 0,
        };
    }
    const action = character ? actions.find(({ id }) => id === character.id) : undefined;
    if (!character || !action) return {};
    return { characterSummary: presentation.ui("targeting.characterSummary", {
        action: createCharacterActionState(character, action, presentation).label,
        stance: createCharacterStanceState(character, action, presentation).label,
    }) };
}

function createDamageProfile(damage: PreviewProfile, presentation: Presentation): DamageProfileViewModel {
    return {
        kind: "damage-profile", label: presentation.ui("targeting.effectDamage"), tone: "danger",
        bands: DAMAGE_BANDS.flatMap((band) => {
            const value = damage[band];
            return value ? [createDamageBand(band, value, presentation)] : [];
        }),
    };
}
function createDamageBand(band: DamageBandViewModel["band"], value: BandPreview, presentation: Presentation): DamageBandViewModel {
    return {
        band, label: presentation.hitBand(band), chance: value.chance,
        chanceLabel: presentation.ui("targeting.chance", { band: presentation.hitBand(band), chance: value.chance }),
        min: value.min, max: value.max,
        rangeLabel: presentation.ui("targeting.damageRange", { min: value.min, max: value.max }),
        emphasized: band === "hit" || band === "crit",
    };
}
function createAccuracyEffect(accuracy: AccuracyProfile, presentation: Presentation): CompactEffectViewModel {
    return compactEffect("accuracy", "accuracy", "primary", presentation.ui("targeting.effectAccuracy"),
        DAMAGE_BANDS.flatMap((band) => accuracy[band] === undefined ? [] : [presentation.ui("targeting.chance", {
            band: presentation.hitBand(band), chance: accuracy[band] ?? 0,
        })]).join(" Â· "), []);
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
    const debuff = classifications.length > 0 && classifications.every((value) => value === true);
    const operationKey = effect.operation === "add"
        ? (debuff ? "targeting.effectAddDebuff" : "targeting.effectAddBuff")
        : (debuff ? "targeting.effectRemoveDebuff" : "targeting.effectRemoveBuff");
    const applying = effect.operation === "add";
    return {
        kind: "buff", id, type: "buff", tone: "special", operation: effect.operation,
        label: presentation.ui(operationKey), name: presentation.buff(effect.buff.id),
        ...(applying && effect.buff.duration !== undefined
            ? { durationLabel: presentation.ui("characterDetails.rounds", { count: effect.buff.duration }) }
            : {}),
        modifiers: applying ? modifierEntries.slice(0, 2).map(([modifier, value]) => ({
            label: presentation.modifier(modifier), value, signedValue: formatSignedNumber(value),
            harmful: isHarmfulModifierChange(modifier, value) === true,
            direction: value >= 0 ? "left" : "right",
        })) : [],
        moveList: applying ? [
            ...(effect.buff.moveList?.addedMoves ?? []).map((move) => presentation.ui("targeting.addMove", { move: presentation.move(move) })),
            ...(effect.buff.moveList?.blockedMoves ?? []).map((move) => presentation.ui("targeting.blockMove", { move: presentation.move(move) })),
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
    const target = context.state.characters.find(({ id: targetId }) => targetId === effect.target);
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
    const projectedValue = Math.max(0, currentValue + effect.amount);
    const level = bindingLevelAtValue(projectedValue, context.thresholds);
    const percent = (value: number): number => context.thresholds!.max > 0
        ? Math.min(100, Math.max(0, (value / context.thresholds!.max) * 100)) : 0;
    return {
        kind: "binding", id, type: "binding", tone: "special",
        label: context.presentation.ui("targeting.effectBinding"),
        bindingName: context.presentation.binding(effect.binding), currentValue, projectedValue,
        deltaLabel: context.presentation.ui("targeting.bindingAmount", { amount: formatSignedNumber(effect.amount) }),
        level, levelLabel: context.presentation.bindingLevel(level),
        currentPercent: percent(currentValue), projectedPercent: percent(projectedValue),
        ...(context.scopeTarget !== effect.target ? { recipient: context.presentation.entity(effect.target) } : {}),
    };
}

function groupActionEffects(
    effects: readonly Effect[], context: Omit<EffectContext, "scopeTarget">,
): { groups: ActionEffectGroupViewModel[]; ungrouped: EffectPreviewViewModel[] } {
    const charactersById = new Set(context.state.characters.map(({ id }) => id));
    const groups: ActionEffectGroupViewModel[] = [];
    const groupsById = new Map<EntityId, EffectPreviewViewModel[]>();
    const ungrouped: EffectPreviewViewModel[] = [];
    effects.forEach((effect, index) => {
        const id = `action-effect-${index}`;
        const target = "target" in effect ? effect.target : undefined;
        if (target === undefined || !charactersById.has(target)) {
            ungrouped.push(createEffectPreview(effect, id, context));
            return;
        }
        let group = groupsById.get(target);
        if (!group) {
            group = [];
            groupsById.set(target, group);
            groups.push({ id: target, name: context.presentation.entity(target), effects: group });
        }
        group.push(createEffectPreview(effect, id, { ...context, scopeTarget: target }));
    });
    return { groups, ungrouped };
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
