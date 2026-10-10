import { useContext, type JSX } from "solid-js";
import type { BindingLevel } from "../../../../engine/public/types";
import { CombatReactionsContext } from "../combatReactions";
import { ProjectedMeter } from "./ProjectedMeter";

export interface BindingMeterProps {
    entityId?: string;
    bindingId?: string;
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
    const reactions = useContext(CombatReactionsContext);
    return <ProjectedMeter
        reactions={reactions?.matching("binding", props.entityId, props.bindingId)}
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
