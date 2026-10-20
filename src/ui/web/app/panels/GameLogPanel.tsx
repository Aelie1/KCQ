import { createEffect, createMemo, createSignal, createUniqueId, For, onCleanup, onMount, Show, type JSX } from "solid-js";
import type { GameState } from "../../../../engine/public/types";
import type { GameLogPresentationEntry } from "../../../presentation/gameLog";
import type { Presentation } from "../../../presentation/presentation";
import { COMBAT_SHORTCUTS } from "../keyboard";
import { ScreenLayout } from "../components/ScreenLayout";
import { CombatHeader } from "../components/CombatHeader";
import { createCombatHeaderViewModel } from "../viewModels/combatHeader";
import { createGameLogViewModel } from "../viewModels/gameLog";
import { GameLogEntry } from "../components/GameLogEntry";
import { StoryLogEntry } from "../components/StoryLogEntry";
import { createStoryLogViewModel } from "../viewModels/storyLog";

export interface GameLogPanelProps {
    entries: readonly GameLogPresentationEntry[];
    presentation: Presentation;
    state: GameState;
    onBack?: () => void;
    showBack?: boolean;
    focusBackOnMount?: boolean;
}

export function GameLogPanel(props: GameLogPanelProps): JSX.Element {
    const header = createMemo(() => createCombatHeaderViewModel(props.state, props.presentation));
    const entries = createMemo(() => createGameLogViewModel(props.entries, props.presentation, props.state.characters.map(character => character.id)));
    const [tab, setTab] = createSignal<"combat" | "story">("combat");
    const story = createMemo(() => tab() === "story" ? createStoryLogViewModel(props.entries, props.presentation) : []);
    const id = createUniqueId();
    const positions = { combat: { top: 0, following: true }, story: { top: 0, following: true } };

    let content!: HTMLDivElement;
    let viewport: HTMLElement | undefined;
    let following = true;
    let restoreTop: number | undefined;
    let frame: number | undefined;
    let previousCount = props.entries.length;
    let previousEncounter = props.state.encounter?.id;
    let previousRound = props.state.turn.round;
    const scheduleFollow = () => {
        if (!viewport || frame !== undefined) return;
        frame = requestAnimationFrame(() => {
            frame = undefined;
            if (following && viewport) viewport.scrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
            else if (restoreTop !== undefined && viewport) viewport.scrollTop = restoreTop;
            restoreTop = undefined;
        });
    };
    const trackScroll = () => {
        if (viewport) {
            following = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 32;
            restoreTop = undefined;
        }
    };
    const selectTab = (next: "combat" | "story") => {
        if (next === tab()) return;
        positions[tab()] = { top: viewport?.scrollTop ?? 0, following };
        following = positions[next].following;
        restoreTop = positions[next].top;
        setTab(next);
        if (viewport) viewport.scrollTop = following ? Math.max(0, viewport.scrollHeight - viewport.clientHeight) : positions[next].top;
        scheduleFollow();
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
        tab();
        const count = entries().length;
        const encounter = props.state.encounter?.id;
        const round = props.state.turn.round;
        if ((count === 0 && previousCount > 0) || encounter !== previousEncounter || round < previousRound) {
            following = true;
            restoreTop = undefined;
            positions.combat = { top: 0, following: true };
            positions.story = { top: 0, following: true };
        }
        previousCount = count;
        previousEncounter = encounter;
        previousRound = round;
        scheduleFollow();
    });

    return (
        <ScreenLayout class="kcq-game-log" ariaLabel={props.presentation.ui("combatHeader.gameLog")}
            header={
                <>
                    <CombatHeader
                        variant="subscreen"
                        encounterLabel={header().encounterLabel}
                        contextLabel={props.presentation.ui("combatHeader.gameLog")}
                        roundLabel={header().roundLabel}
                        phaseLabel={header().phaseLabel}
                        backLabel={props.presentation.ui("characterDetails.back")}
                        showBack={props.showBack}
                        backShortcut={COMBAT_SHORTCUTS.back}
                        onBack={props.onBack}
                    />
                    <div class="kcq-game-log__tabs" role="tablist" aria-label={props.presentation.ui("gameLog.tabs")}>
                        <For each={["combat", "story"] as const}>{item => (
                            <button type="button" role="tab" id={`${id}-${item}`} aria-controls={`${id}-panel`}
                                aria-selected={tab() === item} tabIndex={tab() === item ? 0 : -1}
                                onClick={() => selectTab(item)} onKeyDown={event => {
                                    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                                    event.preventDefault();
                                    event.stopPropagation();
                                    const next = event.key === "Home" ? "combat" : event.key === "End" ? "story" : item === "combat" ? "story" : "combat";
                                    selectTab(next);
                                    document.getElementById(`${id}-${next}`)?.focus({ preventScroll: true });
                                }}>{props.presentation.ui(`gameLog.${item}`)}</button>
                        )}</For>
                    </div>
                </>
            }
            body={
                <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab()}`}>
                    <div ref={content} class="kcq-game-log__scroll" role="log" aria-label={props.presentation.ui("gameLog.chronological")}>
                        <Show when={entries().length} fallback={
                            <p class="kcq-game-log__empty">{props.presentation.ui("gameLog.empty")}</p>
                        }>
                            <Show when={tab() === "combat"} fallback={
                                <For each={story()}>{entry => <StoryLogEntry entry={entry} />}</For>
                            }>
                                <For each={entries()}>{entry => <GameLogEntry entry={entry} />}</For>
                            </Show>
                        </Show>
                    </div>
                </div>
            }
        />
    );
}
