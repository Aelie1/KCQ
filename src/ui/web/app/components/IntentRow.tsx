import { Show, type JSX } from "solid-js";
import type { IntentRowData } from "./componentTypes";
import { StatusChip } from "./StatusChip";

export type { IntentOutcome, IntentRowData } from "./componentTypes";

export interface IntentRowProps {
    intent: IntentRowData;
}

export function IntentRow(props: IntentRowProps): JSX.Element {
    return (
        <div
            class="kcq-intent-row"
            classList={{ "kcq-intent-row--move-only": !props.intent.targetLabel && !props.intent.outcome }}
        >
            <span class="kcq-intent-row__move" title={props.intent.moveLabel}>
                {props.intent.moveLabel}
            </span>
            <Show when={props.intent.targetLabel}>
                {(target) => (
                    <>
                        <span class="kcq-intent-row__arrow" aria-hidden="true">→</span>
                        <span class="kcq-intent-row__target" title={target()}>{target()}</span>
                    </>
                )}
            </Show>
            <Show when={props.intent.outcome}>
                {(_outcome) => (
                    <StatusChip tone="outcome" size="compact">
                        {props.intent.outcomeLabel}
                    </StatusChip>
                )}
            </Show>
        </div>
    );
}
