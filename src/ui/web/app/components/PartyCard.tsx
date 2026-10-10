import { For, Show, type JSX } from "solid-js";
import { reactionRef } from "../combatReactions";
import { BindingMeter } from "./BindingMeter";
import type { PartyCardData } from "./componentTypes";
import { Shortcut } from "./Shortcut";
import { StatusChip } from "./StatusChip";

export type { PartyCardData } from "./componentTypes";

export interface PartyCardProps {
    character: PartyCardData;
    onSelect?: () => void;
    shortcut?: string;
}

export function PartyCard(props: PartyCardProps): JSX.Element {
    const actorReaction = reactionRef("actor", () => props.character.id);
    const cardReaction = (element: HTMLElement) => { actorReaction(element); };
    const interactive = (): boolean => props.onSelect !== undefined;

    return (
        <article
            class="kcq-party-card kcq-shortcut-host"
            classList={{ "kcq-party-card--ready": props.character.actionState.kind === "ready" }}
            data-kcq-shortcut={interactive() ? props.shortcut : undefined}
            aria-label={props.character.name}
            role={interactive() ? "button" : undefined}
            tabIndex={interactive() ? 0 : undefined}
            onClick={() => props.onSelect?.()}
            onKeyDown={(event) => {
                if (interactive() && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    props.onSelect?.();
                }
            }}
        >
            <Shortcut shortcut={props.shortcut} />
            <header class="kcq-party-card__header">
                <div class="kcq-party-card__identity">
                    <h3 class="kcq-party-card__name" classList={{ [`kcq-player-identity--${props.character.tone}`]: true }} title={props.character.name}>
                        {props.character.name}
                    </h3>
                    <Show when={props.character.resourceLabel !== undefined}>
                        <span class="kcq-party-card__resource kcq-subspace-value">
                            {props.character.resourceLabel}
                        </span>
                    </Show>
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
                <For each={props.character.bindings.map(binding => binding.id)}>
                    {id => {
                        const binding = () => props.character.bindings.find(binding => binding.id === id)!;
                        return <BindingMeter
                            entityId={props.character.id} bindingId={id}
                            value={binding().current}
                            change={binding().change}
                            peak={binding().peak}
                            max={binding().max}
                            level={binding().level}
                            resultLevel={binding().resultLevel}
                            ariaLabel={binding().label}
                        />;
                    }}
                </For>
            </div>
            <div class="kcq-party-card__effects" aria-label={props.character.accessibility.effectsLabel}>
                <For each={props.character.visibleEffects.map((effect, index) => effect.id ?? String(index))}>
                    {id => {
                        const effect = () => props.character.visibleEffects.find((effect, index) => (effect.id ?? String(index)) === id)!;
                        return <StatusChip tone="neutral" glowTone={effect().tone} duration={effect().duration}
                            entityId={props.character.id} buffId={effect().id}>
                            {effect().name}
                        </StatusChip>;
                    }}
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
