import { For, Show, type JSX } from "solid-js";
import type { Buff } from "../../../../engine/public/types";
import { BuffIcon } from "./BuffIcon";

/** One segment or icon per remaining round, shared by status chips and enemy card borders. */
export function DurationPips(props: { duration: number; icon?: Buff["icon"]; class?: string }): JSX.Element {
    return (
        <span class={"kcq-duration-pips " + (props.class ?? "")} aria-hidden="true">
            <For each={Array.from({ length: props.duration })}>
                {() => (
                    <Show when={props.icon} fallback={<span class="kcq-status-chip__segment" />}>
                        <BuffIcon icon={props.icon!} />
                    </Show>
                )}
            </For>
        </span>
    );
}
