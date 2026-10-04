import { For, Show, type JSX } from "solid-js";
import type { EntityId } from "../../../../engine/public/types";
import type { CharacterDetailsViewModel } from "../viewModels/characterDetails";
import { ModifierMeter } from "./ModifierMeter";
import { LinkedEntityChip } from "./LinkedEntityChip";
import { StatusChip } from "./StatusChip";

export interface CharacterDetailsLayoutProps {
    actionRegion: JSX.Element;
    model: CharacterDetailsViewModel;
    onHeaderBack?: () => void;
    onSelectCharacter?: (id: EntityId) => void;
}

export function CharacterDetailsLayout(props: CharacterDetailsLayoutProps): JSX.Element {
    return (
        <section class="kcq-character-details" aria-label={props.model.focused.name}>
            <header class="kcq-character-details__header">
                <button
                    class="kcq-character-details__header-back"
                    type="button"
                    aria-label={props.model.controls.backLabel}
                    onClick={() => props.onHeaderBack?.()}
                >
                    <span aria-hidden="true">←</span>
                </button>
                <div class="kcq-character-details__title">
                    <h1>{props.model.header.encounterLabel}</h1>
                    <p>{props.model.header.subtitle}</p>
                </div>
                <div class="kcq-character-details__turn">
                    <p>{props.model.header.roundLabel}</p>
                    <p>{props.model.header.phaseLabel}</p>
                </div>
            </header>

            <nav class="kcq-character-roster" aria-label={props.model.labels.rosterLabel}>
                <For each={props.model.roster}>
                    {(character) => (
                        <button
                            class="kcq-character-roster__card"
                            classList={{
                                "kcq-character-roster__card--focused": character.focused,
                                "kcq-character-roster__card--disabled": character.actionState.kind === "incapacitated",
                            }}
                            type="button"
                            aria-pressed={character.focused}
                            onClick={() => props.onSelectCharacter?.(character.id)}
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
                    {props.model.focused.initial}
                </span>
                <h2>{props.model.focused.name}</h2>
                <StatusChip tone={props.model.focused.actionState.tone}>
                    {props.model.focused.actionState.label}
                </StatusChip>
                <StatusChip tone={props.model.focused.stanceState.tone}>
                    {props.model.focused.stanceState.label}
                </StatusChip>
            </article>

            <section class="kcq-character-section kcq-character-capabilities" aria-labelledby="character-status-heading">
                <h2 id="character-status-heading">{props.model.labels.statusHeading}</h2>
                <div class="kcq-character-capabilities__columns">
                    <div>
                        <For each={props.model.focused.modifiers.left}>
                            {(metric) => <ModifierMeter metric={metric} />}
                        </For>
                    </div>
                    <div>
                        <For each={props.model.focused.modifiers.right}>
                            {(metric) => <ModifierMeter metric={metric} />}
                        </For>
                    </div>
                </div>
            </section>

            <section class="kcq-character-section kcq-character-bindings" aria-labelledby="character-bindings-heading">
                <h2 id="character-bindings-heading">{props.model.labels.bindingsHeading}</h2>
                <div class="kcq-character-bindings__list">
                    <For each={props.model.focused.bindings}>
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
                                    <span style={{ width: `${binding.fillPercent}%` }} />
                                </div>
                            </div>
                        )}
                    </For>
                </div>
            </section>

            <section class="kcq-character-section kcq-character-effects" aria-labelledby="character-effects-heading">
                <h2 id="character-effects-heading">{props.model.labels.effectsHeading}</h2>
                <div class="kcq-character-effects__list">
                    <For each={props.model.focused.effects}>
                        {(effect) => (
                            <div class="kcq-character-effect">
                                <span class="kcq-character-effect__name">{effect.name}</span>
                                <span class="kcq-character-effect__details">
                                    <Show when={effect.linkedEntity} keyed>
                                        {(link) => <LinkedEntityChip link={link} />}
                                    </Show>
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
                    <Show when={props.model.focused.effects.length === 0}>
                        <p class="kcq-character-effects__empty">{props.model.labels.effectsEmpty}</p>
                    </Show>
                </div>
            </section>

            {props.actionRegion}
        </section>
    );
}
