import { describe, expect, it } from "vitest";
import {
    createProgressReporter,
    formatBatchProgress,
    formatCompletion,
    formatElapsedTime,
    formatEta,
    formatProgressClock,
    formatProgressMetrics,
} from "../../src/harness/cli/progress";

describe("batch runtime presentation", () => {
    it("formats elapsed time and ETA without adding them to deterministic data", () => {
        expect(formatElapsedTime(190_200)).toBe("3m 10.2s");
        expect(formatElapsedTime(3_661_250)).toBe("1h 1m 1.3s");
        expect(formatProgressClock(60_999)).toBe("00:01:00");
        expect(formatEta(130_000)).toBe("2m 10s");
        expect(formatEta(0)).toBe("0s");
    });

    it("formats percentage, throughput, ETA, and completion", () => {
        expect(formatProgressMetrics(31_482, 100_000, 60_000))
            .toBe("31,482 / 100,000 (31.5%)  525 fights/s  ETA 2m 11s");
        expect(formatBatchProgress(500, 1_000, 60_000))
            .toBe("[00:01:00] 500 / 1,000 (50.0%)  8 fights/s  ETA 1m");
        expect(formatCompletion(100_000, 190_200)).toBe(
            "Completed 100,000 runs in 3m 10.2s (526 fights/s)",
        );
    });

    it("does not emit periodic progress for short runs or duplicate completion", () => {
        let now = 0;
        const lines: string[] = [];
        const reporter = createProgressReporter({ now: () => now, write: (line) => lines.push(line) });
        now = 20_000;
        reporter.update(1, 3);
        now = 59_999;
        reporter.update(2, 3);
        now = 60_000;
        reporter.update(3, 3);
        expect(lines).toEqual([]);
    });

    it("uses callback-driven clock checks at roughly sixty-second intervals", () => {
        let now = 0;
        const lines: string[] = [];
        const reporter = createProgressReporter({ now: () => now, write: (line) => lines.push(line) });
        now = 60_000;
        reporter.update(25, 100);
        now = 119_999;
        reporter.update(49, 100);
        now = 120_000;
        reporter.update(50, 100);

        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain("[00:01:00] 25 / 100 (25.0%)");
        expect(lines[1]).toContain("[00:02:00] 50 / 100 (50.0%)");
    });
});
