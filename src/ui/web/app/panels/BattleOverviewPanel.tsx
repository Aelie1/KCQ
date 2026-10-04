import { createMemo, For, Show, type JSX } from "solid-js";
import type {
    ActionView,
    EntityId,
    GameState,
    ThresholdInfo,
} from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import settingsIconUrl from "../assets/settings.svg";
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
            <header class="kcq-battle-header">
                <div class="kcq-battle-header__encounter">
                    <h1 class="kcq-battle-header__title">{model().header.encounterLabel}</h1>
                    <Show when={model().header.trap}>
                        {(trap) => (
                            <div class="kcq-battle-header__trap">
                                <div class="kcq-battle-header__trap-summary">
                                    <span class="kcq-battle-header__trap-name">{trap().label}</span>
                                    <span class="kcq-battle-header__trap-value">{trap().valueLabel}</span>
                                </div>
                                <div
                                    class="kcq-battle-header__trap-meter"
                                    role="meter"
                                    aria-label={trap().label}
                                    aria-valuemin="0"
                                    aria-valuemax={trap().max}
                                    aria-valuenow={trap().amount}
                                >
                                    <span style={{ width: `${trap().fillPercent}%` }} />
                                </div>
                            </div>
                        )}
                    </Show>
                </div>
                <div class="kcq-battle-header__turn">
                    <p>{model().header.roundLabel}</p>
                    <p class="kcq-battle-header__phase">{model().header.phaseLabel}</p>
                </div>
                <button
                    class="kcq-battle-header__settings"
                    type="button"
                    aria-label={model().controls.settingsLabel}
                >
                    <img src={settingsIconUrl} alt="" width="22" height="22" />
                </button>
            </header>

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
