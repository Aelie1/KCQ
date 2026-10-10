import type { GameLogViewModelEntry } from "./gameLog";

export function latestGameLogActionIndex(entries: readonly GameLogViewModelEntry[]): number {
    for (let index = entries.length - 1; index >= 0; index--) {
        if (entries[index]!.kind !== "phase") return index;
    }
    return -1;
}

/** Every nonempty action has at least one line. Exclude whole phase entries
 * before limiting candidates so automatic outcomes cannot displace actions. */
export function recentGameLogEntries(entries: readonly GameLogViewModelEntry[], minimum: number): GameLogViewModelEntry[] {
    if (minimum <= 0) return [];
    const visible = entries.filter(entry => entry.kind !== "phase" && (entry.title || entry.rows.length));
    return visible.slice(Math.max(0, visible.length - minimum));
}

export interface RenderedLogLine { top: number; bottom: number }

/** Merge colored fragments on the same line. Overlapping bounds must stay
 * together too: there is no safe clipping boundary between them. */
export function mergeLogLines(rects: readonly RenderedLogLine[]): RenderedLogLine[] {
    const lines: RenderedLogLine[] = [];
    for (const rect of [...rects].sort((a, b) => a.top - b.top)) {
        const previous = lines.at(-1);
        if (previous && rect.top < previous.bottom) {
            previous.bottom = Math.max(previous.bottom, rect.bottom);
        } else lines.push({ ...rect });
    }
    return lines;
}

/** Select the first complete visible line before choosing a safe gap. Clamping
 * a pixel offset to the action's box top can cut the preceding line's glyphs. */
export function recentLogOffset(lines: readonly RenderedLogLine[], minimum: number, latestActionTop: number): number {
    const protectedFirst = lines.findIndex(line => line.bottom > latestActionTop);
    const first = Math.min(Math.max(0, lines.length - minimum), protectedFirst < 0 ? lines.length : protectedFirst);
    if (first === 0) return 0;
    return (lines[first - 1]!.bottom + lines[first]!.top) / 2;
}
