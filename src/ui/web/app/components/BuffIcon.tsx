import { Match, Switch, type JSX } from "solid-js";
import type { Buff } from "../../../../engine/public/types";

/** Shared icon artwork for duration pips and permanent buff indicators. */
export function BuffIcon(props: { icon: NonNullable<Buff["icon"]> }): JSX.Element {
    return (
        <svg class="kcq-duration-pips__icon" data-icon={props.icon} aria-hidden="true"
            viewBox="0 0 24 24" preserveAspectRatio="none"
            fill="none" stroke="currentColor" stroke-width="1.5"
            stroke-linecap="round" stroke-linejoin="round">
            <Switch>
                <Match when={props.icon === "shield"}>
                    <path d="M12 3 3 7v5c0 5 5 8 9 10 4-2 9-5 9-10V7Z" />
                </Match>
                <Match when={props.icon === "sword"}>
                    <path d="m14 5 7-2-2 7-9 9-5-5ZM3 21l4-4M3 12l9 9" />
                </Match>
                <Match when={props.icon === "shield-off"}>
                    <path d="m9 4 3-1 9 4v5c0 2-.8 3.8-2.1 5.3M5 5.9 3 7v5c0 5 5 8 9 10 1.6-.8 3.4-1.9 4.9-3.2M2 2l20 20" />
                </Match>
                <Match when={props.icon === "sword-off"}>
                    <path d="m14 5 7-2-2 7-9 9-5-5ZM3 21l4-4M3 12l9 9" />
                    <path d="M2 2 22 22" />
                </Match>
                <Match when={props.icon === "crown"}>
                    <path d="M3 7 7.5 11 12 4 16.5 11 21 7 18 15H6L3 7Z" />
                    <path d="M5 20h14" />
                </Match>
                <Match when={props.icon === "sun"}>
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M6.35 17.65l-1.42 1.42M19.07 4.93l-1.42 1.42" />
                </Match>
                <Match when={props.icon === "ambush"}>
                    <g transform="rotate(-18 6.5 12)">
                        <path d="M3.5 7a3 3 0 0 1 6 0c0 2-3 2.5-3 5" />
                        <path d="M6.5 17v.3" />
                    </g>
                    <g transform="rotate(18 17.5 12)">
                        <path d="M14.5 7a3 3 0 0 1 6 0c0 2-3 2.5-3 5" />
                        <path d="M17.5 17v.3" />
                    </g>
                </Match>
                <Match when={props.icon === "sprayer"}>
                    <path d="m4 4 2.5 2.5" />
                    <path d="M13.5 6.5a4.95 4.95 0 0 0-7 7" />
                    <path d="M15 5 5 15" />
                    <path d="M14 17v.01" />
                    <path d="M10 16v.01" />
                    <path d="M13 13v.01" />
                    <path d="M16 10v.01" />
                    <path d="M11 20v.01" />
                    <path d="M17 14v.01" />
                    <path d="M20 11v.01" />
                </Match>
                <Match when={props.icon === "regen"}>
                    <path d="M8 2h8v6h6v8h-6v6H8v-6H2V8h6V2Z" />
                </Match>
                <Match when={props.icon === "dormant"}>
                    <path d="M6 1H11L7 6H12" />
                    <path d="M16 8H22L17 14H23" />
                    <path d="M2 14H11L4 22H14" />
                </Match>
                <Match when={props.icon === "tutu"}>
                    <path d="M6.75 5 10 3 12 4.5 14 3 17.25 5 15.5 11.5h-7L6.75 5Z" />
                    <path d="M8.5 11.5Q4.75 11.5 2.5 15.5l2 1.25 2 1.25 2.75-.75L12 18.5l2.75-1.25 2.75.75 2-1.25 2-1.25q-2.25-4-6-4" />
                </Match>
                <Match when={props.icon === "collar"}>
                    <path d="M3 7Q12 3.5 21 7v7Q12 18.5 3 14V7Z" />
                    <path d="M3 8.5q9 4 18 0" />
                    <g class="kcq-buff-icon__collar-tag">
                        <circle cx="12" cy="14.75" r="3.1" />
                        <circle cx="12" cy="14.75" r=".65" />
                        <path d="M12 15.4v2.1" />
                    </g>
                </Match>
            </Switch>
        </svg>
    );
}
