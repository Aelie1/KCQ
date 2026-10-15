import { createMemo, For, useContext, type JSX } from "solid-js";
import type { BindingLevel } from "../../../../engine/public/types";
import { CombatReactionsContext, floatingNumberStyle } from "../combatReactions";
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
    floatingNumbers?: boolean;
}


export function BindingMeter(props: BindingMeterProps): JSX.Element {
    const reactions = useContext(CombatReactionsContext);
    const cues = createMemo(() => reactions?.matching("binding", props.entityId, props.bindingId));
    return <ProjectedMeter
        reactions={cues()}
        value={props.value}
        change={props.change}
        peak={props.peak}
        max={props.max}
        tone={props.level}
        resultTone={props.resultLevel}
        size={props.size}
        ariaLabel={props.ariaLabel}
        classPrefix="kcq-binding-meter"
    >
        <For each={props.floatingNumbers ? cues()?.filter(cue =>
            cue.from !== undefined && cue.to !== undefined && cue.to !== cue.from) : undefined}>{cue => {
            const change = cue.to! - cue.from!;
            // Capture timing once per cue, just like the independent glow segments.
            const style = floatingNumberStyle(cue);
            return <span class="kcq-binding-float" data-combat-reaction={cue.treatment}
                data-hit-strength={change > 0 ? cue.strength : undefined}
                style={style} aria-hidden="true">
                {change > 0 ? "+" : "−"}{Math.abs(change)}
                {change > 0 && cue.strength === "crit" ? "!" : ""}
            </span>;
        }}</For>
    </ProjectedMeter>;
}
