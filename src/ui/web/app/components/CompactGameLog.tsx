import { createEffect, createMemo, createSignal, createUniqueId, For, on, onCleanup, onMount, Show, type JSX } from "solid-js";
import type { GameLogPresentationEntry } from "../../../presentation/gameLog";
import type { ContentLibrary } from "../../../../engine/public/library";
import type { Presentation } from "../../../presentation/presentation";
import { createGameLogViewModel } from "../viewModels/gameLog";
import { latestGameLogActionIndex, mergeLogLines, recentGameLogEntries, recentLogOffset } from "../viewModels/compactGameLog";
import { GameLogEntry } from "./GameLogEntry";
import { StoryLogEntry } from "./StoryLogEntry";
import { createStoryLogViewModel } from "../viewModels/storyLog";
import { GameLogTabs, type GameLogMode } from "./GameLogTabs";

export interface CompactGameLogProps {
    entries: readonly GameLogPresentationEntry[];
    presentation: Presentation;
    library?: ContentLibrary;
    party: readonly string[];
    lines: number;
    onOpen?: () => void;
    headingAction?: boolean;
    scrollable?: boolean;
    mode?: GameLogMode;
    onModeChange?: (mode: GameLogMode) => void;
}

/** The wide overview has room for history rather than a cropped preview. */
function ScrollableGameLog(props: CompactGameLogProps & { headingId: string }): JSX.Element {
    const entries = createMemo(() => createGameLogViewModel(props.entries, props.presentation, props.party));
    const [tab, setTab] = createSignal<GameLogMode>(props.mode ?? "combat");
    const story = createMemo(() => tab() === "story" ? createStoryLogViewModel(props.entries, props.presentation, props.party, props.library) : []);
    const positions = { combat: { top: 0, following: true }, story: { top: 0, following: true } };
    let viewport!: HTMLDivElement;
    let following = true;
    let restoreTop: number | undefined;
    let frame: number | undefined;
    let previousCount = props.entries.length;
    const selectTab = (next: GameLogMode) => {
        if (next === tab()) return;
        positions[tab()] = { top: viewport.scrollTop, following };
        following = positions[next].following;
        restoreTop = positions[next].top;
        setTab(next);
        props.onModeChange?.(next);
        viewport.scrollTop = following ? Math.max(0, viewport.scrollHeight - viewport.clientHeight) : positions[next].top;
    };
    createEffect(on(() => props.mode, mode => { if (mode !== undefined) selectTab(mode); }));
    createEffect(() => {
        entries();
        story();
        tab();
        if (!props.entries.length && previousCount) {
            following = true;
            restoreTop = undefined;
            positions.combat = { top: 0, following: true };
            positions.story = { top: 0, following: true };
        }
        previousCount = props.entries.length;
        if (frame !== undefined) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            frame = undefined;
            if (following) viewport.scrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
            else if (restoreTop !== undefined) viewport.scrollTop = restoreTop;
            restoreTop = undefined;
        });
    });
    onCleanup(() => { if (frame !== undefined) cancelAnimationFrame(frame); });
    return <>
        <GameLogTabs id={props.headingId} headingId={props.headingId} mode={tab()} onSelect={selectTab} presentation={props.presentation} />
        <div class="kcq-overview-game-log-panel" role="tabpanel" id={`${props.headingId}-panel`} aria-labelledby={`${props.headingId}-${tab()}`}>
            <div ref={viewport} class="kcq-game-log__scroll kcq-overview-game-log-history" role="log" tabIndex={0}
                aria-label={props.presentation.ui("gameLog.chronological")}
                onScroll={() => { following = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 32; restoreTop = undefined; }}>
                <Show when={entries().length} fallback={<p class="kcq-game-log__empty">{props.presentation.ui("gameLog.empty")}</p>}>
                    <Show when={tab() === "combat"} fallback={<For each={story()}>{entry => <StoryLogEntry entry={entry} />}</For>}>
                        <For each={entries()}>{entry => <GameLogEntry entry={entry} />}</For>
                    </Show>
                </Show>
            </div>
        </div>
    </>;
}

