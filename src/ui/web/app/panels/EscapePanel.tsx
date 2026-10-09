import { createEffect, createMemo, createSignal, For, Show, type JSX } from "solid-js";
import type {
    ActionView,
    BindingId,
    EntityId,
    EscapeInfo,
    GameState,
    ThresholdInfo,
} from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import { choiceShortcuts, COMBAT_SHORTCUTS } from "../keyboard";
import { Shortcut } from "../components/Shortcut";
import { CharacterDetailsLayout } from "../components/CharacterDetailsLayout";
import { SelectedCommandSummary } from "../components/SelectedCommandSummary";
import { createCharacterDetailsViewModel } from "../viewModels/characterDetails";
import {
    createEscapeViewModel,
    initialEscapeSelection,
    escapeChoiceId,
    sanitizeEscapeSelection,
} from "../viewModels/escape";

export interface EscapePanelProps {
    actions: readonly ActionView[];
    actorId: EntityId;
    initialSelectedEscape?: Pick<EscapeInfo, "binding" | "target">;
    presentation: Presentation;
    state: GameState;
    thresholds: ThresholdInfo;
    onBack?: () => void;
    onExecute?: (target: EntityId, binding: BindingId) => void;
    onHeaderBack?: () => void;
    onSelectCharacter?: (id: EntityId) => void;
}

export interface EscapeExecutionTransition {
    escape?: EscapeInfo;
    selectedEscapeId: undefined;
}

export function beginEscapeExecution(
    selectedEscapeId: string | undefined,
    escapes: readonly EscapeInfo[],
): EscapeExecutionTransition {
    const escape = selectedEscapeId
        ? escapes.find((candidate, index) => candidate.available
            && escapeChoiceId(candidate, index) === selectedEscapeId)
        : undefined;
    return { selectedEscapeId: undefined, ...(escape ? { escape } : {}) };
}

export function EscapePanel(props: EscapePanelProps): JSX.Element {
    const characterModel = createMemo(() => createCharacterDetailsViewModel(
        props.state,
        props.actions,
        props.actorId,
        props.thresholds,
        props.presentation,
    ));

    const actorAction = createMemo(() => {
        const action = props.actions.find(({ id }) => id === props.actorId);
        if (!action) {
            throw new Error(`Missing ActionView for escape actor ${props.actorId}.`);
        }
        return action;
    });
    const [selectedEscapeId, setSelectedEscapeId] = createSignal(initialEscapeSelection(
        actorAction().escapes,
        props.initialSelectedEscape,
    ));
    const model = createMemo(() => createEscapeViewModel(
        props.state,
        props.actions,
        props.actorId,
        props.thresholds,
        props.presentation,
        selectedEscapeId(),
    ));

    createEffect(() => {
        const sanitized = sanitizeEscapeSelection(selectedEscapeId(), actorAction().escapes);
        if (sanitized !== selectedEscapeId()) {
            setSelectedEscapeId(sanitized);
        }
    });

    const shortcuts = createMemo(() => choiceShortcuts(
        model().groups.flatMap(group => [...group.choices]),
        choice => choice.available && !choice.displayOnly,
    ));

    const execute = (): void => {
        const transition = beginEscapeExecution(selectedEscapeId(), actorAction().escapes);
        if (!transition.escape) return;
        setSelectedEscapeId(transition.selectedEscapeId);
        props.onExecute?.(transition.escape.target, transition.escape.binding);
    };

    return (
        <CharacterDetailsLayout
            model={characterModel()}
            contextLabel={props.presentation.ui("combatHeader.escape")}
            onHeaderBack={props.onHeaderBack}
            onSelectCharacter={props.onSelectCharacter}
            actionRegion={
                <section class="kcq-escape" aria-labelledby="escape-heading">
                    <div class="kcq-escape__panel">
                        <h1 id="escape-heading">{model().heading}</h1>
                        <SelectedCommandSummary
                            name={model().command.name}
                            tags={model().command.tags}
                        />
                        <div class="kcq-escape__groups">
                            <For each={model().groups}>
                                {(group) => (
                                    <section
                                        class="kcq-escape-group"
                                        aria-label={group.name}
                                    >
                                        <header class="kcq-escape-group__header">
                                            <h2 class={`kcq-player-identity--${group.tone}`}>{group.name}</h2>
                                            <p>{group.stateSummary}</p>
                                        </header>
                                        <div class="kcq-escape-group__choices">
                                            <For each={group.choices}>
                                                {(choice) => (
                                                    <button
                                                        type="button"
                                                        class="kcq-escape-choice kcq-shortcut-host"
                                                        classList={{
                                                            "is-selected": choice.selected,
                                                            "is-increase": (choice.projection?.amount ?? 0) > 0,
                                                            "is-display-only": choice.displayOnly,
                                                        }}
                                                        disabled={!choice.available}
                                                        data-kcq-shortcut={shortcuts().get(choice)}
                                                        aria-pressed={choice.selected}
                                                        title={choice.reasonLabel}
                                                        onClick={() => {
                                                            if (!choice.displayOnly && choice.available) {
                                                                setSelectedEscapeId(choice.id);
                                                            }
                                                        }}
                                                    >
                                                        <Shortcut shortcut={shortcuts().get(choice)} />
                                                        <span class="kcq-escape-choice__name">{choice.bindingName}</span>
                                                        <span class="kcq-escape-choice__value">
                                                            <span class={`kcq-escape-value--${choice.currentTone}`}>
                                                                {choice.currentValue}
                                                            </span>
                                                            <Show when={choice.projection} keyed>
                                                                {(projection) => (
                                                                    <>
                                                                        <span aria-hidden="true">{" \u2192 "}</span>
                                                                        <span class={`kcq-escape-value--${projection.tone}`}>
                                                                            {projection.projectedValue}
                                                                        </span>
                                                                    </>
                                                                )}
                                                            </Show>
                                                        </span>
                                                        <Show when={choice.reasonLabel} keyed>
                                                            {(reason) => (
                                                                <span class="kcq-escape-choice__reason">{reason}</span>
                                                            )}
                                                        </Show>
                                                    </button>
                                                )}
                                            </For>
                                        </div>
                                    </section>
                                )}
                            </For>
                        </div>
                    </div>
                </section>
            }
            footer={
                <footer class="kcq-screen-actions kcq-escape__footer">
                    <button
                        type="button"
                        class="kcq-escape__back kcq-shortcut-host"
                        onClick={() => props.onBack?.()}
                    >
                        <Shortcut shortcut={COMBAT_SHORTCUTS.back} /> <span aria-hidden="true">{"\u21b6"}</span> {model().controls.backLabel}
                    </button>
                    <button
                        type="button"
                        class="kcq-escape__execute kcq-shortcut-host"
                        data-kcq-shortcut={props.onExecute ? "enter" : undefined}
                        disabled={!model().selectedEscapeId}
                        onClick={execute}
                    >
                        <Shortcut shortcut="Enter" /> {model().controls.executeLabel} <span aria-hidden="true">{"\u25b6"}</span>
                    </button>
                </footer>
            }
        />
    );
}
