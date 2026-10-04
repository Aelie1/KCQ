import { For, Match, Switch, type JSX } from "solid-js";
import type { EffectPreviewViewModel } from "../viewModels/targeting";
import { DamageEffect } from "./DamageEffect";
import { StatusChip } from "./StatusChip";

export interface EffectPreviewProps {
    effect: EffectPreviewViewModel;
}

export function EffectPreview(props: EffectPreviewProps): JSX.Element {
    return (
        <Switch>
            <Match when={props.effect.kind === "damage-profile" && props.effect}>
                {(effect) => <DamageEffect effect={effect() as Extract<EffectPreviewViewModel, { kind: "damage-profile" }>} />}
            </Match>
            <Match when={props.effect.kind === "compact" && props.effect}>
                {(effect) => {
                    const compact = effect() as Extract<EffectPreviewViewModel, { kind: "compact" }>;
                    return (
                        <div
                            class="kcq-preview-effect"
                            classList={{ [`kcq-preview-effect--${compact.tone}`]: true }}
                        >
                            <span class="kcq-preview-effect__accent" aria-hidden="true" />
                            <span class="kcq-preview-effect__tag">{compact.label}</span>
                            <strong class="kcq-preview-effect__payload">{compact.payload}</strong>
                            <span class="kcq-preview-effect__details">
                                <For each={compact.details}>
                                    {(detail) => <StatusChip size="compact">{detail}</StatusChip>}
                                </For>
                            </span>
                        </div>
                    );
                }}
            </Match>
        </Switch>
    );
}
