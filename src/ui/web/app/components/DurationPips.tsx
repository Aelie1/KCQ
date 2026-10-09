import { For, type JSX } from "solid-js";

/** One segment per remaining round, shared by status chips and enemy card borders. */
export function DurationPips(props: { duration: number; class?: string }): JSX.Element {
    return (
        <span class={"kcq-duration-pips " + (props.class ?? "")} aria-hidden="true">
            <For each={Array.from({ length: props.duration })}>
                {() => <span class="kcq-status-chip__segment" />}
            </For>
        </span>
    );
}
