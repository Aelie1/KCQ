import { createMemo, type JSX } from "solid-js";
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
import { CharacterCommands } from "../components/CharacterCommands";
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
                    <CharacterCommands model={model()} presentation={props.presentation} onSelectCommand={props.onSelectCommand} />
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
