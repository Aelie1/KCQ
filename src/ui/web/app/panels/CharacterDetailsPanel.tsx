import { createMemo, For, type JSX } from "solid-js";
import type {
    ActionView,
    EntityId,
    GameState,
    ThresholdInfo,
} from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
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
                        <h2 id="character-commands-heading">{model().labels.commandsHeading}</h2>
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

                    <footer class="kcq-character-details__footer">
                        <button
                            type="button"
                            class="kcq-character-details__back"
                            onClick={() => props.onBack?.()}
                        >
                            <span aria-hidden="true">↶</span> {model().controls.backLabel}
                        </button>
                        <button type="button" class="kcq-character-details__select" disabled>
                            {model().controls.selectMoveLabel} <span aria-hidden="true">▶</span>
                        </button>
                    </footer>
                </>
            }
        />
    );
}
