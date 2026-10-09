import { For, Show, type JSX } from "solid-js";
import type { TargetPreviewViewModel } from "../viewModels/targeting";
import { EffectPreview } from "./EffectPreview";
import { Shortcut } from "./Shortcut";
import { TargetHeader } from "./TargetHeader";

export interface TargetCardProps {
    disabled?: boolean;
    mode: "predetermined" | "selectable";
    onSelect?: () => void;
    selected: boolean;
    shortcut?: string;
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
                class="kcq-target-card kcq-target-card--selectable kcq-shortcut-host"
                classList={{
                    "is-invalid": !props.target.valid,
                    "is-selected": props.selected,
                }}
                type="button"
                disabled={props.disabled || !props.target.valid || props.target.target === null}
                data-kcq-shortcut={props.onSelect ? props.shortcut : undefined}
                aria-pressed={props.selected}
                onClick={() => props.onSelect?.()}
            >
                <Shortcut shortcut={props.shortcut} />
                <TargetCardContent target={props.target} />
            </button>
        </Show>
    );
}
