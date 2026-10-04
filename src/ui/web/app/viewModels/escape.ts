import type {
    ActionView,
    BindingEffect,
    BindingId,
    BindingLevel,
    EntityId,
    EscapeInfo,
    GameState,
} from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import {
    createCharacterActionState,
    createCharacterStanceState,
} from "./characterState";
import type { CommandTagViewModel } from "./characterDetails";

export type EscapeValueTone = BindingLevel | "danger";

export interface EscapeProjectionViewModel {
    amount: number;
    projectedValue: number;
    tone: EscapeValueTone;
}

export interface EscapeChoiceViewModel {
    available: boolean;
    binding: BindingId;
    bindingName: string;
    currentTone: BindingLevel;
    currentValue: number;
    id: string;
    projection?: EscapeProjectionViewModel;
    reasonLabel?: string;
    selected: boolean;
    target: EntityId;
}

export interface EscapeTargetGroupViewModel {
    choices: readonly EscapeChoiceViewModel[];
    id: EntityId;
    name: string;
    selected: boolean;
    stateSummary: string;
}

export interface EscapeViewModel {
    command: {
        name: string;
        tags: readonly CommandTagViewModel[];
    };
    controls: {
        backLabel: string;
        executeLabel: string;
    };
    groups: readonly EscapeTargetGroupViewModel[];
    heading: string;
    selectedEscapeId?: string;
}

export function escapeChoiceId(info: EscapeInfo, index: number): string {
    return `${index}:${info.target}:${info.binding}`;
}

export function createEscapeViewModel(
    state: GameState,
    actions: readonly ActionView[],
    actorId: EntityId,
    presentation: Presentation,
    selectedEscapeId?: string,
): EscapeViewModel {
    const actorAction = actions.find(({ id }) => id === actorId);
    if (!actorAction) {
        throw new Error(`Missing ActionView for escape actor ${actorId}.`);
    }

    const indexedEscapes = actorAction.escapes.map((escape, index) => ({
        escape,
        id: escapeChoiceId(escape, index),
    }));
    const selected = indexedEscapes.find(({ id, escape }) =>
        id === selectedEscapeId && escape.available);
    const actionsById = new Map(actions.map((action) => [action.id, action]));
    const groupsById = new Map<EntityId, EscapeTargetGroupViewModel>();

    for (const entry of indexedEscapes) {
        const target = state.characters.find(({ id }) => id === entry.escape.target);
        const targetAction = actionsById.get(entry.escape.target);
        if (!target || !targetAction) {
            throw new Error(`Missing character data for escape target ${entry.escape.target}.`);
        }

        const binding = target.bindings.find(({ id }) => id === entry.escape.binding);
        if (!binding) {
            throw new Error(
                `Missing binding ${entry.escape.binding} for escape target ${entry.escape.target}.`,
            );
        }

        let group = groupsById.get(target.id);
        if (!group) {
            const actionState = createCharacterActionState(target, targetAction, presentation);
            const stanceState = createCharacterStanceState(target, targetAction, presentation);
            group = {
                id: target.id,
                name: presentation.entity(target.id),
                stateSummary: presentation.ui("targeting.characterSummary", {
                    action: actionState.label,
                    stance: stanceState.label,
                }),
                selected: selected?.escape.target === target.id,
                choices: [],
            };
            groupsById.set(target.id, group);
        }

        const effects = selected?.escape.effects ?? entry.escape.effects;
        const projection = bindingProjection(
            effects,
            target.id,
            binding.id,
            binding.value,
            binding.level,
        );
        (group.choices as EscapeChoiceViewModel[]).push({
            id: entry.id,
            target: target.id,
            binding: binding.id,
            bindingName: presentation.bindingCompact(binding.id),
            currentValue: binding.value,
            currentTone: binding.level,
            available: entry.escape.available,
            selected: selected?.id === entry.id,
            ...(projection ? { projection } : {}),
            ...(!entry.escape.available ? {
                reasonLabel: entry.escape.reason
                    ? presentation.failure(entry.escape.reason)
                    : presentation.ui("action.unavailable"),
            } : {}),
        });
    }

    const tags: CommandTagViewModel[] = [];
    if (actorAction.escapes.some(({ target }) => target !== actorId)) {
        tags.push({
            id: "ally",
            label: presentation.ui("characterDetails.tagAlly"),
            tone: "ally",
        });
    }
    if (actorAction.escapes.some(({ target }) => target === actorId)) {
        tags.push({
            id: "self",
            label: presentation.ui("characterDetails.tagSelf"),
            tone: "success",
        });
    }
    if (selected && hasSpreadSideEffect(selected.escape)) {
        tags.push({
            id: "spread",
            label: presentation.ui("escape.tagSpread"),
            tone: "danger",
        });
    }

    return {
        heading: presentation.ui("targeting.chooseOne"),
        command: {
            name: presentation.ui("characterDetails.escape"),
            tags,
        },
        groups: [...groupsById.values()],
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

export function sanitizeEscapeSelection(
    selectedEscapeId: string | undefined,
    escapes: readonly EscapeInfo[],
): string | undefined {
    if (!selectedEscapeId) {
        return undefined;
    }

    const selected = escapes.find((escape, index) =>
        escapeChoiceId(escape, index) === selectedEscapeId);
    return selected?.available ? selectedEscapeId : undefined;
}

export function initialEscapeSelection(
    escapes: readonly EscapeInfo[],
    initial: Pick<EscapeInfo, "binding" | "target"> | undefined,
): string | undefined {
    if (!initial) {
        return undefined;
    }

    const index = escapes.findIndex(({ binding, target, available }) =>
        available && binding === initial.binding && target === initial.target);
    return index >= 0 ? escapeChoiceId(escapes[index], index) : undefined;
}

function bindingProjection(
    effects: readonly EscapeInfo["effects"][number][],
    target: EntityId,
    binding: BindingId,
    currentValue: number,
    currentLevel: BindingLevel,
): EscapeProjectionViewModel | undefined {
    const matching = effects.filter((effect): effect is BindingEffect =>
        effect.type === "binding"
        && effect.target === target
        && effect.binding === binding
        && effect.amount !== undefined);
    if (matching.length === 0) {
        return undefined;
    }

    const amount = matching.reduce((total, effect) => total + (effect.amount ?? 0), 0);
    return {
        amount,
        projectedValue: currentValue + amount,
        tone: amount > 0 ? "danger" : currentLevel,
    };
}

function hasSpreadSideEffect(info: EscapeInfo): boolean {
    return info.effects.some((effect) =>
        effect.type === "binding"
        && (effect.amount ?? 0) > 0
        && (effect.target !== info.target || effect.binding !== info.binding));
}
