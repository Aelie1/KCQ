import { createMemo, For, type JSX } from "solid-js";
import type {
    ActionView,
    EntityId,
    GameState,
    ThresholdInfo,
} from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import { COMBAT_SHORTCUTS } from "../keyboard";
import { Shortcut } from "../components/Shortcut";
import { ScreenLayout } from "../components/ScreenLayout";
import { CombatHeader } from "../components/CombatHeader";
import { EnemyCard } from "../components/EnemyCard";
import { PartyCard } from "../components/PartyCard";
import { createBattleOverviewViewModel } from "../viewModels/battleOverview";

export interface BattleOverviewPanelProps {
    actions: readonly ActionView[];
    presentation: Presentation;
    state: GameState;
    thresholds: ThresholdInfo;
    onSettings?: () => void;
    onEndTurn?: () => void;
    onGameLog?: () => void;
    onSelectCharacter?: (id: EntityId) => void;
}

export function BattleOverviewPanel(props: BattleOverviewPanelProps): JSX.Element {
    const model = createMemo(() => createBattleOverviewViewModel(
        props.state,
        props.actions,
        props.thresholds,
        props.presentation,
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
                <section class="kcq-battle-section kcq-battle-section--enemies" aria-labelledby="battle-enemies-heading">
                    <header class="kcq-battle-section__heading">
                        <h2 id="battle-enemies-heading">{model().enemiesHeading}</h2>
                        <span>{model().enemiesCountLabel}</span>
                    </header>
                    <div class="kcq-battle-overview__enemies">
                        <For each={model().enemies}>
                            {(enemy) => <EnemyCard enemy={enemy} />}
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
                        <For each={model().party}>
                            {(character, index) => (
                                <PartyCard
                                    character={character}
                                    shortcut={index() < 3 ? String(index() + 1) : undefined}
                                    onSelect={props.onSelectCharacter
                                        ? () => props.onSelectCharacter?.(character.id)
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
                        onClick={() => props.onEndTurn?.()}
                    >
                        <Shortcut shortcut={COMBAT_SHORTCUTS.endTurn} /> {model().controls.endTurnLabel}
                    </button>
                </footer>
            }
        />
    );
}
