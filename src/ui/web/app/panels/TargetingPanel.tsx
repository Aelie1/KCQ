import { createEffect, createMemo, createSignal, For, Show, type JSX } from "solid-js";
import type {
    ActionInfo,
    ActionView,
    EntityId,
    GameState,
    ThresholdInfo,
} from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import { CharacterDetailsLayout } from "../components/CharacterDetailsLayout";
import { EffectPreview } from "../components/EffectPreview";
import { SelectedCommandSummary } from "../components/SelectedCommandSummary";
import { TargetCard } from "../components/TargetCard";
import { createCharacterDetailsViewModel } from "../viewModels/characterDetails";
import {
    createTargetingViewModel,
    isTargetingReady,
    reconcileTargetSelection,
    sanitizeTargetSelection,
    targetingActionIdentity,
    toggleTargetSelection,
} from "../viewModels/targeting";

export interface TargetingPanelProps {
    action: ActionInfo;
    actions: readonly ActionView[];
    actorId: EntityId;
    initialSelectedTargetIds?: readonly EntityId[];
    presentation: Presentation;
    state: GameState;
    thresholds: ThresholdInfo;
    onBack?: () => void;
    onExecute?: (targets: readonly EntityId[]) => void;
    onHeaderBack?: () => void;
    onSelectCharacter?: (id: EntityId) => void;
}

interface TargetingActionRegionProps {
    action: ActionInfo;
    actions: readonly ActionView[];
    actorId: EntityId;
    initialSelectedTargetIds?: readonly EntityId[];
    presentation: Presentation;
    state: GameState;
    thresholds: ThresholdInfo;
    onBack?: () => void;
    onExecute?: (targets: readonly EntityId[]) => void;
}

export function TargetingPanel(props: TargetingPanelProps): JSX.Element {
    const characterModel = createMemo(() => createCharacterDetailsViewModel(
        props.state,
        props.actions,
        props.actorId,
        props.thresholds,
        props.presentation,
    ));

    return (
        <CharacterDetailsLayout
            model={characterModel()}
            onHeaderBack={props.onHeaderBack}
            onSelectCharacter={props.onSelectCharacter}
            actionRegion={
                <TargetingActionRegion
                    action={props.action}
                    actions={props.actions}
                    actorId={props.actorId}
                    initialSelectedTargetIds={props.initialSelectedTargetIds}
                    presentation={props.presentation}
                    state={props.state}
                    thresholds={props.thresholds}
                    onBack={props.onBack}
                    onExecute={props.onExecute}
                />
            }
        />
    );
}

function TargetingActionRegion(props: TargetingActionRegionProps): JSX.Element {
    const model = createMemo(() => createTargetingViewModel(
        props.state,
        props.actorId,
        props.action,
        props.presentation,
        props.actions,
        props.thresholds,
    ));
    const actionIdentity = createMemo(() => targetingActionIdentity(
        props.actorId,
        props.action,
    ));
    let previousActionIdentity = actionIdentity();
    const [selectedTargets, setSelectedTargets] = createSignal(
        sanitizeTargetSelection(props.initialSelectedTargetIds ?? [], model()),
    );

    createEffect(() => {
        const nextActionIdentity = actionIdentity();
        const nextModel = model();
        setSelectedTargets((currentSelection) => reconcileTargetSelection(
            previousActionIdentity,
            nextActionIdentity,
            currentSelection,
            props.initialSelectedTargetIds ?? [],
            nextModel,
        ));
        previousActionIdentity = nextActionIdentity;
    });

    const ready = createMemo(() => isTargetingReady(model(), selectedTargets()));

    const selectTarget = (targetId: EntityId): void => {
        setSelectedTargets((selected) => toggleTargetSelection(
            selected,
            targetId,
            model().requiredTargetCount,
        ));
    };

    return (
        <section class="kcq-targeting" aria-label={model().command.name}>
            <div class="kcq-targeting__panel">
                <Show when={model().heading} keyed>
                    {(heading) => <h1>{heading}</h1>}
                </Show>
                <SelectedCommandSummary
                    name={model().command.name}
                    tags={model().command.tags}
                />
                <Show when={model().reasonLabel}>
                    <p class="kcq-targeting__reason">{model().reasonLabel}</p>
                </Show>
                <div
                    class="kcq-targeting__targets"
                    classList={{ "kcq-targeting__targets--predetermined": model().mode === "predetermined" }}
                >
                    <For each={model().targets}>
                        {(target) => (
                            <TargetCard
                                disabled={!model().available}
                                mode={model().mode}
                                target={target}
                                selected={target.target !== null && selectedTargets().includes(target.target)}
                                onSelect={target.valid && target.target
                                    ? () => selectTarget(target.target as EntityId)
                                    : undefined}
                            />
                        )}
                    </For>
                </div>
                <Show when={model().actionEffects.length > 0 || model().actionEffectGroups.length > 0}>
                    <section class="kcq-targeting__action-effects" aria-labelledby="targeting-action-effects-heading">
                        <h2 id="targeting-action-effects-heading">{model().labels.actionEffects}</h2>
                        <For each={model().actionEffectGroups}>
                            {(group) => (
                                <div class="kcq-targeting__action-effect-group">
                                    <h3>{group.name}</h3>
                                    <For each={group.effects}>
                                        {(effect) => <EffectPreview effect={effect} />}
                                    </For>
                                </div>
                            )}
                        </For>
                        <For each={model().actionEffects}>
                            {(effect) => <EffectPreview effect={effect} />}
                        </For>
                    </section>
                </Show>
            </div>
            <footer class="kcq-targeting__footer">
                <button
                    type="button"
                    class="kcq-targeting__back"
                    onClick={() => props.onBack?.()}
                >
                    <span aria-hidden="true">↶</span> {model().controls.backLabel}
                </button>
                <button
                    type="button"
                    class="kcq-targeting__execute"
                    disabled={!ready()}
                    onClick={() => {
                        if (ready()) props.onExecute?.(selectedTargets());
                    }}
                >
                    {model().controls.executeLabel} <span aria-hidden="true">▶</span>
                </button>
            </footer>
        </section>
    );
}
