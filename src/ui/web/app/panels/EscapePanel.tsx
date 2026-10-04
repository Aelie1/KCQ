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

interface EscapeActionRegionProps {
    actions: readonly ActionView[];
    actorId: EntityId;
    initialSelectedEscape?: Pick<EscapeInfo, "binding" | "target">;
    presentation: Presentation;
    thresholds: ThresholdInfo;
    state: GameState;
    onBack?: () => void;
    onExecute?: (target: EntityId, binding: BindingId) => void;
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

    return (
        <CharacterDetailsLayout
            model={characterModel()}
            onHeaderBack={props.onHeaderBack}
            onSelectCharacter={props.onSelectCharacter}
            actionRegion={
                <EscapeActionRegion
                    actions={props.actions}
                    actorId={props.actorId}
                    initialSelectedEscape={props.initialSelectedEscape}
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

function EscapeActionRegion(props: EscapeActionRegionProps): JSX.Element {
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

    const execute = (): void => {
        const transition = beginEscapeExecution(selectedEscapeId(), actorAction().escapes);
        if (!transition.escape) return;
        setSelectedEscapeId(transition.selectedEscapeId);
        props.onExecute?.(transition.escape.target, transition.escape.binding);
    };

    return (
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
                                classList={{ "is-selected": group.selected }}
                                aria-label={group.name}
                            >
                                <header class="kcq-escape-group__header">
                                    <h2>{group.name}</h2>
                                    <p>{group.stateSummary}</p>
                                </header>
                                <div class="kcq-escape-group__choices">
                                    <For each={group.choices}>
                                        {(choice) => (
                                            <button
                                                type="button"
                                                class="kcq-escape-choice"
                                                classList={{
                                                    "is-selected": choice.selected,
                                                    "is-increase": (choice.projection?.amount ?? 0) > 0,
                                                    "is-display-only": choice.displayOnly,
                                                }}
                                                disabled={!choice.available}
                                                aria-pressed={choice.selected}
                                                title={choice.reasonLabel}
                                                onClick={() => {
                                                    if (!choice.displayOnly && choice.available) {
                                                        setSelectedEscapeId(choice.id);
                                                    }
                                                }}
                                            >
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
            <footer class="kcq-escape__footer">
                <button
                    type="button"
                    class="kcq-escape__back"
                    onClick={() => props.onBack?.()}
                >
                    <span aria-hidden="true">{"\u21b6"}</span> {model().controls.backLabel}
                </button>
                <button
                    type="button"
                    class="kcq-escape__execute"
                    disabled={!model().selectedEscapeId}
                    onClick={execute}
                >
                    {model().controls.executeLabel} <span aria-hidden="true">{"\u25b6"}</span>
                </button>
            </footer>
        </section>
    );
}
