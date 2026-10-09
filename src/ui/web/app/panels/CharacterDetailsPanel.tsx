import { createMemo, For, Show, type JSX } from "solid-js";
import type {
    ActionView,
    EntityId,
    GameState,
    ThresholdInfo,
} from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import { COMBAT_SHORTCUTS } from "../keyboard";
import { Shortcut } from "../components/Shortcut";
import { CharacterDetailsLayout } from "../components/CharacterDetailsLayout";
import { CommandCard } from "../components/CommandCard";
import { createCharacterDetailsViewModel } from "../viewModels/characterDetails";

export interface CharacterDetailsPanelProps {
    actions: readonly ActionView[];
    focusedCharacterId: EntityId;
    presentation: Presentation;
    state: GameState;
    thresholds: ThresholdInfo;
    onBack?: () => void;
    onSelectCharacter?: (id: EntityId) => void;
    onSelectCommand?: (commandId: string) => void;
}

export function CharacterDetailsPanel(props: CharacterDetailsPanelProps): JSX.Element {
    const model = createMemo(() => createCharacterDetailsViewModel(
        props.state,
        props.actions,
        props.focusedCharacterId,
        props.thresholds,
        props.presentation,
    ));

    return (
        <CharacterDetailsLayout
            model={model()}
            contextLabel={props.presentation.ui("combatHeader.character")}
            onHeaderBack={props.onBack}
            onSelectCharacter={props.onSelectCharacter}
            actionRegion={
                <>
                    <section class="kcq-character-section kcq-character-commands" aria-labelledby="character-commands-heading">
                        <div class="kcq-character-commands__header">
                            <h2 id="character-commands-heading">
                                {model().labels.commandsHeading}
                            </h2>

                            <Show when={model().focused.resource} keyed>
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
                        </div>
                        <div class="kcq-character-commands__grid">
                            <For each={model().focused.commands}>
                                {(command) => (
                                    <CommandCard
                                        command={command}
                                        onSelect={props.onSelectCommand
                                            ? () => props.onSelectCommand?.(command.id)
                                            : undefined}
                                    />
                                )}
                            </For>
                        </div>
                    </section>
                </>
            }
            footer={
                <footer class="kcq-screen-actions kcq-character-details__footer">
                    <button
                        type="button"
                        class="kcq-character-details__back kcq-shortcut-host"
                        onClick={() => props.onBack?.()}
                    >
                        <Shortcut shortcut={COMBAT_SHORTCUTS.back} /> <span aria-hidden="true">↶</span> {model().controls.backLabel}
                    </button>
                    <button type="button" class="kcq-character-details__select" disabled>
                        {model().controls.selectMoveLabel} <span aria-hidden="true">▶</span>
                    </button>
                </footer>
            }
        />
    );
}
