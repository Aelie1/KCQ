import { createEffect, createMemo, For, onCleanup, onMount, Show, type JSX } from "solid-js";
import type { ContentLibrary } from "../../../../engine/public/library";
import type { GameLogPresentationEntry } from "../../../presentation/gameLog";
import type { Presentation } from "../../../presentation/presentation";
import { DEFAULT_FULL_LOG_STYLE, type CompactLogStyle, type FullLogStyle } from "../gameLogMode";
import { createGameLogScroll, groupGameLogRounds, type GameLogRound } from "../gameLogScroll";
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

function LogHistory(props: FullGameLogProps & {
    kind: CompactLogStyle;
    rounds: readonly GameLogRound[];
    scroll: ReturnType<typeof createGameLogScroll>;
}): JSX.Element {
    const label = () => props.presentation.ui(props.kind === "game" ? "combatHeader.gameLog" : "gameLog.storyLog");
    const rounds = createMemo(() => new Map(props.rounds.map(group => [group.round,
        props.kind === "game" ? createGameLogViewModel(group.entries, props.presentation, props.party)
            : createStoryLogViewModel(group.entries, props.presentation, props.party, props.library),
    ])));
    let viewport!: HTMLDivElement;
    let content!: HTMLDivElement;
    createEffect(() => {
        rounds();
        props.scroll.changed();
    });
    onMount(() => {
        onCleanup(props.scroll.register(props.kind, viewport, content));
    });
    return <section class="kcq-full-game-log__panel" aria-label={label()}>
        <div ref={viewport} class="kcq-full-game-log__viewport" role="log" tabIndex={0}
            aria-label={props.kind === "story" ? label() : props.presentation.ui("gameLog.chronological")}>
            <div ref={content} class="kcq-game-log__scroll">
                <Show when={[...rounds().values()].some(entries => entries.length)} fallback={<p class="kcq-game-log__empty">{props.presentation.ui("gameLog.empty")}</p>}>
                    <For each={[...rounds().keys()]}>{round => <div data-log-round={round}>
                        <For each={rounds().get(round)!}>
                            {entry => "paragraphs" in entry ? <StoryLogEntry entry={entry} /> : <GameLogEntry entry={entry} />}
                        </For>
                    </div>}</For>
                </Show>
            </div>
        </div>
    </section>;
}

export function FullGameLog(props: FullGameLogProps): JSX.Element {
    const style = () => props.style ?? DEFAULT_FULL_LOG_STYLE;
    const rounds = createMemo(() => groupGameLogRounds(props.entries));
    const scroll = createGameLogScroll(() => style() === "both");
    let previousCount = props.entries.length;
    let previousEncounter = props.encounterId;
    let previousRound = props.round;
    createEffect(() => {
        const count = props.entries.length;
        const encounter = props.encounterId;
        const round = props.round;
        style();
        const reset = (!count && previousCount > 0) || encounter !== previousEncounter
            || (round !== undefined && previousRound !== undefined && round < previousRound);
        previousCount = count;
        previousEncounter = encounter;
        previousRound = round;
        scroll.changed(reset);
    });
    onCleanup(() => scroll.dispose());
    return <div class="kcq-full-game-log" classList={{ "kcq-full-game-log--both": style() === "both" }}>
        <Show when={style() !== "story"}><LogHistory {...props} kind="game" rounds={rounds()} scroll={scroll} /></Show>
        <Show when={style() === "both"}>
            <header class="kcq-battle-section__heading kcq-full-game-log__story-heading">
                <h2>{props.presentation.ui("gameLog.storyLog")}</h2>
            </header>
        </Show>
        <Show when={style() !== "game"}><LogHistory {...props} kind="story" rounds={rounds()} scroll={scroll} /></Show>
    </div>;
}
