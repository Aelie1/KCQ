import { createEffect, createMemo, For, onCleanup, onMount, Show, type JSX } from "solid-js";
import type { GameState } from "../../../../engine/public/types";
import type { GameLogPresentationEntry } from "../../../presentation/gameLog";
import type { Presentation } from "../../../presentation/presentation";
import { COMBAT_SHORTCUTS } from "../keyboard";
import { ScreenLayout } from "../components/ScreenLayout";
import { CombatHeader } from "../components/CombatHeader";
import { createCombatHeaderViewModel } from "../viewModels/combatHeader";
import { createGameLogViewModel } from "../viewModels/gameLog";
import { GameLogEntry } from "../components/GameLogEntry";

export interface GameLogPanelProps {
    entries: readonly GameLogPresentationEntry[];
    presentation: Presentation;
    state: GameState;
    onBack?: () => void;
    focusBackOnMount?: boolean;
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
        viewport = content.closest<HTMLElement>(".kcq-screen-layout__body")!;
        if (props.focusBackOnMount) content.closest(".kcq-screen-layout")?.querySelector<HTMLButtonElement>(".kcq-combat-header__back")?.focus();
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
                                <GameLogEntry entry={entry} />
                            )}
                        </For>
                    </Show>
                </div>
            }
        />
    );
}
