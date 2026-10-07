import type {
    AccuracyProfile, ActionInfo, ActionView, BandPreview, Character, DataEffect,
    EntityId, GameState, PreviewProfile, ThresholdInfo,
} from "../../../../engine/public/types";
import { groupEffectPreviews, type EffectGroupViewModel } from "./effectGroups";
import type { Presentation } from "../../../presentation/presentation";
import { createMoveTags, type CommandTagViewModel } from "./characterDetails";
import { createCharacterActionState, createCharacterStanceState } from "./characterState";
import { playerTone, projectLinkedPlayers, type LinkedEntityViewModel, type PlayerTone } from "./linkedEntities";
import {
    createEffectPreviews, type EffectContext, type EffectPreviewViewModel,
    type DamageBandViewModel, type DamageProfileViewModel, type AccuracyProfileViewModel,
} from "./effectPreviews";
export type {
    EffectPreviewViewModel, EffectTone, DamageBandViewModel, DamageProfileViewModel,
    AccuracyBandViewModel, AccuracyProfileViewModel, CompactEffectViewModel,
    BuffModifierViewModel, BuffEffectViewModel, BindingEffectViewModel,
} from "./effectPreviews";

export type TargetingMode = "predetermined" | "selectable";
export interface TargetPreviewViewModel {
    accuracy?: AccuracyProfile; characterSummary?: string; damage?: PreviewProfile;
    effects: readonly EffectPreviewViewModel[]; health?: TargetHealthViewModel; id: string;
    linkedEntities: readonly LinkedEntityViewModel[]; name: string; tone: PlayerTone;
    reasonLabel?: string; target: EntityId | null; valid: boolean;
}
export interface TargetHealthViewModel {
    current: number; currentLabel: string; fillPercent: number; max: number;
}
export interface TargetingViewModel {
    actionEffects: readonly EffectPreviewViewModel[]; actionEffectGroups: readonly ActionEffectGroupViewModel[];
    available: boolean; command: { id: string; name: string; tags: readonly CommandTagViewModel[] };
    controls: { backLabel: string; executeLabel: string }; heading?: string;
    labels: { actionEffects: string }; mode: TargetingMode; reasonLabel?: string;
    requiredTargetCount: number; targets: readonly TargetPreviewViewModel[];
}
export interface ActionEffectGroupViewModel extends EffectGroupViewModel {
    tone: PlayerTone;
}
const DAMAGE_BANDS = ["miss", "graze", "hit", "crit"] as const;

export function createTargetingViewModel(
    state: GameState,
    actorId: EntityId,
    action: ActionInfo,
    presentation: Presentation,
    actions: readonly ActionView[] = [],
    thresholds?: ThresholdInfo,
    selectedTargets: readonly EntityId[] = [],
): TargetingViewModel {
    const actor = state.characters.find(({ id }) => id === actorId);
    if (!actor) throw new Error(`Missing Character for targeting actor ${actorId}.`);

    const mode: TargetingMode = typeof action.move.targets === "number" && action.move.targets > 0 ? "selectable" : "predetermined";
    const requiredTargetCount = mode === "selectable" ? action.move.targets as number : 0;
    const moveName = presentation.move(action.move.id);
    const context = { actions, state, presentation, thresholds };
    const selectedDataEffects = targetDataEffects(action, selectedTargets);
    const charactersById = new Set(state.characters.map(({ id }) => id));
    const grouped = groupEffectPreviews(
        [...action.effects, ...selectedDataEffects], context, "action-effect",
        (target) => charactersById.has(target),
    );
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
        actionEffectGroups: grouped.groups.map((group) => ({ ...group, tone: playerTone(group.id) })),
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
        tone: character ? playerTone(character.id) : "neutral" as PlayerTone,
        linkedEntities: enemy ? projectLinkedPlayers(enemy.buffs, state.characters, presentation) : [],
    };
    const identity = targetIdentity(enemy?.currHp, enemy?.maxHp, character, actions, presentation);
    if (!preview.valid) {
        return { ...base, ...identity, valid: false, effects: [], reasonLabel: presentation.failure(preview.reason) };
    }
    return {
        ...base, ...identity, valid: true, accuracy: preview.accuracy, damage: preview.damage,
        effects: createPreviewEffects(preview, base.id, {
            actions, state, presentation, thresholds, ...(targetId ? { scopeTarget: targetId } : {}),
        }, true),
    };
}

