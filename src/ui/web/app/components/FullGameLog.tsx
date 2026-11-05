import { createEffect, createMemo, createUniqueId, For, onCleanup, onMount, Show, type JSX } from "solid-js";
import type { ContentLibrary } from "../../../../engine/public/library";
import type { GameLogPresentationEntry } from "../../../presentation/gameLog";
import type { Presentation } from "../../../presentation/presentation";
import { DEFAULT_FULL_LOG_STYLE, type CompactLogStyle, type FullLogStyle } from "../gameLogMode";
import { createGameLogViewModel } from "../viewModels/gameLog";
import { createStoryLogViewModel } from "../viewModels/storyLog";
import { GameLogEntry } from "./GameLogEntry";
import { StoryLogEntry } from "./StoryLogEntry";

export interface FullGameLogProps {
    entries: readonly GameLogPresentationEntry[];
    presentation: Presentation;
    party: readonly string[];
    library?: ContentLibrary;
    style?: FullLogStyle;
    encounterId?: string;
    round?: number;
}

/** Each visible log owns its scrollback and follows independently. */
function LogHistory(props: FullGameLogProps & { kind: CompactLogStyle; headings: boolean }): JSX.Element {
    const id = createUniqueId();
    const label = () => props.presentation.ui(props.kind === "game" ? "combatHeader.gameLog" : "gameLog.storyLog");
    const entries = createMemo(() => props.kind === "game" ? createGameLogViewModel(props.entries, props.presentation, props.party)
        : createStoryLogViewModel(props.entries, props.presentation, props.party, props.library));
    let viewport!: HTMLDivElement;
    let content!: HTMLDivElement;
    let following = true;
    let frame: number | undefined;
    let previousCount = props.entries.length;
    let previousEncounter = props.encounterId;
    let previousRound = props.round;
    const scheduleFollow = () => {
        if (frame !== undefined) return;
        frame = requestAnimationFrame(() => {
            frame = undefined;
            if (following) viewport.scrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        });
    };
    createEffect(() => {
        entries();
        const count = props.entries.length;
        const encounter = props.encounterId;
        const round = props.round;
        if ((!count && previousCount) || encounter !== previousEncounter || (round !== undefined && previousRound !== undefined && round < previousRound)) following = true;
        previousCount = count;
        previousEncounter = encounter;
        previousRound = round;
        scheduleFollow();
    });
    onMount(() => {
        const observer = new ResizeObserver(scheduleFollow);
        observer.observe(viewport);
        observer.observe(content);
        scheduleFollow();
        onCleanup(() => observer.disconnect());
    });
    onCleanup(() => { if (frame !== undefined) cancelAnimationFrame(frame); });
    return <section class="kcq-full-game-log__panel" aria-label={label()}>
        <Show when={props.headings}><h2 id={id} class="kcq-full-game-log__heading">{label()}</h2></Show>
        <div ref={viewport} class="kcq-full-game-log__viewport" role="log" tabIndex={0}
            aria-label={props.kind === "story" ? label() : props.presentation.ui("gameLog.chronological")}
            aria-labelledby={props.headings ? id : undefined}
            onScroll={() => { following = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 32; }}>
            <div ref={content} class="kcq-game-log__scroll">
                <Show when={entries().length} fallback={<p class="kcq-game-log__empty">{props.presentation.ui("gameLog.empty")}</p>}>
                    <For each={entries()}>{entry => "paragraphs" in entry ? <StoryLogEntry entry={entry} /> : <GameLogEntry entry={entry} />}</For>
                </Show>
            </div>
        </div>
    </section>;
}

export function FullGameLog(props: FullGameLogProps): JSX.Element {
    const style = () => props.style ?? DEFAULT_FULL_LOG_STYLE;
    return <div class="kcq-full-game-log" classList={{ "kcq-full-game-log--both": style() === "both" }}>
        <Show when={style() !== "story"}><LogHistory {...props} kind="game" headings={style() === "both"} /></Show>
        <Show when={style() !== "game"}><LogHistory {...props} kind="story" headings={style() === "both"} /></Show>
    </div>;
}
