import { For, Match, Show, Switch, type JSX } from "solid-js";
import type { Buff } from "../../../../engine/public/types";

/** One segment or icon per remaining round, shared by status chips and enemy card borders. */
export function DurationPips(props: { duration: number; icon?: Buff["icon"]; class?: string }): JSX.Element {
    return (
        <span class={"kcq-duration-pips " + (props.class ?? "")} aria-hidden="true">
            <For each={Array.from({ length: props.duration })}>
                {() => (
                    <Show when={props.icon} fallback={<span class="kcq-status-chip__segment" />}>
                        <svg class="kcq-duration-pips__icon" data-icon={props.icon}
                            viewBox="0 0 24 24" preserveAspectRatio="none"
                            fill="none" stroke="currentColor" stroke-width="1.5"
                            stroke-linecap="round" stroke-linejoin="round">
                            <Switch>
                                <Match when={props.icon === "shield"}>
                                    <path d="M12 3 3 7v5c0 5 5 8 9 10 4-2 9-5 9-10V7Z" />
                                </Match>
                                <Match when={props.icon === "sword"}>
                                    <path d="m14 5 7-2-2 7-9 9-5-5ZM3 21l4-4M3 12l9 9M9 15l7-7" />
                                </Match>
                                <Match when={props.icon === "shield-off"}>
                                    <path d="m9 4 3-1 9 4v5c0 2-.8 3.8-2.1 5.3M5 5.9 3 7v5c0 5 5 8 9 10 1.6-.8 3.4-1.9 4.9-3.2M2 2l20 20" />
                                </Match>
                                <Match when={props.icon === "crown"}>
                                    <path d="M2 18h20" />
                                    <path d="m2 8 6 4 4-8 4 8 6-4-2 12H4L2 8Z" />
                                </Match>
                                <Match when={props.icon === "sun"}>
                                    <circle cx="12" cy="12" r="4" />
                                    <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M6.35 17.65l-1.42 1.42M19.07 4.93l-1.42 1.42" />
                                </Match>
                            </Switch>
                        </svg>
                    </Show>
                )}
            </For>
        </span>
    );
}