function createPreviewEffects(
    preview: Extract<ActionInfo["targets"][number], { valid: true }>, id: string, context: EffectContext,
    omitDataEffects = false,
): EffectPreviewViewModel[] {
    const effects: EffectPreviewViewModel[] = [];
    if (preview.damage) effects.push(createDamageProfile(preview.damage, context.presentation));
    else if (preview.accuracy) effects.push(createAccuracyEffect(preview.accuracy, context.presentation));
    effects.push(...preview.effects.flatMap((effect, index) =>
        omitDataEffects && effect.type === "data"
            ? []
            : createEffectPreviews(effect, `${id}-effect-${index}`, context)));
    return effects;
}

function targetIdentity(
    current: number | undefined, max: number | undefined, character: Character | undefined,
    actions: readonly ActionView[], presentation: Presentation,
): Partial<TargetPreviewViewModel> {
    if (current !== undefined && max !== undefined) {
        return {
            health: {
                current,
                currentLabel: String(current),
                max,
                fillPercent: max > 0 ? Math.min(100, Math.max(0, (current / max) * 100)) : 0,
            },
        };
    }
    const action = character ? actions.find(({ id }) => id === character.id) : undefined;
    if (!character || !action) return {};
    return {
        characterSummary: presentation.ui("targeting.characterSummary", {
            action: createCharacterActionState(character, action, presentation).label,
            stance: createCharacterStanceState(character, action, presentation).label,
        })
    };
}

function createDamageProfile(damage: PreviewProfile, presentation: Presentation): DamageProfileViewModel {
    return {
        kind: "damage-profile", label: presentation.ui("targeting.effectDamage"), tone: "danger",
        bands: DAMAGE_BANDS.map((band) => createDamageBand(
            band,
            damage[band] ?? { chance: 0, min: 0, max: 0 },
            presentation,
        )),
    };
}
function createDamageBand(band: DamageBandViewModel["band"], value: BandPreview, presentation: Presentation): DamageBandViewModel {
    return {
        band, label: presentation.hitBand(band), chance: value.chance,
        chanceLabel: presentation.ui("targeting.chance", { band: presentation.hitBand(band), chance: value.chance }),
        min: value.min, max: value.max,
        rangeLabel: presentation.ui("targeting.damageRange", { min: value.min, max: value.max }),
        emphasized: value.chance > 0 && (band === "hit" || band === "crit"),
        zero: value.chance === 0,
    };
}
function createAccuracyEffect(accuracy: AccuracyProfile, presentation: Presentation): AccuracyProfileViewModel {
    return {
        kind: "accuracy-profile",
        label: presentation.ui("targeting.effectAccuracy"),
        tone: "primary",
        type: "accuracy",
        bands: DAMAGE_BANDS.flatMap((band) => {
            const chance = accuracy[band] ?? 0;
            return chance === 0 ? [] : [{
                band,
                chance,
                chanceLabel: presentation.ui("targeting.chance", {
                    band: presentation.hitBand(band),
                    chance,
                }),
                label: presentation.hitBand(band),
                zero: false,
            }];
        }),
    };
}

function targetDataEffects(action: ActionInfo, selectedTargets: readonly EntityId[]): DataEffect[] {
    if (action.move.targets === 0) return [];

    const validTargets = action.targets.flatMap((preview) =>
        preview.valid && preview.target !== null
            ? [{
                target: preview.target,
                effects: preview.effects.filter((effect): effect is DataEffect => effect.type === "data"),
            }]
            : []);
    if (validTargets.length === 0) return [];

    let chosen: readonly DataEffect[][];
    if (action.move.targets === "all") {
        chosen = validTargets.map(({ effects }) => effects);
    } else if (selectedTargets.length > 0) {
        const selected = new Set(selectedTargets);
        chosen = validTargets
            .filter(({ target }) => selected.has(target))
            .map(({ effects }) => effects);
    } else {
        const [first, ...rest] = validTargets.map(({ effects }) => effects);
        const signature = dataEffectSetSignature(first);
        if (rest.some((effects) => dataEffectSetSignature(effects) !== signature)) return [];
        chosen = [first];
    }

    const seen = new Set<string>();
    return chosen.flatMap((effects) => effects.filter((effect) => {
        const key = dataEffectSignature(effect);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }));
}

function dataEffectSetSignature(effects: readonly DataEffect[]): string {
    return JSON.stringify(effects.map(dataEffectSignature).sort());
}

function dataEffectSignature(effect: DataEffect): string {
    return JSON.stringify([effect.target, effect.name, effect.amount]);
}
