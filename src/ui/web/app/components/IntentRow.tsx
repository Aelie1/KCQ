import { For, Show, type JSX } from "solid-js";
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
            classList={{
                "kcq-intent-row--move-only": !props.intent.targetLabel && !props.intent.outcome,
                "kcq-intent-row--resolved": props.intent.resolved,
            }}
        >
            <span class="kcq-intent-row__content">
                <span class="kcq-intent-row__move" title={props.intent.moveLabel}>
                    {props.intent.moveLabel}
                </span>
                <Show when={props.intent.allTargetsLabel || (props.intent.targets?.length ?? 0) > 0}>
                    <span class="kcq-intent-row__target-group">
                        <span class="kcq-intent-row__arrow" aria-hidden="true">{"\u2192"}</span>
                        <span class="kcq-intent-row__targets" title={props.intent.targetLabel}>
                            <Show
                                when={props.intent.allTargetsLabel}
                                fallback={
                                    <For each={props.intent.targets}>
                                        {(target, index) => (
                                            <>
                                                {index() > 0 && <span class="kcq-intent-row__target-separator">, </span>}
                                                <span class={`kcq-intent-row__target kcq-intent-row__target--${target.tone}`}>
                                                    {target.label}
                                                </span>
                                            </>
                                        )}
                                    </For>
                                }
                            >
                                {(label) => <span class="kcq-intent-row__target-all">{label()}</span>}
                            </Show>
                        </span>
                    </span>
                </Show>
            </span>
            <Show when={props.intent.outcome}>
                {(outcome) => (
                    <StatusChip tone={`outcome-${outcome()}`} size="compact">
                        {props.intent.outcomeLabel}
                    </StatusChip>
                )}
            </Show>
        </div>
    );
}
