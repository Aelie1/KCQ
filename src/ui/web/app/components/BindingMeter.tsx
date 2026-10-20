import { createMemo, For, Show, useContext, type JSX } from "solid-js";
import { getThresholds } from "../../../../engine/public/mechanics";
import type { BindingLevel, ThresholdInfo } from "../../../../engine/public/types";
import { CombatReactionsContext, floatingNumberStyle } from "../combatReactions";
import { ResponsiveLayoutContext } from "../responsiveScale";
import { bindingLevelAtValue } from "../viewModels/presentationHelpers";
import { ViewPreferencesContext } from "../viewPreferences";
import { ProjectedMeter } from "./ProjectedMeter";

export interface BindingMeterProps {
    description?: string;
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
    thresholds?: ThresholdInfo;
}


export function BindingMeter(props: BindingMeterProps): JSX.Element {
    const reactions = useContext(CombatReactionsContext);
    const preferences = useContext(ViewPreferencesContext);
    const layout = useContext(ResponsiveLayoutContext);
    const descriptionsEnabled = () => preferences?.bindingDescriptions === "on"
        || ((preferences?.bindingDescriptions ?? "auto") === "auto" && layout?.().size !== "narrow");
    const showDescription = () => props.level !== "none" && props.description?.trim() && descriptionsEnabled();
    const cues = createMemo(() => reactions?.matching("binding", props.entityId, props.bindingId));
    return <><ProjectedMeter
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
                const level = bindingLevelAtValue(cue.to!, props.thresholds ?? getThresholds());
                // Capture timing once per cue, just like the independent glow segments.
                const style = floatingNumberStyle(cue);
                return <span class="kcq-binding-float" data-combat-reaction={cue.treatment}
                    data-binding-level={level}
                    data-hit-strength={change > 0 ? cue.strength : undefined}
                    style={style} aria-hidden="true">
                    {change > 0 ? "+" : "−"}{Math.abs(change)}
                    {change > 0 && cue.strength === "crit" ? "!" : ""}
                </span>;
            }}</For>
    </ProjectedMeter>
        <Show when={showDescription()}>
            <p class="kcq-binding-description">
                {props.description}
            </p>
        </Show>
    </>;
}
