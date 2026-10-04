import type { JSX } from "solid-js";
import type { LinkedEntityViewModel } from "../viewModels/linkedEntities";

export interface LinkedEntityChipProps {
    iconOnly?: boolean;
    link: LinkedEntityViewModel;
}

export function LinkedEntityChip(props: LinkedEntityChipProps): JSX.Element {
    return (
        <span
            class="kcq-linked-entity-chip"
            classList={{
                [`kcq-linked-entity-chip--${props.link.tone}`]: true,
                "kcq-linked-entity-chip--icon-only": props.iconOnly,
            }}
            aria-label={props.iconOnly ? props.link.accessibleLabel : undefined}
            title={props.iconOnly ? props.link.accessibleLabel : undefined}
        >
            <svg
                class="kcq-linked-entity-chip__icon"
                viewBox="0 0 16 16"
                aria-hidden="true"
            >
                <path
                    d="M6.2 10.8 4.8 12.2a2.1 2.1 0 0 1-3-3l2.4-2.4a2.1 2.1 0 0 1 3 0M9.8 5.2l1.4-1.4a2.1 2.1 0 0 1 3 3l-2.4 2.4a2.1 2.1 0 0 1-3 0M5.7 10.3l4.6-4.6"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-width="1.6"
                />
            </svg>
            {!props.iconOnly && <span>{props.link.name}</span>}
        </span>
    );
}
