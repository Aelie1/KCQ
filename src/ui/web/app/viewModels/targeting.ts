import type {
    AccuracyProfile,
    ActionInfo,
    BandPreview,
    Character,
    Effect,
    EntityId,
    GameState,
    HitBand,
    ModifierId,
    MoveListModifier,
    PreviewProfile,
} from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import {
    createMoveTags,
    type CommandTagViewModel,
} from "./characterDetails";
import {
    projectLinkedPlayers,
    type LinkedEntityViewModel,
} from "./linkedEntities";

export type TargetingMode = "predetermined" | "selectable";
export type EffectTone = "danger" | "primary" | "special" | "warning";

export interface DamageBandViewModel {
    band: Exclude<HitBand, "none">;
    chance: number;
    chanceLabel: string;
    emphasized: boolean;
    label: string;
    max: number;
    min: number;
    rangeLabel: string;
}

export interface DamageProfileViewModel {
    bands: readonly DamageBandViewModel[];
    kind: "damage-profile";
    label: string;
    tone: "danger";
}

export interface CompactEffectViewModel {
    details: readonly string[];
    id: string;
    kind: "compact";
    label: string;
    payload: string;
    tone: EffectTone;
    type: Effect["type"] | "accuracy";
}

export type EffectPreviewViewModel = DamageProfileViewModel | CompactEffectViewModel;

export interface TargetPreviewViewModel {
    accuracy?: AccuracyProfile;
    characterSummary?: string;
    damage?: PreviewProfile;
    effects: readonly EffectPreviewViewModel[];
    fillPercent?: number;
    id: string;
    linkedEntities: readonly LinkedEntityViewModel[];
    maxValue?: number;
    name: string;
    reasonLabel?: string;
    target: EntityId | null;
    valid: boolean;
    value?: number;
    valueLabel?: string;
}

export interface TargetingViewModel {
    actionEffects: readonly CompactEffectViewModel[];
    actionEffectGroups: readonly ActionEffectGroupViewModel[];
    available: boolean;
    command: {
        id: string;
        name: string;
        tags: readonly CommandTagViewModel[];
    };
    controls: {
        backLabel: string;
        executeLabel: string;
    };
    heading: string;
    labels: {
        actionEffects: string;
    };
    mode: TargetingMode;
    reasonLabel?: string;
    requiredTargetCount: number;
    targets: readonly TargetPreviewViewModel[];
}

export interface ActionEffectGroupViewModel {
    effects: readonly CompactEffectViewModel[];
    id: EntityId;
    name: string;
}

const DAMAGE_BANDS = ["miss", "graze", "hit", "crit"] as const;

export function createTargetingViewModel(
    state: GameState,
    actorId: EntityId,
    action: ActionInfo,
    presentation: Presentation,
): TargetingViewModel {
    const actor = state.characters.find(({ id }) => id === actorId);
    if (!actor) {
        throw new Error(`Missing Character for targeting actor ${actorId}.`);
    }

    const mode: TargetingMode = typeof action.move.targets === "number"
        && action.move.targets > 0
        ? "selectable"
        : "predetermined";
    const requiredTargetCount = mode === "selectable" ? action.move.targets as number : 0;
    const moveName = presentation.move(action.move.id);

    const actionEffects = groupActionEffects(action.effects, state, presentation);

    return {
        mode,
        requiredTargetCount,
        available: action.available,
        heading: targetingHeading(action, presentation),
        command: {
            id: action.move.id,
            name: moveName,
            tags: createMoveTags(action, state, actor, presentation),
        },
        targets: action.targets.map((preview, index) => createTargetPreview(
            state,
            preview,
            index,
            presentation,
        )),
        actionEffects: actionEffects.ungrouped,
        actionEffectGroups: actionEffects.groups,
        labels: {
            actionEffects: presentation.ui("targeting.actionEffects"),
        },
        controls: {
            backLabel: presentation.ui("targeting.back"),
            executeLabel: presentation.ui("targeting.use", { move: moveName }),
        },
        ...(action.reason ? { reasonLabel: presentation.failure(action.reason) } : {}),
    };
}