function MeasuredGameLog(props: CompactGameLogProps): JSX.Element {
    const entries = createMemo(() => props.lines <= 0 ? [] : props.mode === "story"
        ? createStoryLogViewModel(props.entries, props.presentation, props.party, props.library).filter(entry => entry.kind !== "phase" && (entry.title || entry.paragraphs.length)).slice(-props.lines)
        : recentGameLogEntries(createGameLogViewModel(props.entries, props.presentation, props.party), props.lines));
    const [offset, setOffset] = createSignal(0);
    const [hiddenCount, setHiddenCount] = createSignal(0);
    let content!: HTMLDivElement;
    let frame: number | undefined;
    let mounted = false;

    const measure = (): void => {
        const bounds = content.getBoundingClientRect();
        // ResponsiveScale transforms the app; convert viewport coordinates back to CSS pixels.
        const height = parseFloat(getComputedStyle(content).height) || content.offsetHeight;
        if (!bounds.height || !height) return;
        const scale = bounds.height / height;
        const localTop = (top: number) => (top - bounds.top) / scale;
        const fragments: { top: number; bottom: number }[] = [];
        const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        let text: Node | null;
        while ((text = walker.nextNode())) {
            if (!text.textContent?.trim()) continue;
            range.selectNodeContents(text);
            for (const rect of Array.from(range.getClientRects())) {
                if (rect.width && rect.height) fragments.push({ top: localTop(rect.top), bottom: localTop(rect.bottom) });
            }
        }
        const articles = Array.from(content.children) as HTMLElement[];
        const latest = latestGameLogActionIndex(entries());
        const protectedTop = latest >= 0 ? localTop(articles[latest]!.getBoundingClientRect().top) : Infinity;
        const nextOffset = recentLogOffset(mergeLogLines(fragments), props.lines, protectedTop);
        setOffset(nextOffset);
        setHiddenCount(articles.filter(article => localTop(article.getBoundingClientRect().bottom) <= nextOffset).length);
    };
    const scheduleMeasure = (): void => {
        if (!mounted || frame !== undefined) return;
        frame = requestAnimationFrame(() => { frame = undefined; measure(); });
    };
    createEffect(() => {
        entries();
        props.lines;
        setOffset(0);
        setHiddenCount(0);
        scheduleMeasure();
    });
    onMount(() => {
        mounted = true;
        const observer = new ResizeObserver(scheduleMeasure);
        observer.observe(content);
        scheduleMeasure();
        void document.fonts?.ready.then(() => { if (mounted) scheduleMeasure(); });
        onCleanup(() => {
            mounted = false;
            observer.disconnect();
            if (frame !== undefined) cancelAnimationFrame(frame);
        });
    });

    return <button type="button" class="kcq-compact-game-log" aria-label={props.presentation.ui("gameLog.openFull")}
            onClick={() => props.onOpen?.()}>
            <div class="kcq-compact-game-log__viewport">
                <div ref={content} class="kcq-compact-game-log__content" style={{ "margin-top": -offset() + "px" }}>
                    <Show when={entries().length} fallback={<span class="kcq-game-log__empty">{props.presentation.ui("gameLog.empty")}</span>}>
                        <For each={entries()}>{(entry, index) => "paragraphs" in entry
                            ? <StoryLogEntry entry={entry} hidden={index() < hiddenCount()} />
                            : <GameLogEntry entry={entry} hidden={index() < hiddenCount()} />}</For>
                    </Show>
                </div>
            </div>
        </button>;
}

export function CompactGameLog(props: CompactGameLogProps): JSX.Element {
    const headingId = createUniqueId();
    const [localMode, setLocalMode] = createSignal<GameLogMode>("combat");
    const mode = () => props.mode ?? localMode();
    const selectMode = (next: GameLogMode) => { setLocalMode(next); props.onModeChange?.(next); };
    return <Show when={props.lines > 0 || props.headingAction || props.scrollable}>
        <section class="kcq-battle-section kcq-battle-section--game-log" aria-labelledby={headingId}>
            <Show when={props.scrollable} fallback={<>
                <GameLogTabs id={headingId} headingId={headingId} mode={mode()} onSelect={selectMode} presentation={props.presentation} />
                <Show when={props.lines > 0}>
                    <div role="tabpanel" id={`${headingId}-panel`} aria-labelledby={`${headingId}-${mode()}`}>
                        <MeasuredGameLog {...props} mode={mode()} />
                    </div>
                </Show>
            </>}>
                <ScrollableGameLog {...props} headingId={headingId} mode={mode()} onModeChange={selectMode} />
            </Show>
        </section>
    </Show>;
}
