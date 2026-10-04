import { For, type JSX } from "solid-js";
import type { DamageProfileViewModel } from "../viewModels/targeting";

export interface DamageEffectProps {
    effect: DamageProfileViewModel;
}

export function DamageEffect(props: DamageEffectProps): JSX.Element {
    return (
        <div class="kcq-preview-effect kcq-preview-effect--danger">
            <span class="kcq-preview-effect__accent" aria-hidden="true" />
            <span class="kcq-preview-effect__tag">{props.effect.label}</span>
            <div class="kcq-damage-profile">
                <For each={props.effect.bands}>
                    {(band) => (
                        <span
                            class="kcq-damage-profile__band"
                            classList={{ "is-zero": band.zero }}
                        >
                            <span>{band.chanceLabel}</span>
                            <strong classList={{ "is-emphasized": band.emphasized }}>
                                {band.rangeLabel}
                            </strong>
                        </span>
                    )}
                </For>
            </div>
        </div>
    );
}