export function toggleTargetSelection(
    selected: readonly EntityId[],
    target: EntityId,
    requiredTargetCount: number,
): EntityId[] {
    if (selected.includes(target)) {
        return selected.filter((id) => id !== target);
    }

    if (requiredTargetCount === 1) {
        return [target];
    }

    if (requiredTargetCount <= 0 || selected.length >= requiredTargetCount) {
        return [...selected];
    }

    return [...selected, target];
}

export function targetingActionIdentity(
    actorId: EntityId,
    action: ActionInfo,
): string {
    return JSON.stringify([actorId, action.move.id]);
}

export function reconcileTargetSelection(
    previousActionIdentity: string,
    nextActionIdentity: string,
    currentSelection: readonly EntityId[],
    initialSelection: readonly EntityId[],
    model: TargetingViewModel,
): EntityId[] {
    return sanitizeTargetSelection(
        previousActionIdentity === nextActionIdentity
            ? currentSelection
            : initialSelection,
        model,
    );
}

export function sanitizeTargetSelection(
    selected: readonly EntityId[],
    model: TargetingViewModel,
): EntityId[] {
    if (model.mode !== "selectable" || !model.available) {
        return [];
    }

    const validTargets = new Set(model.targets.flatMap((target) =>
        target.valid && target.target ? [target.target] : []));
    const result: EntityId[] = [];
    for (const id of selected) {
        if (validTargets.has(id) && !result.includes(id)) {
            result.push(id);
        }
        if (result.length === model.requiredTargetCount) {
            break;
        }
    }
    return result;
}

export function isTargetingReady(
    model: TargetingViewModel,
    selected: readonly EntityId[],
): boolean {
    if (!model.available) {
        return false;
    }
    if (model.mode === "predetermined") {
        return true;
    }
    return sanitizeTargetSelection(selected, model).length === model.requiredTargetCount;
}

function targetingHeading(action: ActionInfo, presentation: Presentation): string {
    if (typeof action.move.targets === "number" && action.move.targets > 0) {
        return action.move.targets === 1
            ? presentation.ui("targeting.chooseOne")
            : presentation.ui("targeting.chooseMany", { count: action.move.targets });
    }

    if (action.move.targets === "all") {
        if (action.move.targetSide === "player") {
            return presentation.ui("targeting.allPlayers");
        }
        if (action.move.targetSide === "enemy") {
            return presentation.ui("targeting.allEnemies");
        }
        return presentation.ui("targeting.allTargets");
    }

    return presentation.ui("targeting.predetermined");
}

function createTargetPreview(
    state: GameState,
    preview: ActionInfo["targets"][number],
    index: number,
    presentation: Presentation,
): TargetPreviewViewModel {
    const targetId = preview.target;
    const enemy = targetId ? state.enemies.find(({ id }) => id === targetId) : undefined;
    const character = targetId ? state.characters.find(({ id }) => id === targetId) : undefined;
    const name = targetId
        ? presentation.entity(targetId)
        : presentation.ui("targeting.automaticTarget");
    const base = {
        id: targetId ?? `automatic-${index}`,
        target: targetId,
        name,
        linkedEntities: enemy
            ? projectLinkedPlayers(enemy.buffs, state.characters, presentation)
            : [],
    };

    if (!preview.valid) {
        return {
            ...base,
            valid: false,
            effects: [],
            reasonLabel: presentation.failure(preview.reason),
            ...targetIdentity(enemy?.currHp, enemy?.maxHp, character, presentation),
        };
    }

    const effects: EffectPreviewViewModel[] = [];
    if (preview.damage) {
        effects.push(createDamageProfile(preview.damage, presentation));
    } else if (preview.accuracy) {
        effects.push(createAccuracyEffect(preview.accuracy, presentation));
    }
    effects.push(...preview.effects.map((effect, effectIndex) => createCompactEffect(
        effect,
        `${base.id}-effect-${effectIndex}`,
        presentation,
    )));

    return {
        ...base,
        valid: true,
        accuracy: preview.accuracy,
        damage: preview.damage,
        effects,
        ...targetIdentity(enemy?.currHp, enemy?.maxHp, character, presentation),
    };
}

