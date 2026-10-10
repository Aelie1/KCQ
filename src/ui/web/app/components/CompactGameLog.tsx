import { createEffect, createMemo, createSignal, createUniqueId, For, onCleanup, onMount, Show, type JSX } from "solid-js";
import type { GameLogPresentationEntry } from "../../../presentation/gameLog";
import type { Presentation } from "../../../presentation/presentation";
import { createGameLogViewModel } from "../viewModels/gameLog";
import { latestGameLogActionIndex, mergeLogLines, recentGameLogEntries, recentLogOffset } from "../viewModels/compactGameLog";
import { GameLogEntry } from "./GameLogEntry";

export interface CompactGameLogProps {
    entries: readonly GameLogPresentationEntry[];
    presentation: Presentation;
    party: readonly string[];
    lines: number;
    onOpen?: () => void;
}

function MeasuredGameLog(props: CompactGameLogProps): JSX.Element {
    const entries = createMemo(() => recentGameLogEntries(
        createGameLogViewModel(props.entries, props.presentation, props.party), props.lines));
    const headingId = createUniqueId();
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

    return <section class="kcq-battle-section kcq-battle-section--game-log" aria-labelledby={headingId}>
        <header class="kcq-battle-section__heading">
            <h2 id={headingId}>{props.presentation.ui("combatHeader.gameLog")}</h2>
        </header>
        <button type="button" class="kcq-compact-game-log" aria-label={props.presentation.ui("gameLog.openFull")}
            onClick={() => props.onOpen?.()}>
            <div class="kcq-compact-game-log__viewport">
                <div ref={content} class="kcq-compact-game-log__content" style={{ "margin-top": -offset() + "px" }}>
                    <Show when={entries().length} fallback={<span class="kcq-game-log__empty">{props.presentation.ui("gameLog.empty")}</span>}>
                        <For each={entries()}>{(entry, index) => <GameLogEntry entry={entry} hidden={index() < hiddenCount()} />}</For>
                    </Show>
                </div>
            </div>
        </button>
    </section>;
}

export function CompactGameLog(props: CompactGameLogProps): JSX.Element {
    return <Show when={props.lines > 0}><MeasuredGameLog {...props} /></Show>;
}
