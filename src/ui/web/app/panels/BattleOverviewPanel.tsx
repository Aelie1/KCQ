import { createEffect, createMemo, createUniqueId, For, Show, type JSX } from "solid-js";
import type { ContentLibrary } from "../../../../engine/public/library";
import type {
    ActionView,
    EntityId,
    GameState,
    ThresholdInfo,
} from "../../../../engine/public/types";
import type { GameLogPresentationEntry } from "../../../presentation/gameLog";
import type { Presentation } from "../../../presentation/presentation";
import { CombatHeader } from "../components/CombatHeader";
import { CompactGameLog } from "../components/CompactGameLog";
import { EnemyCard } from "../components/EnemyCard";
import { PartyCard } from "../components/PartyCard";
import { ScreenLayout } from "../components/ScreenLayout";
import { Shortcut } from "../components/Shortcut";
import type { createEnemyDefeats, EnemyPresentationSlot } from "../enemyDefeats";
import { COMBAT_SHORTCUTS, combatShortcut } from "../keyboard";
import { DEFAULT_OVERVIEW_GAME_LOG_LINES } from "../overviewGameLogLines";
import { createBattleOverviewViewModel, type BattleOverviewViewModel } from "../viewModels/battleOverview";

export interface BattleOverviewSections {
    header?: boolean;
    log?: boolean;
    enemies?: boolean;
    party?: boolean;
    footer?: boolean;
}

export interface BattleOverviewPanelProps {
    sections?: BattleOverviewSections;
    model?: BattleOverviewViewModel;
    endTurnInHeader?: boolean;
    gameLogHeadingAction?: boolean;
    gameLogScrollable?: boolean;
    completeEnemyIntentions?: boolean;
    enemyDetails?: JSX.Element;
    actions: readonly ActionView[];
    presentation: Presentation;
    state: GameState;
    thresholds: ThresholdInfo;
    gameLogLines?: number;
    inputBlocked?: boolean;
    enemyDefeats?: ReturnType<typeof createEnemyDefeats>;
    history?: readonly GameLogPresentationEntry[];
    library?: ContentLibrary;
    onSettings?: () => void;
    onLibrary?: () => void;
    onEndTurn?: () => void;
    onGameLog?: () => void;
    onSelectEnemy?: (id: EntityId) => void;
    onSelectCharacter?: (id: EntityId) => void;
}

