import { For, Show, type JSX } from "solid-js";
import type { CommandCardViewModel } from "../viewModels/characterDetails";
import { CommandTag } from "./CommandTag";

export interface CommandCardProps {
    command: CommandCardViewModel;
}

export function CommandCard(props: CommandCardProps): JSX.Element {
    return (
        <button
            class="kcq-command-card"
            classList={{ "kcq-command-card--disabled": !props.command.available }}
            type="button"
            disabled={!props.command.available}
            aria-label={props.command.reasonLabel
                ? `${props.command.name}: ${props.command.reasonLabel}`
                : props.command.name}
        >
            <span class="kcq-command-card__heading">
                <span class="kcq-command-card__shortcut">{props.command.shortcutLabel}</span>
                <span class="kcq-command-card__name">{props.command.name}</span>
            </span>
            <Show when={!props.command.available && props.command.reasonLabel}>
                <span class="kcq-command-card__reason">{props.command.reasonLabel}</span>
            </Show>
            <span class="kcq-command-card__tags">
                <For each={props.command.tags}>
                    {(tag) => <CommandTag tag={tag} />}
                </For>
            </span>
        </button>
    );
}
