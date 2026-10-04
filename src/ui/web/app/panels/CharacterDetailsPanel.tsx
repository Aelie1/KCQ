import { createMemo, For, Show, type JSX } from "solid-js";
import type {
    ActionView,
    EntityId,
    GameState,
} from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import { CommandCard } from "../components/CommandCard";
import { ModifierMeter } from "../components/ModifierMeter";
import { StatusChip } from "../components/StatusChip";
import { createCharacterDetailsViewModel } from "../viewModels/characterDetails";

export interface CharacterDetailsPanelProps {
    actions: readonly ActionView[];
    focusedCharacterId: EntityId;
    presentation: Presentation;
    state: GameState;
}

export function CharacterDetailsPanel(props: CharacterDetailsPanelProps): JSX.Element {
    const model = createMemo(() => createCharacterDetailsViewModel(
        props.state,
        props.actions,
        props.focusedCharacterId,
        props.presentation,
    ));

    return (
        <section class="kcq-character-details" aria-label={model().focused.name}>
            <header class="kcq-character-details__header">
                <button
                    class="kcq-character-details__header-back"
                    type="button"
                    aria-label={model().controls.backLabel}
                >
                    <span aria-hidden="true">←</span>
                </button>
                <div class="kcq-character-details__title">
                    <h1>{model().header.encounterLabel}</h1>
                    <p>{model().header.subtitle}</p>
                </div>
                <div class="kcq-character-details__turn">
                    <p>{model().header.roundLabel}</p>
                    <p>{model().header.phaseLabel}</p>
                </div>
            </header>

            <nav class="kcq-character-roster" aria-label={model().labels.rosterLabel}>
                <For each={model().roster}>
                    {(character) => (
                        <button
                            class="kcq-character-roster__card"
                            classList={{
                                "kcq-character-roster__card--focused": character.focused,
                                "kcq-character-roster__card--disabled": character.actionState.kind === "incapacitated",
                            }}
                            type="button"
                            aria-pressed={character.focused}
                        >
                            <span class="kcq-character-roster__name">{character.name}</span>
                            <span
                                class="kcq-character-roster__state"
                                classList={{ [`kcq-character-roster__state--${character.actionState.tone}`]: true }}
                            >
                                {character.actionState.label}
                            </span>
                        </button>
                    )}
                </For>
            </nav>

            <article class="kcq-focused-character">
                <span class="kcq-focused-character__avatar" aria-hidden="true">
                    {model().focused.initial}
                </span>
                <h2>{model().focused.name}</h2>
                <StatusChip tone={model().focused.actionState.tone}>
                    {model().focused.actionState.label}
                </StatusChip>
                <StatusChip tone={model().focused.stanceState.tone}>
                    {model().focused.stanceState.label}
                </StatusChip>
            </article>

            <section class="kcq-character-section kcq-character-capabilities" aria-labelledby="character-status-heading">
                <h2 id="character-status-heading">{model().labels.statusHeading}</h2>
                <div class="kcq-character-capabilities__columns">
                    <div>
                        <For each={model().focused.modifiers.left}>
                            {(metric) => <ModifierMeter metric={metric} />}
                        </For>
                    </div>
                    <div>
                        <For each={model().focused.modifiers.right}>
                            {(metric) => <ModifierMeter metric={metric} />}
                        </For>
                    </div>
                </div>
            </section>

            <section class="kcq-character-section kcq-character-bindings" aria-labelledby="character-bindings-heading">
                <h2 id="character-bindings-heading">{model().labels.bindingsHeading}</h2>
                <div class="kcq-character-bindings__list">
                    <For each={model().focused.bindings}>
                        {(binding) => (
                            <div class="kcq-character-binding">
                                <div class="kcq-character-binding__summary">
                                    <span class="kcq-character-binding__name">{binding.name}</span>
                                    <span class="kcq-character-binding__statuses">
                                        <For each={binding.statusLabels}>
                                            {(status) => <StatusChip size="compact">{status}</StatusChip>}
                                        </For>
                                    </span>
                                    <span
                                        class="kcq-character-binding__level"
                                        classList={{ [`kcq-character-binding__level--${binding.level}`]: true }}
                                    >
                                        {binding.levelLabel}
                                    </span>
                                    <span class="kcq-character-binding__value">{binding.valueLabel}</span>
                                </div>
                                <div
                                    class="kcq-character-binding__bar"
                                    classList={{ [`kcq-character-binding__bar--${binding.level}`]: true }}
                                    aria-hidden="true"
                                >
                                    <span />
                                </div>
                            </div>
                        )}
                    </For>
                </div>
            </section>

            <section class="kcq-character-section kcq-character-effects" aria-labelledby="character-effects-heading">
                <h2 id="character-effects-heading">{model().labels.effectsHeading}</h2>
                <div class="kcq-character-effects__list">
                    <For each={model().focused.effects}>
                        {(effect) => (
                            <div class="kcq-character-effect">
                                <span class="kcq-character-effect__name">{effect.name}</span>
                                <span class="kcq-character-effect__details">
                                    <For each={effect.details}>
                                        {(detail) => (
                                            <StatusChip size="compact" tone={detail.tone}>
                                                {detail.label}
                                            </StatusChip>
                                        )}
                                    </For>
                                </span>
                            </div>
                        )}
                    </For>
                    <Show when={model().focused.effects.length === 0}>
                        <p class="kcq-character-effects__empty">{model().labels.effectsEmpty}</p>
                    </Show>
                </div>
            </section>

            <section class="kcq-character-section kcq-character-commands" aria-labelledby="character-commands-heading">
                <h2 id="character-commands-heading">{model().labels.commandsHeading}</h2>
                <div class="kcq-character-commands__grid">
                    <For each={model().focused.commands}>
                        {(command) => <CommandCard command={command} />}
                    </For>
                </div>
            </section>

            <footer class="kcq-character-details__footer">
                <button type="button" class="kcq-character-details__back">
                    <span aria-hidden="true">↶</span> {model().controls.backLabel}
                </button>
                <button type="button" class="kcq-character-details__select" disabled>
                    {model().controls.selectMoveLabel} <span aria-hidden="true">▶</span>
                </button>
            </footer>
        </section>
    );
}