function targetIdentity(
    current: number | undefined,
    max: number | undefined,
    character: Character | undefined,
    presentation: Presentation,
): Partial<TargetPreviewViewModel> {
    if (current !== undefined && max !== undefined) {
        return {
            value: current,
            maxValue: max,
            valueLabel: presentation.ui("targeting.value", { current, max }),
            fillPercent: max > 0 ? Math.min(100, Math.max(0, (current / max) * 100)) : 0,
        };
    }

    if (character) {
        return {
            characterSummary: presentation.ui("targeting.characterSummary", {
                action: presentation.ui(character.acted ? "action.acted" : "action.ready"),
                stance: presentation.stance(character.standing ? "standing" : "moving"),
            }),
        };
    }

    return {};
}

function createDamageProfile(
    damage: PreviewProfile,
    presentation: Presentation,
): DamageProfileViewModel {
    return {
        kind: "damage-profile",
        label: presentation.ui("targeting.effectDamage"),
        tone: "danger",
        bands: DAMAGE_BANDS.flatMap((band) => {
            const value = damage[band];
            return value ? [createDamageBand(band, value, presentation)] : [];
        }),
    };
}

function createDamageBand(
    band: DamageBandViewModel["band"],
    value: BandPreview,
    presentation: Presentation,
): DamageBandViewModel {
    return {
        band,
        label: presentation.hitBand(band),
        chance: value.chance,
        chanceLabel: presentation.ui("targeting.chance", {
            band: presentation.hitBand(band),
            chance: value.chance,
        }),
        min: value.min,
        max: value.max,
        rangeLabel: presentation.ui("targeting.damageRange", {
            min: value.min,
            max: value.max,
        }),
        emphasized: band === "hit" || band === "crit",
    };
}

function createAccuracyEffect(
    accuracy: AccuracyProfile,
    presentation: Presentation,
): CompactEffectViewModel {
    return {
        kind: "compact",
        id: "accuracy",
        type: "accuracy",
        tone: "primary",
        label: presentation.ui("targeting.effectAccuracy"),
        payload: DAMAGE_BANDS.flatMap((band) => accuracy[band] === undefined
            ? []
            : [presentation.ui("targeting.chance", {
                band: presentation.hitBand(band),
                chance: accuracy[band] ?? 0,
            })]).join(" · "),
        details: [],
    };
}

