import { describe, expect, it } from "vitest";
import type { GameLogViewModelEntry } from "../../src/ui/web/app/viewModels/gameLog";
import { latestGameLogActionIndex, mergeLogLines, recentGameLogEntries, recentLogOffset } from "../../src/ui/web/app/viewModels/compactGameLog";

const move = (title: string): GameLogViewModelEntry => ({ kind: "move", title, rows: [] });
const phase: GameLogViewModelEntry = { kind: "phase", title: "Player Phase", rows: [] };
const lines = (count: number) => Array.from({ length: count }, (_, index) => ({ top: index * 16 + 2, bottom: index * 16 + 14 }));

describe("compact Game Log rendered history", () => {
    it("keeps chronological candidates and the last enemy move before phase markers", () => {
        const entries = [move("Old"), phase, move("Enemy one"), move("Enemy two"), phase, phase];
        expect(recentGameLogEntries(entries, 1)).toEqual(entries.slice(3));
        expect(recentGameLogEntries(entries, 3)).toEqual(entries.slice(3));
        expect(recentGameLogEntries(entries, 8)).toEqual(entries);
        expect(recentGameLogEntries(entries, 0)).toEqual([]);
        expect(latestGameLogActionIndex(entries)).toBe(3);
    });
    it("does not allow phase outcomes or an empty entry to displace the latest move", () => {
        const entries = [move("Enemy"), { ...phase, rows: [{ kind: "refresh" as const, values: [] }] }, { kind: "stance" as const, rows: [] }];
        expect(recentGameLogEntries(entries, 1)).toEqual(entries.slice(0, 2));
        expect(latestGameLogActionIndex(recentGameLogEntries(entries, 1))).toBe(0);
        expect(recentGameLogEntries([phase], 3)).toEqual([phase]);
        expect(recentGameLogEntries([], 3)).toEqual([]);
    });
    it("counts wrapped lines while merging differently colored fragments on the same line", () => {
        expect(mergeLogLines([{ top: 19, bottom: 30 }, { top: 3, bottom: 13 }, { top: 2, bottom: 14 }, { top: 18, bottom: 31 }]))
            .toEqual([{ top: 2, bottom: 14 }, { top: 18, bottom: 31 }]);
        expect(recentLogOffset(lines(5), 3, 48)).toBe(32);
    });
    it.each([5, 8, 20])("shows the entire latest %i-line action without an expansion cap", count => {
        expect(recentLogOffset(lines(count + 2), 3, 32)).toBe(32);
        expect(recentLogOffset(lines(count), 1, 0)).toBe(0);
    });
    it("fills three lines from recent history for a two-line action and retains its trailing marker", () => {
        expect(recentLogOffset(lines(5), 3, 48)).toBe(32);
        expect(recentLogOffset(lines(6), 3, 48)).toBe(48);
        expect(recentLogOffset(lines(2), 8, 0)).toBe(0);
    });
});
