import { For, Show, type JSX } from "solid-js";
import type { EffectDetailViewModel } from "../viewModels/characterDetails";
import { LinkedEntityChip } from "./LinkedEntityChip";
import { StatusChip } from "./StatusChip";

export function EffectDetails(props: { effects: readonly EffectDetailViewModel[] }): JSX.Element {
    return (
        <div class="kcq-character-effects__list">
            <For each={props.effects}>
                {(effect) => (
                    <div class="kcq-character-effect">
                        <span class="kcq-character-effect__name">{effect.name}</span>
                        <span class="kcq-character-effect__details">
                            <Show when={effect.linkedEntity} keyed>
                                {(link) => <LinkedEntityChip link={link} />}
                            </Show>
                            <For each={effect.details}>
                                {(detail) => <StatusChip size="compact" tone={detail.tone}>{detail.label}</StatusChip>}
                            </For>
                        </span>
                    </div>
                )}
            </For>
        </div>
    );
}
