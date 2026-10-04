import { Show, type JSX } from "solid-js";
import type { TargetPreviewViewModel } from "../viewModels/targeting";

export interface TargetHeaderProps {
    target: TargetPreviewViewModel;
}

export function TargetHeader(props: TargetHeaderProps): JSX.Element {
    return (
        <div class="kcq-target-header">
            <strong>{props.target.name}</strong>
            <Show when={props.target.valueLabel}>
                <span class="kcq-target-header__meter" aria-hidden="true">
                    <span style={{ width: `${props.target.fillPercent ?? 0}%` }} />
                </span>
                <span class="kcq-target-header__value">{props.target.valueLabel}</span>
            </Show>
            <Show when={props.target.characterSummary}>
                <span class="kcq-target-header__character-state">
                    {props.target.characterSummary}
                </span>
            </Show>
        </div>
    );
}
