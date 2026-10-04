import { For, Show, type JSX } from "solid-js";
import type { MoveType } from "../../../../engine/public/types";
import { BindingMetric } from "./BindingMetric";
import type { PartyCardData, PartyCondition, StatusChipTone } from "./componentTypes";
import { StatusChip } from "./StatusChip";

export type { PartyCardCharacter, PartyCardData, PartyCondition } from "./componentTypes";

export interface PartyCardProps {
    character: PartyCardData;
}

const CAPABILITY_LABELS: Record<MoveType, string | undefined> = {
    arms: "Arms",
    mouth: "Mouth",
    legs: "Legs",
    none: undefined,
};

export function PartyCard(props: PartyCardProps): JSX.Element {
    const actionLabel = (): string => props.character.acted ? "Acted" : "Ready";
    const actionTone = (): StatusChipTone => props.character.acted ? "neutral" : "success";
    const stance = (): PartyCondition => props.character.condition ?? (
        props.character.standing
            ? { label: "Standing", tone: "warning" }
            : { label: "Moving", tone: "success" }
    );
    const blockedCapabilities = (): string[] => props.character.blockedMoveTypes
        .map((type) => CAPABILITY_LABELS[type])
        .filter((label): label is string => label !== undefined);

    return (
        <article class="kcq-party-card" aria-label={props.character.name}>
            <header class="kcq-party-card__header">
                <div class="kcq-party-card__identity">
                    <h3 class="kcq-party-card__name" title={props.character.name}>
                        {props.character.name}
                    </h3>
                    <StatusChip tone={actionTone()}>{actionLabel()}</StatusChip>
                    <StatusChip tone={stance().tone}>{stance().label}</StatusChip>
                </div>
                <div class="kcq-party-card__capabilities" aria-label="Blocked capabilities">
                    <For each={blockedCapabilities()}>
                        {(capability) => <StatusChip tone="danger">{capability}</StatusChip>}
                    </For>
                </div>
            </header>
            <div class="kcq-party-card__bindings" aria-label="Bindings">
                <For each={props.character.bindings}>
                    {(binding) => <BindingMetric metric={binding} />}
                </For>
            </div>
            <div class="kcq-party-card__effects" aria-label="Effects">
                <For each={props.character.visibleEffects}>
                    {(effect) => <StatusChip tone="neutral">{effect}</StatusChip>}
                </For>
                <Show when={props.character.visibleEffects.length === 0}>
                    <span class="kcq-party-card__no-effects">No effects</span>
                </Show>
            </div>
        </article>
    );
}