export function BattleOverviewPanel(props: BattleOverviewPanelProps): JSX.Element {
    const model = createMemo(() => props.model ?? createBattleOverviewViewModel(
        props.state,
        props.actions,
        props.thresholds,
        props.presentation,
        props.history,
        props.library,
    ));

    const visible = (section: keyof BattleOverviewSections) => props.sections?.[section] !== false;
    const enemiesHeadingId = createUniqueId();
    const partyHeadingId = createUniqueId();
    const enemySlots = createMemo<readonly EnemyPresentationSlot[]>(() => !visible("enemies") || props.enemyDetails ? [] : props.enemyDefeats?.slots(model().enemies)
        ?? model().enemies.map(enemy => ({ enemy })));

    const endTurnButton = () => (
        <button
            class="kcq-battle-overview__primary-action kcq-shortcut-host"
            classList={{ "is-dimmed": model().controls.endTurnDimmed }}
            type="button"
            disabled={props.inputBlocked}
            onClick={() => props.onEndTurn?.()}
        >
            <Shortcut shortcut={COMBAT_SHORTCUTS.endTurn} /> {model().controls.endTurnLabel}
        </button>
    );

    return (
        <ScreenLayout class="kcq-battle-overview" ariaLabel={model().header.encounterLabel}
            header={visible("header") && (
                <CombatHeader
                    variant="overview"
                    encounterLabel={model().header.encounterLabel}
                    difficultyLabel={model().header.difficultyLabel}
                    roundLabel={model().header.roundLabel}
                    phaseLabel={model().header.phaseLabel}
                    trap={model().header.trap}
                    settingsLabel={model().controls.settingsLabel}
                    onSettings={props.onSettings}
                    libraryLabel={props.presentation.ui("library.title")}
                    onLibrary={props.onLibrary}
                    action={props.endTurnInHeader ? endTurnButton() : undefined}
                />
            )}
            body={(visible("log") || visible("enemies") || visible("party")) && <>
                <Show when={visible("log")}>
                    <CompactGameLog entries={props.history ?? []} presentation={props.presentation}
                        party={props.state.characters.map(character => character.id)}
                        headingAction={props.gameLogHeadingAction}
                        scrollable={props.gameLogScrollable}
                        lines={props.gameLogLines ?? DEFAULT_OVERVIEW_GAME_LOG_LINES} onOpen={props.onGameLog} />
                </Show>
                <Show when={visible("enemies") && props.enemyDetails}>{details => details()}</Show>
                <Show when={visible("enemies") && !props.enemyDetails}>
                    <section class="kcq-battle-section kcq-battle-section--enemies" aria-labelledby={enemiesHeadingId}>
                        <header class="kcq-battle-section__heading">
                            <h2 id={enemiesHeadingId}>{model().enemiesHeading}</h2>
                        </header>
                        <div class="kcq-battle-overview__enemies" classList={{ "kcq-battle-overview__enemies--expanded": props.completeEnemyIntentions }}>
                            <For each={enemySlots().map(slot => slot.enemy.id)}>
                                {(id, index) => {
                                    const slot = () => enemySlots().find(slot => slot.enemy.id === id)!;
                                    let element!: HTMLDivElement;
                                    createEffect(() => {
                                        if (!slot().defeat) return;
                                        // Keep the measured grid cell after its card is removed,
                                        // so another death cannot move while it is fading.
                                        const height = element.offsetHeight;
                                        if (height) element.style.height = `${height}px`;
                                    });
                                    return <div ref={element} class="kcq-enemy-presentation-slot" data-defeated={slot().defeat ? "true" : undefined}>
                                        <Show when={!slot().finished}>
                                            <EnemyCard enemy={slot().enemy} defeat={slot().defeat}
                                                completeIntentions={props.completeEnemyIntentions}
                                                shortcut={combatShortcut(index() + 3)}
                                                onSelect={!slot().defeat && props.onSelectEnemy ? () => props.onSelectEnemy?.(id) : undefined} />
                                        </Show>
                                    </div>;
                                }}
                            </For>
                        </div>
                    </section>
                </Show>

                <Show when={visible("enemies") && visible("party")}>
                    <div class="kcq-battle-overview__divider" aria-hidden="true" />
                </Show>

                <Show when={visible("party")}>
                    <section class="kcq-battle-section kcq-battle-section--party" aria-labelledby={partyHeadingId}>
                        <header class="kcq-battle-section__heading">
                            <h2 id={partyHeadingId}>{model().partyHeading}</h2>
                        </header>
                        <div class="kcq-battle-overview__party">
                            <For each={model().party.map(character => character.id)}>
                                {(id, index) => (
                                    <PartyCard
                                        character={model().party.find(character => character.id === id)!}
                                        thresholds={props.thresholds}
                                        shortcut={index() < 3 ? String(index() + 1) : undefined}
                                        onSelect={props.onSelectCharacter
                                            ? () => props.onSelectCharacter?.(id)
                                            : undefined}
                                    />
                                )}
                            </For>
                        </div>
                    </section>
                </Show>
            </>}
            footer={visible("footer") && (
                <footer class="kcq-screen-actions kcq-battle-overview__footer">
                    <button
                        class="kcq-battle-overview__secondary-action kcq-shortcut-host"
                        data-kcq-shortcut={props.onGameLog ? COMBAT_SHORTCUTS.gameLog : undefined}
                        type="button"
                        onClick={() => props.onGameLog?.()}
                    >
                        <Shortcut shortcut={COMBAT_SHORTCUTS.gameLog} /> {model().controls.gameLogLabel}
                    </button>
                    <Show when={!props.endTurnInHeader}>{endTurnButton()}</Show>
                </footer>
            )}
        />
    );
}
