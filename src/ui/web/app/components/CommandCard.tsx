import { For, Show, type JSX } from "solid-js";
import type { CommandCardViewModel } from "../viewModels/characterDetails";
import { Shortcut } from "./Shortcut";
import { CommandTag } from "./CommandTag";

export interface CommandCardProps {
    command: CommandCardViewModel;
    onSelect?: () => void;
}

export function CommandCard(props: CommandCardProps): JSX.Element {
    return (
        <button
            class="kcq-command-card kcq-shortcut-host"
            classList={{ "kcq-command-card--disabled": !props.command.available }}
            data-kcq-shortcut={props.onSelect ? props.command.shortcutKey : undefined}
            type="button"
            disabled={!props.command.available}
            onClick={() => props.onSelect?.()}
            aria-label={[props.command.name, props.command.stanceTransition, props.command.reasonLabel].filter(Boolean).join(": ")}
        >
            <Shortcut shortcut={props.command.shortcutKey} />
            <span class="kcq-command-card__heading">
                <span class="kcq-command-card__name">{props.command.name}</span>
                <Show when={props.command.stanceTransition}><span class="kcq-command-card__stance">{props.command.stanceTransition}</span></Show>
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
