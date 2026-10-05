import { createMemo, For, type JSX } from "solid-js";
import type {
    ActionView,
    EntityId,
    GameState,
    ThresholdInfo,
} from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import { CombatHeader } from "../components/CombatHeader";
import { EnemyCard } from "../components/EnemyCard";
import { PartyCard } from "../components/PartyCard";
import { createBattleOverviewViewModel } from "../viewModels/battleOverview";

export interface BattleOverviewPanelProps {
    actions: readonly ActionView[];
    presentation: Presentation;
    state: GameState;
    thresholds: ThresholdInfo;
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
        <section class="kcq-battle-overview" aria-label={model().header.encounterLabel}>
            <CombatHeader
                variant="overview"
                encounterLabel={model().header.encounterLabel}
                difficultyLabel={model().header.difficultyLabel}
                roundLabel={model().header.roundLabel}
                phaseLabel={model().header.phaseLabel}
                trap={model().header.trap}
                settingsLabel={model().controls.settingsLabel}
            />

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
                        {(character) => (
                            <PartyCard
                                character={character}
                                onSelect={props.onSelectCharacter
                                    ? () => props.onSelectCharacter?.(character.id)
                                    : undefined}
                            />
                        )}
                    </For>
                </div>
            </section>

            <footer class="kcq-battle-overview__footer">
                <button
                    class="kcq-battle-overview__secondary-action"
                    type="button"
                    onClick={() => props.onGameLog?.()}
                >
                    {model().controls.gameLogLabel}
                </button>
                <button
                    class="kcq-battle-overview__primary-action"
                    type="button"
                    onClick={() => props.onEndTurn?.()}
                >
                    {model().controls.endTurnLabel}
                </button>
            </footer>
        </section>
    );
}
