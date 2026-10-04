import { For, type JSX } from "solid-js";
import type { ModifierMeterViewModel } from "../viewModels/characterDetails";

export interface ModifierMeterProps {
    metric: ModifierMeterViewModel;
}

const SEGMENTS = Array.from({ length: 8 }, (_, index) => index);

export function ModifierMeter(props: ModifierMeterProps): JSX.Element {
    const activeSegments = (): number => Math.min(SEGMENTS.length, Math.abs(props.metric.value));

    return (
        <div class="kcq-modifier-meter">
            <span class="kcq-modifier-meter__label">{props.metric.label}</span>
            <span
                class="kcq-modifier-meter__visual"
                classList={{ "kcq-modifier-meter__visual--blocked": props.metric.blocked }}
                aria-hidden="true"
            >
                <For each={SEGMENTS}>
                    {(segment) => (
                        <span
                            class="kcq-modifier-meter__segment"
                            classList={{
                                "kcq-modifier-meter__segment--active": segment >= SEGMENTS.length - activeSegments(),
                                "kcq-modifier-meter__segment--danger": props.metric.tone === "danger",
                                "kcq-modifier-meter__segment--success": props.metric.tone === "success",
                            }}
                        />
                    )}
                </For>
            </span>
            <span
                class="kcq-modifier-meter__value"
                classList={{
                    "kcq-modifier-meter__value--danger": props.metric.tone === "danger",
                    "kcq-modifier-meter__value--success": props.metric.tone === "success",
                }}
            >
                {props.metric.valueLabel}
            </span>
        </div>
    );
}
