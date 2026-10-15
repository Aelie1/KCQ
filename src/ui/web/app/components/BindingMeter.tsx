import { createMemo, For, useContext, type JSX } from "solid-js";
import type { BindingLevel } from "../../../../engine/public/types";
import { CombatReactionsContext, HP_FLOAT_DURATION } from "../combatReactions";
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
            const delay = `${-Math.max(0, Date.now() - cue.started)}ms`;
            return <span class="kcq-binding-float" data-combat-reaction={cue.treatment}
                style={{
                    animation: `kcq-react-hp-float ${HP_FLOAT_DURATION}ms ease-out ${delay} forwards`,
                    "--kcq-binding-float-delay": delay,
                    "--float-x": `${cue.serial % 3 * 8 - 8}px`,
                }} aria-hidden="true">
                {change > 0 ? "+" : "−"}{Math.abs(change)}
            </span>;
        }}</For>
    </ProjectedMeter>;
}
