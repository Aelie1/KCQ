import { For, Show, type JSX } from "solid-js";
import type { Presentation } from "../../../presentation/presentation";
import type { CharacterDetailsViewModel } from "../viewModels/characterDetails";
import { CommandCard } from "./CommandCard";

export function CharacterCommands(props: {
    model: CharacterDetailsViewModel;
    presentation: Presentation;
    headingId?: string;
    shortcuts?: boolean;
    headerAction?: JSX.Element;
    onSelectCommand?: (commandId: string) => void;
}): JSX.Element {
    return (
        <section class="kcq-character-section kcq-character-commands" aria-labelledby={props.headingId ?? "character-commands-heading"}>
            <div class="kcq-character-commands__header">
                <h2 id={props.headingId ?? "character-commands-heading"}>
                    {props.model.labels.commandsHeading}
                </h2>

                <Show when={props.model.focused.resource} keyed>
                    {(resource) => (
                        <div class="kcq-character-commands__resource">
                            <span>{props.presentation.data("subspace")}</span>
                            <span class="kcq-subspace-meter">
                                <span
                                    style={{
                                        width: `${resource.current / resource.max * 100}%`,
                                    }}
                                />
                            </span>
                            <span>{resource.current}/{resource.max}</span>
                        </div>
                    )}
                </Show>
                {props.headerAction}
            </div>
            <div class="kcq-character-commands__grid">
                <For each={props.model.focused.commands}>
                    {(command) => (
                        <CommandCard
                            command={props.shortcuts === false ? { ...command, shortcutKey: undefined } : command}
                            onSelect={props.onSelectCommand
                                ? () => props.onSelectCommand?.(command.id)
                                : undefined}
                        />
                    )}
                </For>
            </div>
        </section>
    );
}
