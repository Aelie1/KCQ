import { createMemo, createSignal, For, Show, type JSX } from "solid-js";
import type {
    ActionInfo,
    EntityId,
    GameState,
} from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import { EffectPreview } from "../components/EffectPreview";
import { SelectedCommandSummary } from "../components/SelectedCommandSummary";
import { TargetCard } from "../components/TargetCard";
import {
    createTargetingViewModel,
    isTargetingReady,
    sanitizeTargetSelection,
    toggleTargetSelection,
} from "../viewModels/targeting";

export interface TargetingPanelProps {
    action: ActionInfo;
    actorId: EntityId;
    initialSelectedTargetIds?: readonly EntityId[];
    presentation: Presentation;
    state: GameState;
}

export function TargetingPanel(props: TargetingPanelProps): JSX.Element {
    const model = createMemo(() => createTargetingViewModel(
        props.state,
        props.actorId,
        props.action,
        props.presentation,
    ));
    const [selectedTargets, setSelectedTargets] = createSignal(
        sanitizeTargetSelection(props.initialSelectedTargetIds ?? [], model()),
    );
    const ready = createMemo(() => isTargetingReady(model(), selectedTargets()));

    const selectTarget = (targetId: EntityId): void => {
        setSelectedTargets((selected) => toggleTargetSelection(
            selected,
            targetId,
            model().requiredTargetCount,
        ));
    };

    return (
        <section class="kcq-targeting" aria-labelledby="targeting-heading">
            <div class="kcq-targeting__panel">
                <h1 id="targeting-heading">{model().heading}</h1>
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
                <Show when={model().actionEffects.length > 0}>
                    <section class="kcq-targeting__action-effects" aria-labelledby="targeting-action-effects-heading">
                        <h2 id="targeting-action-effects-heading">{model().labels.actionEffects}</h2>
                        <For each={model().actionEffects}>
                            {(effect) => <EffectPreview effect={effect} />}
                        </For>
                    </section>
                </Show>
            </div>
            <footer class="kcq-targeting__footer">
                <button type="button" class="kcq-targeting__back">
                    <span aria-hidden="true">↶</span> {model().controls.backLabel}
                </button>
                <button
                    type="button"
                    class="kcq-targeting__execute"
                    disabled={!ready()}
                >
                    {model().controls.executeLabel} <span aria-hidden="true">▶</span>
                </button>
            </footer>
        </section>
    );
}
