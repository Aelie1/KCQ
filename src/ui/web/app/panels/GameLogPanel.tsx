import { createEffect, createMemo, For, onCleanup, onMount, Show, type JSX } from "solid-js";
import type { GameState } from "../../../../engine/public/types";
import type { GameLogPresentationEntry } from "../../../presentation/gameLog";
import type { Presentation } from "../../../presentation/presentation";
import { COMBAT_SHORTCUTS } from "../keyboard";
import { ScreenLayout } from "../components/ScreenLayout";
import { CombatHeader } from "../components/CombatHeader";
import { createCombatHeaderViewModel } from "../viewModels/combatHeader";
import { createGameLogViewModel, type GameLogRow, type GameLogValue } from "../viewModels/gameLog";

export interface GameLogPanelProps {
    entries: readonly GameLogPresentationEntry[];
    presentation: Presentation;
    state: GameState;
    onBack?: () => void;
}

function OutcomeValues(props: { values: GameLogValue[]; bindings?: boolean; recipient?: JSX.Element }): JSX.Element {
    return <div class={"kcq-game-log__values" + (props.bindings ? " kcq-game-log__values--bindings" : "")}>
        <Show when={props.recipient}><span class="kcq-game-log__value">{props.recipient}</span></Show>
        <For each={props.values}>
            {(value) => <span class={"kcq-game-log__value kcq-game-log__value--" + (value.tone ?? "neutral")}>
                <For each={value.parts ?? [{ text: value.text, tone: value.tone }]}>
                    {(part) => <span class={"kcq-game-log__value--" + (part.tone ?? "neutral")}>{part.text}</span>}
                </For>
            </span>}
        </For>
    </div>;
}

function OutcomeRecipient(props: { row: GameLogRow }): JSX.Element {
    const row = props.row;
    return (
        <span class="kcq-game-log__recipient">
            <Show when={row.target}><span class="kcq-game-log__target">
                <For each={row.targetParts ?? [{ text: row.target! }]}>
                    {(part) => <span class={"kcq-game-log__value--" + (part.tone ?? "neutral")}>{part.text}</span>}
                </For>
            </span></Show>
            <Show when={row.kind === "bindingTick" && row.target && row.label}><span aria-hidden="true">—</span></Show>
            <Show when={row.label}><strong class="kcq-game-log__label">{row.label}</strong></Show>
        </span>
    );
}

function OutcomeRow(props: { row: GameLogRow }): JSX.Element {
    const row = props.row;
    const bindingValues = row.values.filter(value => value.binding);
    const inlineValues = row.values.filter(value => !value.binding);
    return (
        <div class={"kcq-game-log__row kcq-game-log__row--" + row.kind + (row.emphasis ? " kcq-game-log__row--" + row.emphasis : "")
            + (bindingValues.length ? " kcq-game-log__row--compactBindings" : "")} data-outcome={row.kind}>
            <Show when={row.kind === "damage" && bindingValues.length} fallback={<>
                <Show when={row.target || row.label}><OutcomeRecipient row={row} /></Show>
                <Show when={inlineValues.length}><OutcomeValues values={inlineValues} /></Show>
                <Show when={bindingValues.length}><OutcomeValues values={bindingValues} bindings /></Show>
            </>}>
                <OutcomeValues values={row.values} bindings
                    recipient={row.target || row.label ? <OutcomeRecipient row={row} /> : undefined} />
            </Show>
            <Show when={row.rows?.length}>
                <div class="kcq-game-log__tick-outcomes">
                    <For each={row.rows}>{child => <OutcomeRow row={child} />}</For>
                </div>
            </Show>
        </div>
    );
}

export function GameLogPanel(props: GameLogPanelProps): JSX.Element {
    const header = createMemo(() => createCombatHeaderViewModel(props.state, props.presentation));
    const entries = createMemo(() => createGameLogViewModel(props.entries, props.presentation, props.state.characters.map(character => character.id)));

    let content!: HTMLDivElement;
    let viewport: HTMLElement | undefined;
    let following = true;
    let frame: number | undefined;
    let previousCount = props.entries.length;
    let previousEncounter = props.state.encounter?.id;
    let previousRound = props.state.turn.round;
    const scheduleFollow = () => {
        if (!viewport || frame !== undefined) return;
        frame = requestAnimationFrame(() => {
            frame = undefined;
            if (following && viewport) viewport.scrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        });
    };
    const trackScroll = () => {
        if (viewport) following = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 32;
    };
    onMount(() => {
        // ScreenLayout's middle row owns scrolling; the log div is its content.
        viewport = content.parentElement!;
        viewport.addEventListener("scroll", trackScroll, { passive: true });
        const observer = new ResizeObserver(scheduleFollow);
        observer.observe(viewport);
        observer.observe(content);
        scheduleFollow();
        onCleanup(() => {
            viewport?.removeEventListener("scroll", trackScroll);
            observer.disconnect();
            if (frame !== undefined) cancelAnimationFrame(frame);
        });
    });
    createEffect(() => {
        const count = entries().length;
        const encounter = props.state.encounter?.id;
        const round = props.state.turn.round;
        if ((count === 0 && previousCount > 0) || encounter !== previousEncounter || round < previousRound) following = true;
        previousCount = count;
        previousEncounter = encounter;
        previousRound = round;
        scheduleFollow();
    });

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
                    backShortcut={COMBAT_SHORTCUTS.back}
                    onBack={props.onBack}
                />
            }
            body={
                <div ref={content} class="kcq-game-log__scroll" role="log" aria-label={props.presentation.ui("gameLog.chronological")}>
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
                                                <span class={"kcq-game-log__escape-target kcq-game-log__value--entity-" + entry.targetTone}>→ {entry.target}</span>
                                            </Show>
                                        </div>
                                    </Show>
                                    <div class="kcq-game-log__outcomes">
                                        <For each={entry.rows}>
                                            {(row) => (
                                                <OutcomeRow row={row} />
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
