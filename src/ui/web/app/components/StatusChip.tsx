import { Show, type JSX } from "solid-js";
import { DurationPips } from "./DurationPips";
import type { StatusChipSize, StatusChipTone } from "./componentTypes";

export type { StatusChipSize, StatusChipTone } from "./componentTypes";

export interface StatusChipProps {
    children: JSX.Element;
    size?: StatusChipSize;
    tone?: StatusChipTone;
    duration?: number;
}

export function StatusChip(props: StatusChipProps): JSX.Element {
    return (
        <span
            class="kcq-status-chip"
            classList={{
                [`kcq-status-chip--${props.tone ?? "neutral"}`]: true,
                [`kcq-status-chip--${props.size ?? "standard"}`]: true,
                "kcq-status-chip--timed": (props.duration ?? 0) > 0,
            }}
        >
            {props.children}
            <Show when={(props.duration ?? 0) > 0}>
                <DurationPips class="kcq-status-chip__duration" duration={props.duration ?? 0} />
            </Show>
        </span>
    );
}