function createCompactEffect(
    effect: Effect,
    id: string,
    presentation: Presentation,
    suppressTargetDetail = false,
): CompactEffectViewModel {
    switch (effect.type) {
        case "damage":
            return compactEffect(
                id,
                effect.type,
                "danger",
                presentation.ui("targeting.effectDamage"),
                presentation.ui("targeting.damageAmount", { amount: effect.amount }),
                suppressTargetDetail ? [] : [presentation.entity(effect.target)],
            );
        case "binding":
            return compactEffect(
                id,
                effect.type,
                "special",
                presentation.ui("targeting.effectBinding"),
                presentation.binding(effect.binding),
                effect.amount === undefined
                    ? (suppressTargetDetail ? [] : [presentation.entity(effect.target)])
                    : [
                        ...(suppressTargetDetail ? [] : [presentation.entity(effect.target)]),
                        presentation.ui("targeting.bindingAmount", {
                            amount: effect.amount,
                        })],
            );
        case "buff":
            return compactEffect(
                id,
                effect.type,
                "special",
                presentation.ui(effect.operation === "add"
                    ? "targeting.effectAddBuff"
                    : "targeting.effectRemoveBuff"),
                presentation.buff(effect.buff.id),
                [
                    ...(suppressTargetDetail ? [] : [presentation.entity(effect.target)]),
                    ...modifierDetails(effect.buff.modifiers, presentation),
                    ...moveListDetails(effect.buff.moveList, presentation),
                ],
            );
        case "enemy":
            return compactEffect(
                id,
                effect.type,
                effect.operation === "defeat" ? "danger" : "primary",
                presentation.ui(effect.operation === "defeat"
                    ? "targeting.operationDefeat"
                    : "targeting.operationSpawn"),
                presentation.entity(effect.target),
                [],
            );
        case "trap":
            return compactEffect(
                id,
                effect.type,
                "warning",
                presentation.ui("targeting.effectTrap"),
                presentation.trap(effect.trap),
                [presentation.ui("targeting.trapAmount", { amount: effect.amount })],
            );
        case "move":
            return compactEffect(
                id,
                effect.type,
                "primary",
                presentation.ui("targeting.effectMove"),
                presentation.move(effect.move),
                [],
            );
        case "data":
            return compactEffect(
                id,
                effect.type,
                "primary",
                presentation.ui("targeting.effectData"),
                presentation.data(effect.name),
                [
                    ...(suppressTargetDetail ? [] : [presentation.entity(effect.target)]),
                    effect.amount.toString(),
                ],
            );
        case "intention":
            return compactEffect(
                id,
                effect.type,
                "primary",
                presentation.ui(effect.operation === "cancel" ?
                    "targeting.effectCancel" : "targeting.effectRetarget"),
                presentation.entity(effect.target),
                [effect.operation === "cancel"
                    ? effect.amount.toString()
                    : presentation.entity(effect.destination)
                ],
            );
        case "refresh":
            return compactEffect(
                id,
                effect.type,
                "primary",
                presentation.ui("targeting.effectRefresh"),
                presentation.entity(effect.target),
                [],
            );
    }
}

function groupActionEffects(
    effects: readonly Effect[],
    state: GameState,
    presentation: Presentation,
): {
    groups: ActionEffectGroupViewModel[];
    ungrouped: CompactEffectViewModel[];
} {
    const charactersById = new Map(state.characters.map((character) => [character.id, character]));
    const groups: ActionEffectGroupViewModel[] = [];
    const groupsById = new Map<EntityId, { effects: CompactEffectViewModel[] }>();
    const ungrouped: CompactEffectViewModel[] = [];

    effects.forEach((effect, index) => {
        const id = `action-effect-${index}`;
        const target = "target" in effect ? effect.target : undefined;
        if (target === undefined || !charactersById.has(target)) {
            ungrouped.push(createCompactEffect(effect, id, presentation));
            return;
        }

        let group = groupsById.get(target);
        if (!group) {
            group = { effects: [] };
            groupsById.set(target, group);
            groups.push({
                id: target,
                name: presentation.entity(target),
                effects: group.effects,
            });
        }
        group.effects.push(createCompactEffect(effect, id, presentation, true));
    });

    return { groups, ungrouped };
}

function compactEffect(
    id: string,
    type: CompactEffectViewModel["type"],
    tone: EffectTone,
    label: string,
    payload: string,
    details: readonly string[],
): CompactEffectViewModel {
    return { kind: "compact", id, type, tone, label, payload, details };
}

function modifierDetails(
    modifiers: Partial<Record<ModifierId, number>> | undefined,
    presentation: Presentation,
): string[] {
    return Object.entries(modifiers ?? {}).map(([modifier, value]) =>
        presentation.ui("characterDetails.effectModifier", {
            modifier: presentation.modifier(modifier as ModifierId),
            value: value !== undefined && value >= 0 ? `+${value}` : value ?? 0,
        }));
}

function moveListDetails(
    moveList: MoveListModifier | undefined,
    presentation: Presentation,
): string[] {
    return [
        ...(moveList?.addedMoves ?? []).map((move) => presentation.ui("targeting.addMove", {
            move: presentation.move(move),
        })),
        ...(moveList?.blockedMoves ?? []).map((move) => presentation.ui("targeting.blockMove", {
            move: presentation.move(move),
        })),
    ];
}
