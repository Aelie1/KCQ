import { For, Show, type JSX } from "solid-js";
import type { CommandCardViewModel } from "../viewModels/characterDetails";
import { CommandTag } from "./CommandTag";
import { Shortcut } from "./Shortcut";

export interface CommandCardProps {
    command: CommandCardViewModel;
    onSelect?: () => void;
}

export function CommandCard(props: CommandCardProps): JSX.Element {
    const cooldown = () => (props.command.cooldown?.value ?? 0) > 0
        ? props.command.cooldown
        : undefined;

    return (
        <button
            class="kcq-command-card kcq-shortcut-host"
            classList={{ "kcq-command-card--disabled": !props.command.available }}
            data-kcq-shortcut={props.onSelect ? props.command.shortcutKey : undefined}
            type="button"
            disabled={!props.command.available}
            onClick={() => props.onSelect?.()}
            aria-label={[props.command.name, props.command.reasonLabel, cooldown()?.accessibleLabel].filter(Boolean).join(": ")}
        >
            <Shortcut shortcut={props.command.shortcutKey} />
            <span class="kcq-command-card__heading">
                <span class="kcq-command-card__name">{props.command.name}</span>
                <Show when={cooldown()} keyed>
                    {(cooldown) => (
                        <span class="kcq-command-card__cooldown"
                            classList={{ "kcq-command-card__cooldown--active": cooldown.active }}
                            aria-hidden="true" title={cooldown.accessibleLabel}>
                            <svg class="kcq-command-card__cooldown-icon" viewBox="0 0 16 16"
                                fill="none" stroke="currentColor" stroke-width="1.5"
                                stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="8" cy="8" r="6" />
                                <path d="M8 4v4l2.5 1.5" />
                            </svg>
                            {cooldown.value}
                        </span>
                    )}
                </Show>
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
