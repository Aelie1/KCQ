import type { JSX } from "solid-js";
import type { CommandTagViewModel } from "../viewModels/characterDetails";

export interface CommandTagProps {
    tag: CommandTagViewModel;
}

export function CommandTag(props: CommandTagProps): JSX.Element {
    return (
        <>
            {props.tag.leadingSymbol && (
                <span class="kcq-command-tag__leading-symbol" aria-hidden="true">
                    {props.tag.leadingSymbol}
                </span>
            )}
            <span
                class="kcq-command-tag"
                classList={{ [`kcq-command-tag--${props.tag.tone}`]: true }}
            >
                {props.tag.label}
            </span>
        </>
    );
}
