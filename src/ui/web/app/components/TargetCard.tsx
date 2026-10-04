import { For, Show, type JSX } from "solid-js";
import type { TargetPreviewViewModel } from "../viewModels/targeting";
import { EffectPreview } from "./EffectPreview";
import { TargetHeader } from "./TargetHeader";

export interface TargetCardProps {
    disabled?: boolean;
    mode: "predetermined" | "selectable";
    onSelect?: () => void;
    selected: boolean;
    target: TargetPreviewViewModel;
}

function TargetCardContent(props: { target: TargetPreviewViewModel }): JSX.Element {
    return (
        <>
            <TargetHeader target={props.target} />
            <Show when={props.target.reasonLabel}>
                <span class="kcq-target-card__reason">{props.target.reasonLabel}</span>
            </Show>
            <For each={props.target.effects}>
                {(effect) => <EffectPreview effect={effect} />}
            </For>
        </>
    );
}

export function TargetCard(props: TargetCardProps): JSX.Element {
    return (
        <Show
            when={props.mode === "selectable"}
            fallback={
                <div class="kcq-target-card kcq-target-card--predetermined">
                    <TargetCardContent target={props.target} />
                </div>
            }
        >
            <button
                class="kcq-target-card kcq-target-card--selectable"
                classList={{
                    "is-invalid": !props.target.valid,
                    "is-selected": props.selected,
                }}
                type="button"
                disabled={props.disabled || !props.target.valid || props.target.target === null}
                aria-pressed={props.selected}
                onClick={() => props.onSelect?.()}
            >
                <TargetCardContent target={props.target} />
            </button>
        </Show>
    );
}
