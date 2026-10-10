import { createMemo, For, type JSX } from "solid-js";
import type {
    ActionView,
    EntityId,
    GameState,
    ThresholdInfo,
} from "../../../../engine/public/types";
import type { GameLogPresentationEntry } from "../../../presentation/gameLog";
import type { Presentation } from "../../../presentation/presentation";
import { combatShortcut, COMBAT_SHORTCUTS } from "../keyboard";
import { Shortcut } from "../components/Shortcut";
import { ScreenLayout } from "../components/ScreenLayout";
import { CombatHeader } from "../components/CombatHeader";
import { CompactGameLog } from "../components/CompactGameLog";
import { DEFAULT_OVERVIEW_GAME_LOG_LINES } from "../overviewGameLogLines";
import { EnemyCard } from "../components/EnemyCard";
import { PartyCard } from "../components/PartyCard";
import { createBattleOverviewViewModel } from "../viewModels/battleOverview";

export interface BattleOverviewPanelProps {
    actions: readonly ActionView[];
    presentation: Presentation;
    state: GameState;
    thresholds: ThresholdInfo;
    gameLogLines?: number;
    inputBlocked?: boolean;
    history?: readonly GameLogPresentationEntry[];
    onSettings?: () => void;
    onEndTurn?: () => void;
    onGameLog?: () => void;
    onSelectEnemy?: (id: EntityId) => void;
    onSelectCharacter?: (id: EntityId) => void;
}

export function BattleOverviewPanel(props: BattleOverviewPanelProps): JSX.Element {
    const model = createMemo(() => createBattleOverviewViewModel(
        props.state,
        props.actions,
        props.thresholds,
        props.presentation,
        props.history,
    ));

    return (
        <ScreenLayout class="kcq-battle-overview" ariaLabel={model().header.encounterLabel}
            header={
                <CombatHeader
                    variant="overview"
                    encounterLabel={model().header.encounterLabel}
                    difficultyLabel={model().header.difficultyLabel}
                    roundLabel={model().header.roundLabel}
                    phaseLabel={model().header.phaseLabel}
                    trap={model().header.trap}
                    settingsLabel={model().controls.settingsLabel}
                    onSettings={props.onSettings}
                />
            }
            body={<>
                <CompactGameLog entries={props.history ?? []} presentation={props.presentation}
                    party={props.state.characters.map(character => character.id)}
                    lines={props.gameLogLines ?? DEFAULT_OVERVIEW_GAME_LOG_LINES} onOpen={props.onGameLog} />
                <section class="kcq-battle-section kcq-battle-section--enemies" aria-labelledby="battle-enemies-heading">
                    <header class="kcq-battle-section__heading">
                        <h2 id="battle-enemies-heading">{model().enemiesHeading}</h2>
                        <span>{model().enemiesCountLabel}</span>
                    </header>
                    <div class="kcq-battle-overview__enemies">
                        <For each={model().enemies.map(enemy => enemy.id)}>
                            {(id, index) => <EnemyCard enemy={model().enemies.find(enemy => enemy.id === id)!}
                                shortcut={combatShortcut(index() + 3)}
                                onSelect={props.onSelectEnemy ? () => props.onSelectEnemy?.(id) : undefined} />}
                        </For>
                    </div>
                </section>

                <div class="kcq-battle-overview__divider" aria-hidden="true" />

                <section class="kcq-battle-section kcq-battle-section--party" aria-labelledby="battle-party-heading">
                    <header class="kcq-battle-section__heading">
                        <h2 id="battle-party-heading">{model().partyHeading}</h2>
                        <span>{model().partyCountLabel}</span>
                    </header>
                    <div class="kcq-battle-overview__party">
                        <For each={model().party.map(character => character.id)}>
                            {(id, index) => (
                                <PartyCard
                                    character={model().party.find(character => character.id === id)!}
                                    shortcut={index() < 3 ? String(index() + 1) : undefined}
                                    onSelect={props.onSelectCharacter
                                        ? () => props.onSelectCharacter?.(id)
                                        : undefined}
                                />
                            )}
                        </For>
                    </div>
                </section>
            </>}
            footer={
                <footer class="kcq-screen-actions kcq-battle-overview__footer">
                    <button
                        class="kcq-battle-overview__secondary-action kcq-shortcut-host"
                        data-kcq-shortcut={props.onGameLog ? COMBAT_SHORTCUTS.gameLog : undefined}
                        type="button"
                        onClick={() => props.onGameLog?.()}
                    >
                        <Shortcut shortcut={COMBAT_SHORTCUTS.gameLog} /> {model().controls.gameLogLabel}
                    </button>
                    <button
                        class="kcq-battle-overview__primary-action kcq-shortcut-host"
                        classList={{ "is-dimmed": model().controls.endTurnDimmed }}
                        type="button"
                        disabled={props.inputBlocked}
                        onClick={() => props.onEndTurn?.()}
                    >
                        <Shortcut shortcut={COMBAT_SHORTCUTS.endTurn} /> {model().controls.endTurnLabel}
                    </button>
                </footer>
            }
        />
    );
}
