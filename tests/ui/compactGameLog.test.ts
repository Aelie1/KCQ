import { describe, expect, it } from "vitest";
import type { GameLogViewModelEntry } from "../../src/ui/web/app/viewModels/gameLog";
import { latestGameLogActionIndex, mergeLogLines, recentGameLogEntries, recentLogOffset } from "../../src/ui/web/app/viewModels/compactGameLog";

const move = (title: string): GameLogViewModelEntry => ({ kind: "move", title, rows: [] });
const phase: GameLogViewModelEntry = { kind: "phase", title: "Player Phase", rows: [] };
const lines = (count: number) => Array.from({ length: count }, (_, index) => ({ top: index * 17 + 1, bottom: index * 17 + 16 }));

describe("compact Game Log rendered history", () => {
    it("filters whole phases before selecting chronological action candidates", () => {
        const entries = [move("Old"), phase, move("Enemy one"), move("Enemy two"), phase, phase];
        expect(recentGameLogEntries(entries, 1)).toEqual([entries[3]]);
        expect(recentGameLogEntries(entries, 3)).toEqual([entries[0], entries[2], entries[3]]);
        expect(recentGameLogEntries(entries, 8)).toEqual([entries[0], entries[2], entries[3]]);
        expect(recentGameLogEntries(entries, 0)).toEqual([]);
        expect(latestGameLogActionIndex(entries)).toBe(3);
    });
    it("excludes phase outcomes and empty entries completely", () => {
        const entries = [move("Enemy"), { ...phase, rows: [{ kind: "refresh" as const, values: [] }] }, { kind: "stance" as const, rows: [] }];
        expect(recentGameLogEntries(entries, 1)).toEqual([entries[0]]);
        expect(recentGameLogEntries(entries, 8)).toEqual([entries[0]]);
        expect(recentGameLogEntries([phase], 3)).toEqual([]);
        expect(latestGameLogActionIndex([phase])).toBe(-1);
        expect(recentGameLogEntries([], 3)).toEqual([]);
    });
    it("counts wrapped lines while merging differently colored fragments on the same line", () => {
        expect(mergeLogLines([{ top: 19, bottom: 30 }, { top: 3, bottom: 13 }, { top: 2, bottom: 14 }, { top: 18, bottom: 31 }]))
            .toEqual([{ top: 2, bottom: 14 }, { top: 18, bottom: 31 }]);
        expect(recentLogOffset(lines(5), 3, 51)).toBe(34);
    });
    it("does not cut previous glyphs when the latest action box starts inside their bounds", () => {
        const rendered = [{ top: 1, bottom: 18.5 }, { top: 19, bottom: 35 }, { top: 36, bottom: 52 }, { top: 53, bottom: 69 }];
        // The old pixel clamp returned 17, exposing the bottom of the first line.
        expect(recentLogOffset(rendered, 1, 17)).toBe(0);
        // With a gap before the action, preserve its first line at a safe boundary.
        expect(recentLogOffset(rendered, 1, 18.75)).toBe(18.75);
    });
    it("keeps even fractional overlaps together instead of clipping through them", () => {
        const rendered = mergeLogLines([{ top: 1, bottom: 18.5 }, { top: 18.25, bottom: 35 }, { top: 36, bottom: 52 }]);
        expect(rendered).toEqual([{ top: 1, bottom: 35 }, { top: 36, bottom: 52 }]);
        expect(recentLogOffset(rendered, 1, Infinity)).toBe(35.5);
    });
    it.each([5, 8, 20])("shows the entire latest %i-line action without an expansion cap", count => {
        expect(recentLogOffset(lines(count + 2), 3, 34)).toBe(34);
        expect(recentLogOffset(lines(count), 1, 0)).toBe(0);
    });
    it.each([1, 3, 8])("keeps older complete lines when the %i-line preference permits", preference => {
        const rendered = lines(10);
        const offset = recentLogOffset(rendered, preference, 136);
        expect(offset).toBe(Math.min((10 - preference) * 17, 136));
        expect(rendered.every(line => line.bottom <= offset || line.top >= offset)).toBe(true);
        expect(recentLogOffset(lines(2), preference, 0)).toBe(0);
    });
});
