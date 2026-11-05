import { createMemo, onMount, type JSX } from "solid-js";
import type { GameState } from "../../../../engine/public/types";
import type { ContentLibrary } from "../../../../engine/public/library";
import type { GameLogPresentationEntry } from "../../../presentation/gameLog";
import type { Presentation } from "../../../presentation/presentation";
import { COMBAT_SHORTCUTS } from "../keyboard";
import { ScreenLayout } from "../components/ScreenLayout";
import { CombatHeader } from "../components/CombatHeader";
import { createCombatHeaderViewModel } from "../viewModels/combatHeader";
import type { FullLogStyle } from "../gameLogMode";
import { FullGameLog } from "../components/FullGameLog";

export interface GameLogPanelProps {
    entries: readonly GameLogPresentationEntry[];
    presentation: Presentation;
    state: GameState;
    library?: ContentLibrary;
    onBack?: () => void;
    showBack?: boolean;
    focusBackOnMount?: boolean;
    style?: FullLogStyle;
}

export function GameLogPanel(props: GameLogPanelProps): JSX.Element {
    const header = createMemo(() => createCombatHeaderViewModel(props.state, props.presentation));
    const title = () => props.presentation.ui(props.style === "story" ? "gameLog.storyLog" : "combatHeader.gameLog");
    let content!: HTMLDivElement;
    onMount(() => {
        if (props.focusBackOnMount) content.closest(".kcq-screen-layout")?.querySelector<HTMLButtonElement>(".kcq-combat-header__back")?.focus();
    });

    return (
        <ScreenLayout class="kcq-game-log" ariaLabel={title()}
            header={
                <>
                    <CombatHeader
                        variant="subscreen"
                        encounterLabel={header().encounterLabel}
                        contextLabel={title()}
                        roundLabel={header().roundLabel}
                        phaseLabel={header().phaseLabel}
                        backLabel={props.presentation.ui("characterDetails.back")}
                        showBack={props.showBack}
                        backShortcut={COMBAT_SHORTCUTS.back}
                        onBack={props.onBack}
                    />
                </>
            }
            body={
                <div ref={content} class="kcq-game-log__histories">
                    <FullGameLog entries={props.entries} presentation={props.presentation} library={props.library}
                        party={props.state.characters.map(character => character.id)} style={props.style}
                        encounterId={props.state.encounter?.id} round={props.state.turn.round} />
                </div>
            }
        />
    );
}
