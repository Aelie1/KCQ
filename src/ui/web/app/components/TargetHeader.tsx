import { For, Show, type JSX } from "solid-js";
import type { TargetPreviewViewModel } from "../viewModels/targeting";
import { LinkedEntityChip } from "./LinkedEntityChip";

export interface TargetHeaderProps {
    target: TargetPreviewViewModel;
}

export function TargetHeader(props: TargetHeaderProps): JSX.Element {
    return (
        <div class="kcq-target-header">
            <strong
                class="kcq-target-header__name"
                classList={{ [`kcq-player-identity--${props.target.tone}`]: true }}
                title={props.target.name}
            >
                {props.target.name}
            </strong>
            <For each={props.target.linkedEntities}>
                {(link) => <LinkedEntityChip link={link} iconOnly />}
            </For>
            <Show when={props.target.health} keyed>
                {(health) => (
                    <>
                        <span class="kcq-target-header__meter" aria-hidden="true">
                            <span style={{ width: `${health.fillPercent}%` }} />
                        </span>
                        <span class="kcq-target-header__value">{health.currentLabel}</span>
                    </>
                )}
            </Show>
            <Show when={props.target.characterSummary}>
                <span class="kcq-target-header__character-state">
                    {props.target.characterSummary}
                </span>
            </Show>
        </div>
    );
}
