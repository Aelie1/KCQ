import type { JSX } from "solid-js";
import type { BindingLevel } from "../../../../engine/public/types";
import { ProjectedMeter } from "./ProjectedMeter";

export interface BindingMeterProps {
    value: number;
    change?: number;
    peak?: number;
    max: number;
    level: BindingLevel;
    resultLevel?: BindingLevel;
    size?: "compact" | "standard";
    ariaLabel?: string;
}


export function BindingMeter(props: BindingMeterProps): JSX.Element {
    return <ProjectedMeter
        value={props.value}
        change={props.change}
        peak={props.peak}
        max={props.max}
        tone={props.level}
        resultTone={props.resultLevel}
        size={props.size}
        ariaLabel={props.ariaLabel}
        classPrefix="kcq-binding-meter"
    />;
}
