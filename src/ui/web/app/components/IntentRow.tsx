import { Show, type JSX } from "solid-js";
import type { IntentOutcome, IntentRowData } from "./componentTypes";
import { StatusChip } from "./StatusChip";

export type { IntentOutcome, IntentRowData } from "./componentTypes";

export interface IntentRowProps {
    intent: IntentRowData;
}

const OUTCOME_LABELS: Record<IntentOutcome, string> = {
    miss: "Miss",
    graze: "Graze",
    hit: "Hit",
    crit: "Crit",
};

export function IntentRow(props: IntentRowProps): JSX.Element {
    return (
        <div
            class="kcq-intent-row"
            classList={{ "kcq-intent-row--move-only": !props.intent.target && !props.intent.outcome }}
        >
            <span class="kcq-intent-row__move" title={props.intent.move}>
                {props.intent.move}
            </span>
            <Show when={props.intent.target}>
                {(target) => (
                    <>
                        <span class="kcq-intent-row__arrow" aria-hidden="true">→</span>
                        <span class="kcq-intent-row__target" title={target()}>{target()}</span>
                    </>
                )}
            </Show>
            <Show when={props.intent.outcome}>
                {(outcome) => (
                    <StatusChip tone="outcome" size="compact">
                        {OUTCOME_LABELS[outcome()]}
                    </StatusChip>
                )}
            </Show>
        </div>
    );
}
