import type { GameLogViewModelEntry } from "./gameLog";

/** Phase transitions may carry outcomes; retain them after the latest move rather
 * than allowing a transition to replace that move. */
export function latestGameLogActionIndex(entries: readonly GameLogViewModelEntry[]): number {
    for (let index = entries.length - 1; index >= 0; index--) {
        if (entries[index]!.kind !== "phase") return index;
    }
    return entries.length ? entries.length - 1 : -1;
}

/** Every nonempty entry has at least one line. Keep enough candidates to fill
 * the preference, plus the latest meaningful entry and any trailing markers. */
export function recentGameLogEntries(entries: readonly GameLogViewModelEntry[], minimum: number): GameLogViewModelEntry[] {
    if (minimum <= 0) return [];
    const visible = entries.filter(entry => entry.title || entry.rows.length);
    const latest = latestGameLogActionIndex(visible);
    const start = Math.min(Math.max(0, visible.length - minimum), latest < 0 ? visible.length : latest);
    return visible.slice(start);
}

export interface RenderedLogLine { top: number; bottom: number }

/** Merge text fragments on the same visual line (including colored spans). */
export function mergeLogLines(rects: readonly RenderedLogLine[]): RenderedLogLine[] {
    const lines: RenderedLogLine[] = [];
    for (const rect of [...rects].sort((a, b) => a.top - b.top)) {
        const previous = lines.at(-1);
        if (previous && Math.min(previous.bottom, rect.bottom) - Math.max(previous.top, rect.top) > 1) {
            previous.top = Math.min(previous.top, rect.top);
            previous.bottom = Math.max(previous.bottom, rect.bottom);
        } else lines.push({ ...rect });
    }
    return lines;
}

/** Crop only at a complete line boundary, never inside the protected action. */
export function recentLogOffset(lines: readonly RenderedLogLine[], minimum: number, latestActionTop: number): number {
    const first = Math.max(0, lines.length - minimum);
    if (first === 0) return 0;
    const boundary = (lines[first - 1]!.bottom + lines[first]!.top) / 2;
    return Math.max(0, Math.min(boundary, latestActionTop));
}
