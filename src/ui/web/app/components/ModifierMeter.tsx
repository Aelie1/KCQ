import type { JSX } from "solid-js";
import type { ModifierMeterViewModel } from "../viewModels/characterDetails";
import { PipMeter } from "./PipMeter";

export interface ModifierMeterProps {
    metric: ModifierMeterViewModel;
}

export function ModifierMeter(props: ModifierMeterProps): JSX.Element {
    return (
        <div class="kcq-modifier-meter">
            <span class="kcq-modifier-meter__label">{props.metric.label}</span>
            <PipMeter
                active={props.metric.value}
                blocked={props.metric.blocked}
                tone={props.metric.tone}
            />
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
