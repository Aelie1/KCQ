import type { JSX } from "solid-js";
import type { BindingLevel } from "../../../../engine/public/types";
import type { BindingMetricData } from "./componentTypes";

export type { BindingMetricData } from "./componentTypes";

export interface BindingMetricProps {
    metric: BindingMetricData;
}

const BINDING_TONE: Record<BindingLevel, string> = {
    none: "neutral",
    light: "light",
    moderate: "moderate",
    heavy: "heavy",
    severe: "severe",
    overwhelming: "impossible",
    max: "impossible",
};

export function BindingMetric(props: BindingMetricProps): JSX.Element {
    return (
        <span class="kcq-binding-metric">
            <span class="kcq-binding-metric__label">{props.metric.label}:</span>
            <span
                class="kcq-binding-metric__value"
                classList={{ [`kcq-binding-metric__value--${BINDING_TONE[props.metric.level]}`]: true }}
            >
                {props.metric.current}/{props.metric.max}
            </span>
        </span>
    );
}
