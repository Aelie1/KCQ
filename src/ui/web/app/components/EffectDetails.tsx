import { For, Show, type JSX } from "solid-js";
import type { EffectDetailViewModel } from "../viewModels/characterDetails";
import { reactionRef } from "../combatReactions";
import { LinkedEntityChip } from "./LinkedEntityChip";
import { StatusChip } from "./StatusChip";

export function EffectDetails(props: { effects: readonly EffectDetailViewModel[]; entityId?: string }): JSX.Element {
    return (
        <div class="kcq-character-effects__list">
            <For each={props.effects.map(effect => effect.id)}>
                {id => {
                    const effect = () => props.effects.find(effect => effect.id === id)!;
                    return (
                        <div ref={reactionRef("buff", () => props.entityId, () => id)} class="kcq-character-effect">
                            <span class="kcq-character-effect__name">{effect().name}</span>
                            <span class="kcq-character-effect__details">
                                <Show when={effect().linkedEntity} keyed>
                                    {(link) => <LinkedEntityChip link={link} />}
                                </Show>
                                <For each={effect().details}>
                                    {(detail) => <StatusChip size="compact" tone={detail.tone}>{detail.label}</StatusChip>}
                                </For>
                            </span>
                        </div>
                    );
                }}
            </For>
        </div>
    );
}
