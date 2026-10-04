import { For, Show, type JSX } from "solid-js";
import { BindingMetric } from "./BindingMetric";
import type { PartyCardData } from "./componentTypes";
import { StatusChip } from "./StatusChip";

export type { PartyCardData } from "./componentTypes";

export interface PartyCardProps {
    character: PartyCardData;
}

export function PartyCard(props: PartyCardProps): JSX.Element {
    return (
        <article class="kcq-party-card" aria-label={props.character.name}>
            <header class="kcq-party-card__header">
                <div class="kcq-party-card__identity">
                    <h3 class="kcq-party-card__name" title={props.character.name}>
                        {props.character.name}
                    </h3>
                    <StatusChip tone={props.character.actionState.tone}>
                        {props.character.actionState.label}
                    </StatusChip>
                    <StatusChip tone={props.character.stanceState.tone}>
                        {props.character.stanceState.label}
                    </StatusChip>
                </div>
                <div
                    class="kcq-party-card__capabilities"
                    aria-label={props.character.accessibility.blockedCapabilitiesLabel}
                >
                    <For each={props.character.blockedCapabilities}>
                        {(capability) => <StatusChip tone="danger">{capability.label}</StatusChip>}
                    </For>
                </div>
            </header>
            <div class="kcq-party-card__bindings" aria-label={props.character.accessibility.bindingsLabel}>
                <For each={props.character.bindings}>
                    {(binding) => <BindingMetric metric={binding} />}
                </For>
            </div>
            <div class="kcq-party-card__effects" aria-label={props.character.accessibility.effectsLabel}>
                <For each={props.character.visibleEffects}>
                    {(effect) => <StatusChip tone="neutral">{effect}</StatusChip>}
                </For>
                <Show when={props.character.hiddenEffectCount > 0}>
                    <StatusChip tone="neutral">{props.character.effectsOverflowLabel}</StatusChip>
                </Show>
                <Show when={props.character.effects.length === 0}>
                    <span class="kcq-party-card__no-effects">{props.character.noEffectsLabel}</span>
                </Show>
            </div>
        </article>
    );
}
