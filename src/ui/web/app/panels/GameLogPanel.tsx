import { createMemo, For, Show, type JSX } from "solid-js";
import type { GameState } from "../../../../engine/public/types";
import type { GameLogPresentationEntry } from "../../../presentation/gameLog";
import type { Presentation } from "../../../presentation/presentation";
import { ScreenLayout } from "../components/ScreenLayout";
import { CombatHeader } from "../components/CombatHeader";
import { createCombatHeaderViewModel } from "../viewModels/combatHeader";
import { createGameLogViewModel } from "../viewModels/gameLog";

export interface GameLogPanelProps {
    entries: readonly GameLogPresentationEntry[];
    presentation: Presentation;
    state: GameState;
    onBack?: () => void;
}

export function GameLogPanel(props: GameLogPanelProps): JSX.Element {
    const header = createMemo(() => createCombatHeaderViewModel(props.state, props.presentation));
    const entries = createMemo(() => createGameLogViewModel(props.entries, props.presentation));

    return (
        <ScreenLayout class="kcq-game-log" ariaLabel={props.presentation.ui("combatHeader.gameLog")}
            header={
                <CombatHeader
                    variant="subscreen"
                    encounterLabel={header().encounterLabel}
                    contextLabel={props.presentation.ui("combatHeader.gameLog")}
                    roundLabel={header().roundLabel}
                    phaseLabel={header().phaseLabel}
                    backLabel={props.presentation.ui("characterDetails.back")}
                    onBack={props.onBack}
                />
            }
            body={
                <div class="kcq-game-log__scroll" role="log" aria-label={props.presentation.ui("gameLog.chronological")}>
                    <Show when={entries().length} fallback={
                        <p class="kcq-game-log__empty">{props.presentation.ui("gameLog.empty")}</p>
                    }>
                        <For each={entries()}>
                            {(entry) => (
                                <article class={"kcq-game-log__entry kcq-game-log__entry--" + entry.kind}
                                    data-kind={entry.kind} data-actor={entry.actorId} data-phase={entry.phase}>
                                    <Show when={entry.title}>
                                        <div class="kcq-game-log__heading">
                                            <Show when={entry.actor}>
                                                <strong class={"kcq-game-log__actor kcq-game-log__actor--" + entry.actorTone}>{entry.actor}</strong>
                                                <span aria-hidden="true">—</span>
                                            </Show>
                                            <strong class="kcq-game-log__title">{entry.title}</strong>
                                            <Show when={entry.target}>
                                                <span class="kcq-game-log__escape-target">→ {entry.target}</span>
                                            </Show>
                                        </div>
                                    </Show>
                                    <div class="kcq-game-log__outcomes">
                                        <For each={entry.rows}>
                                            {(row) => (
                                                <div class={"kcq-game-log__row kcq-game-log__row--" + row.kind} data-outcome={row.kind}>
                                                    <span class="kcq-game-log__recipient">
                                                        <Show when={row.target}><span class="kcq-game-log__target">{row.target}</span></Show>
                                                        <Show when={row.label}><strong class="kcq-game-log__label">{row.label}</strong></Show>
                                                    </span>
                                                    <div class="kcq-game-log__values">
                                                        <For each={row.values}>
                                                            {(value) => <span class={"kcq-game-log__value kcq-game-log__value--" + (value.tone ?? "neutral")}>{value.text}</span>}
                                                        </For>
                                                    </div>
                                                </div>
                                            )}
                                        </For>
                                    </div>
                                </article>
                            )}
                        </For>
                    </Show>
                </div>
            }
        />
    );
}
