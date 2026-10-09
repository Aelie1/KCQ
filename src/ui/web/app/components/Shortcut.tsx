import { Show, type JSX } from "solid-js";
import { shortcutBadgeLabel } from "../keyboard";

export function Shortcut(props: { shortcut?: string }): JSX.Element {
    return <Show when={props.shortcut} keyed>
        {key => <span class="kcq-shortcut" aria-hidden="true">{shortcutBadgeLabel(key)}</span>}
    </Show>;
}
