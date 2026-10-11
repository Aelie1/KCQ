import type { JSX } from "solid-js";
import { BindingMeter } from "./BindingMeter";

/** An authored amount, not a projected combat state. Variable amounts stay unfilled. */
export function BindingAmountEffect(props: { label: string; name: JSX.Element; changeLabel: string; magnitude?: number; max: number; reduction?: boolean; ariaLabel: string }): JSX.Element {
    return <div class={"kcq-preview-effect kcq-binding-effect kcq-binding-amount-effect kcq-preview-effect--" + (props.reduction ? "success" : "warning")}>
        <span class="kcq-preview-effect__accent" aria-hidden="true" />
        <span class="kcq-preview-effect__tag">{props.label}</span>
        <div class="kcq-binding-effect__content">
            <div class="kcq-binding-effect__header"><strong class="kcq-preview-effect__payload">{props.name}</strong><strong class="kcq-binding-effect__transition">{props.changeLabel}</strong></div>
            <BindingMeter value={props.magnitude ?? 0} max={props.max} level="heavy" size="compact" ariaLabel={props.ariaLabel} />
        </div>
    </div>;
}
