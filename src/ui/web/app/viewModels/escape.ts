import type {
    ActionView, BindingEffect, BindingId, BindingLevel, EntityId, EscapeInfo, GameState, ThresholdInfo,
} from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import { projectBindingZones } from "./bindingZones";
import type { CommandTagViewModel } from "./characterDetails";
import { createCharacterActionState, createCharacterStanceState } from "./characterState";
import { bindingLevelAtValue } from "./presentationHelpers";
import { playerTone, type PlayerTone } from "./linkedEntities";

export type EscapeValueTone = BindingLevel;
export interface EscapeProjectionViewModel { amount: number; projectedValue: number; tone: EscapeValueTone }
export interface EscapeChoiceViewModel {
    available: boolean; binding: BindingId; bindingName: string; currentTone: BindingLevel;
    currentValue: number; displayOnly: boolean; id: string; projection?: EscapeProjectionViewModel;
    reasonLabel?: string; selected: boolean; target: EntityId;
}
export interface EscapeTargetGroupViewModel {
    choices: readonly EscapeChoiceViewModel[]; id: EntityId; name: string; selected: boolean; stateSummary: string; tone: PlayerTone;
}
export interface EscapeViewModel {
    command: { name: string; tags: readonly CommandTagViewModel[] };
    controls: { backLabel: string; executeLabel: string };
    groups: readonly EscapeTargetGroupViewModel[]; heading: string; selectedEscapeId?: string;
}

export function escapeChoiceId(info: EscapeInfo, index: number): string {
    return `${index}:${info.target}:${info.binding}`;
}

export function createEscapeViewModel(
    state: GameState,
    actions: readonly ActionView[],
    actorId: EntityId,
    thresholds: ThresholdInfo,
    presentation: Presentation,
    selectedEscapeId?: string,
): EscapeViewModel {
    const actorAction = actions.find(({ id }) => id === actorId);
    if (!actorAction) throw new Error(`Missing ActionView for escape actor ${actorId}.`);

    const indexedEscapes = actorAction.escapes.map((escape, index) => ({
        escape,
        id: escapeChoiceId(escape, index),
        index,
    }));
    const selected = indexedEscapes.find(({ id, escape }) => id === selectedEscapeId && escape.available);
    const actionsById = new Map(actions.map((action) => [action.id, action]));
    const groups: EscapeTargetGroupViewModel[] = [];

    for (const target of state.characters) {
        const targetAction = actionsById.get(target.id);
        if (!targetAction) throw new Error(`Missing character data for escape target ${target.id}.`);

        const entriesByBinding = new Map(indexedEscapes
            .filter(({ escape }) => escape.target === target.id)
            .map((entry) => [entry.escape.binding, entry]));
        const actionState = createCharacterActionState(target, targetAction, presentation);
        const stanceState = createCharacterStanceState(target, targetAction, presentation);
        const choices = projectBindingZones(state.encounter?.bindings, target.bindings).map((binding) => {
            const entry = entriesByBinding.get(binding.id);
            const effects = selected?.escape.effects ?? entry?.escape.effects ?? [];
            const projection = bindingProjection(effects, target.id, binding.id, binding.value, thresholds);
            return {
                id: entry?.id ?? `display:${target.id}:${binding.id}`,
                target: target.id,
                binding: binding.id,
                bindingName: presentation.binding(binding.id, "short"),
                currentValue: binding.value,
                currentTone: binding.level,
                available: entry?.escape.available ?? false,
                displayOnly: entry === undefined,
                selected: selected !== undefined && selected?.id === entry?.id,
                ...(projection ? { projection } : {}),
                ...(entry && !entry.escape.available ? {
                    reasonLabel: entry.escape.reason
                        ? presentation.failure(entry.escape.reason)
                        : presentation.ui("action.unavailable"),
                } : {}),
            } satisfies EscapeChoiceViewModel;
        });

        groups.push({
            id: target.id,
            name: presentation.entity(target.id),
            tone: playerTone(target.id),
            stateSummary: presentation.ui("targeting.characterSummary", {
                action: actionState.label,
                stance: stanceState.label,
            }),
            selected: selected?.escape.target === target.id,
            choices,
        });
    }

    const availableEscapes = actorAction.escapes.filter(({ available }) => available);
    const tags: CommandTagViewModel[] = [];
    if (availableEscapes.some(({ target }) => target !== actorId)) {
        tags.push({ id: "ally", label: presentation.ui("characterDetails.tagAlly"), tone: "ally" });
    }
    if (availableEscapes.some(({ target }) => target === actorId)) {
        tags.push({ id: "self", label: presentation.ui("characterDetails.tagSelf"), tone: "success" });
    }
    if (selected && hasSpreadSideEffect(selected.escape)) {
        tags.push({ id: "spread", label: presentation.ui("escape.tagSpread"), tone: "danger" });
    }

    return {
        heading: presentation.ui("targeting.chooseOne"),
        command: { name: presentation.ui("characterDetails.escape"), tags },
        groups,
        controls: {
            backLabel: presentation.ui("targeting.back"),
            executeLabel: selected && selected.escape.target !== actorId
                ? presentation.ui("escape.assist", {
                    character: presentation.entity(selected.escape.target),
                    binding: presentation.binding(selected.escape.binding),
                })
                : presentation.ui("escape.use"),
        },
        ...(selected ? { selectedEscapeId: selected.id } : {}),
    };
}

export function sanitizeEscapeSelection(selectedEscapeId: string | undefined, escapes: readonly EscapeInfo[]): string | undefined {
    if (!selectedEscapeId) return undefined;
    const selected = escapes.find((escape, index) => escapeChoiceId(escape, index) === selectedEscapeId);
    return selected?.available ? selectedEscapeId : undefined;
}
export function initialEscapeSelection(
    escapes: readonly EscapeInfo[], initial: Pick<EscapeInfo, "binding" | "target"> | undefined,
): string | undefined {
    if (!initial) return undefined;
    const index = escapes.findIndex(({ binding, target, available }) =>
        available && binding === initial.binding && target === initial.target);
    return index >= 0 ? escapeChoiceId(escapes[index], index) : undefined;
}

function bindingProjection(
    effects: readonly EscapeInfo["effects"][number][], target: EntityId, binding: BindingId,
    currentValue: number, thresholds: ThresholdInfo,
): EscapeProjectionViewModel | undefined {
    const matching = effects.filter((effect): effect is BindingEffect =>
        effect.type === "binding" && effect.target === target && effect.binding === binding && effect.amount !== undefined);
    if (matching.length === 0) return undefined;
    const amount = matching.reduce((total, effect) => total + (effect.amount ?? 0), 0);
    const projectedValue = Math.max(0, currentValue + amount);
    return { amount, projectedValue, tone: bindingLevelAtValue(projectedValue, thresholds) };
}

function hasSpreadSideEffect(info: EscapeInfo): boolean {
    return info.effects.some((effect) => effect.type === "binding" && (effect.amount ?? 0) > 0
        && (effect.target !== info.target || effect.binding !== info.binding));
}
