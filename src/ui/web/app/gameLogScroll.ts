import type { GameLogPresentationEntry } from "../../presentation/gameLog";
import type { CompactLogStyle } from "./gameLogMode";

export interface GameLogRound {
    round: number;
    entries: GameLogPresentationEntry[];
}

/** Phase metadata anchors actions that do not carry their own round number. */
export function groupGameLogRounds(entries: readonly GameLogPresentationEntry[]): GameLogRound[] {
    const firstPhase = entries.find(entry => entry.kind === "phase" && entry.round !== undefined);
    let round = firstPhase?.kind === "phase" ? firstPhase.round! : 1;
    const rounds: GameLogRound[] = [];
    for (const entry of entries) {
        if (entry.kind === "phase" && entry.round !== undefined) round = entry.round;
        let group = rounds.at(-1);
        if (!group || group.round !== round) {
            group = { round, entries: [] };
            rounds.push(group);
        }
        group.entries.push(entry);
    }
    return rounds;
}

interface RoundBounds { round: number; top: number; bottom: number }
interface LogViewport {
    viewport: HTMLElement;
    content: HTMLElement;
    bounds?: RoundBounds[];
    expectedTop?: number;
    lastTop: number;
}

const EPSILON = 0.5;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const maximum = (panel: LogViewport) => Math.max(0, panel.viewport.scrollHeight - panel.viewport.clientHeight);

/** Scroll coordination for the two full combat-log presentations only. */
export function createGameLogScroll(synchronized: () => boolean) {
    const panels = new Map<CompactLogStyle, LogViewport>();
    let following = true;
    let source: CompactLogStyle | undefined;
    let frame: number | undefined;
    let writing = false;
    let followOnFrame = false;

    const write = (panel: LogViewport, top: number) => {
        const next = clamp(top, 0, maximum(panel));
        if (Math.abs(panel.viewport.scrollTop - next) <= EPSILON) return;
        // Browser scroll events arrive asynchronously. Remember the resulting position
        // rather than using a flag that would be cleared before the event arrives.
        panel.expectedTop = next;
        writing = true;
        panel.viewport.scrollTop = next;
        writing = false;
        panel.lastTop = panel.expectedTop = panel.viewport.scrollTop;
    };
    const measure = (panel: LogViewport): RoundBounds[] => {
        if (panel.bounds) return panel.bounds;
        // The content is positioned, so offsetTop is in scroll-coordinate CSS pixels,
        // unaffected by ResponsiveScale zoom or the panel's position on the screen.
        const anchors = Array.from(panel.content.querySelectorAll<HTMLElement>("[data-log-round]"))
            .filter(anchor => anchor.offsetHeight > 0)
            .map(anchor => ({ round: Number(anchor.dataset.logRound), top: anchor.offsetTop }));
        return panel.bounds = anchors.map((anchor, index) => ({ ...anchor,
            bottom: anchors[index + 1]?.top ?? panel.viewport.scrollHeight,
        }));
    };
    const align = (from: LogViewport, to: LogViewport) => {
        const rounds = measure(from);
        const targets = measure(to);
        if (!rounds.length || !targets.length) return;
        const bottom = from.viewport.scrollTop + from.viewport.clientHeight;
        // At an exact boundary, the viewport still ends in the preceding round.
        const current = rounds.find(round => bottom <= round.bottom) ?? rounds.at(-1)!;
        const fraction = clamp((bottom - current.top) / Math.max(1, current.bottom - current.top), 0, 1);
        const target = targets.find(round => round.round === current.round);
        // An omitted narrative round has no height. Align to its next visible boundary,
        // or the end of the preceding round for an empty trailing portion of history.
        const next = targets.find(round => round.round > current.round);
        const targetBottom = target ? target.top + fraction * (target.bottom - target.top)
            : next?.top ?? targets.at(-1)!.bottom;
        write(to, targetBottom - to.viewport.clientHeight);
    };
    const schedule = () => {
        if (frame !== undefined) return;
        frame = requestAnimationFrame(() => {
            frame = undefined;
            if (following) {
                for (const [kind, panel] of panels) {
                    if (followOnFrame || kind !== source) write(panel, maximum(panel));
                }
            } else if (synchronized() && source) {
                const from = panels.get(source);
                const to = panels.get(source === "game" ? "story" : "game");
                if (from && to) align(from, to);
            }
        });
    };
    const changed = (reset = false) => {
        for (const panel of panels.values()) {
            panel.bounds = undefined;
            if (reset) panel.expectedTop = undefined;
        }
        if (reset) { following = true; source = undefined; }
        // Only content/layout updates may advance the source to the bottom.
        // Doing so on a native scroll event interrupts small wheel/trackpad steps.
        followOnFrame = true;
        schedule();
    };
    return {
        changed,
        register(kind: CompactLogStyle, viewport: HTMLElement, content: HTMLElement) {
            const panel: LogViewport = { viewport, content, lastTop: viewport.scrollTop };
            panels.set(kind, panel);
            const scroll = () => {
                const top = viewport.scrollTop;
                if (writing || panel.expectedTop !== undefined && Math.abs(top - panel.expectedTop) <= EPSILON) {
                    panel.expectedTop = undefined;
                    panel.lastTop = top;
                    return;
                }
                if (Math.abs(top - panel.lastTop) <= EPSILON) return;
                panel.expectedTop = undefined;
                panel.lastTop = top;
                // Allow rounding at the bottom, but let small native scroll steps
                // leave follow mode immediately instead of snapping them back.
                following = maximum(panel) - top <= 1;
                source = kind;
                followOnFrame = false;
                schedule();
            };
            viewport.addEventListener("scroll", scroll, { passive: true });
            const observer = new ResizeObserver(() => changed());
            observer.observe(viewport);
            observer.observe(content);
            changed();
            return () => {
                observer.disconnect();
                viewport.removeEventListener("scroll", scroll);
                panels.delete(kind);
            };
        },
        dispose() {
            if (frame !== undefined) cancelAnimationFrame(frame);
        },
    };
}
