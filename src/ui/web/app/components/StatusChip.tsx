import type { JSX } from "solid-js";
import type { StatusChipSize, StatusChipTone } from "./componentTypes";

export type { StatusChipSize, StatusChipTone } from "./componentTypes";

export interface StatusChipProps {
    children: JSX.Element;
    size?: StatusChipSize;
    tone?: StatusChipTone;
}

export function StatusChip(props: StatusChipProps): JSX.Element {
    return (
        <span
            class="kcq-status-chip"
            classList={{
                [`kcq-status-chip--${props.tone ?? "neutral"}`]: true,
                [`kcq-status-chip--${props.size ?? "standard"}`]: true,
            }}
        >
            {props.children}
        </span>
    );
}
