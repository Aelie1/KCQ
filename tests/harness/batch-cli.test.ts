import { describe, expect, it } from "vitest";
import { parseBatchArguments } from "../../src/harness/batch-cli";
import { policies } from "../../src/harness/policies";
import type { BatchSummary, RunReference } from "../../src/harness/summary";
import { formatBatchSummary } from "../../src/harness/summary-format";

function reference(runIndex: number, termination: RunReference["termination"]): RunReference {
    return { runIndex, termination, engineSeed: 1000 + runIndex, policySeed: 2000 + runIndex, actionCount: 8, round: 5 };
}

function summaryFixture(): BatchSummary {
    return {
        encounterId: "fixture",
        policyId: "first",
        masterSeed: 99,
        runCount: 4,
        outcomes: {
            victory: { count: 3, rate: 0.75 },
            defeat: { count: 1, rate: 0.25 },
            maxActions: { count: 0, rate: 0 },
            error: { count: 0, rate: 0 },
        },
        fightLength: {
            actionCount: { min: 2, median: 3.5, mean: 4.25, p90: 8, max: 8 },
            round: { min: 1, median: 2.5, mean: 2.75, p90: 5, max: 5 },
        },
        actionUsage: {
            totalMoveActions: 7,
            moves: { whiteFlame: 2, telekinesis: 3, brace: 2 },
            escapeActions: 1,
            stanceActions: 2,
            endTurnActions: 7,
        },
        finalParty: {
            matsuko: { observations: 4, averageTotalBinding: 3.75, maxTotalBinding: 8 },
            ko: { observations: 4, averageTotalBinding: 5.75, maxTotalBinding: 10 },
        },
        interestingRuns: {
            defeats: [reference(3, "defeat")],
            errors: [],
            maxActions: [],
            shortest: null,
            longest: reference(3, "defeat"),
        },
    };
}

describe("batch CLI arguments", () => {
    it("parses the required identity, defaults maxActions, and disables replay", () => {
        expect(parseBatchArguments(["plains_1", "1", "first", "1000"])).toEqual({
            encounterId: "plains_1",
            masterSeed: 1,
            policy: policies.first,
            runs: 1000,
            maxActions: 1000,
            replay: false,
        });
    });

    it.each(Object.keys(policies))("resolves the existing %s policy and accepts an explicit action limit", (id) => {
        const input = parseBatchArguments(["plains_1", "-1", id, "2", "7"]);
        expect(input.policy).toBe(policies[id as keyof typeof policies]);
        expect(input).toMatchObject({ masterSeed: -1, runs: 2, maxActions: 7, replay: false });
    });

    it.each([Number.MIN_SAFE_INTEGER, -1, 0, Number.MAX_SAFE_INTEGER])("accepts safe master seed %s", (seed) => {
        expect(parseBatchArguments(["plains_1", String(seed), "first", "1"]).masterSeed).toBe(seed);
    });

    it("accepts the positive safe-integer boundaries for runs and maxActions", () => {
        for (const value of [1, Number.MAX_SAFE_INTEGER]) {
            expect(parseBatchArguments(["plains_1", "1", "first", String(value), String(value)]))
                .toMatchObject({ runs: value, maxActions: value });
        }
    });

    it.each([
        { name: "masterSeed", index: 1, positive: false },
        { name: "runs", index: 3, positive: true },
        { name: "maxActions", index: 4, positive: true },
    ])("rejects invalid $name values with a clear error and usage", ({ name, index, positive }) => {
        const invalid = ["", " ", "NaN", "Infinity", "-Infinity", "1.5", "9007199254740992", "-9007199254740992", "1junk"];
        if (positive) invalid.push("0", "-1");
        for (const value of invalid) {
            const args = ["plains_1", "1", "first", "2", "1000"];
            args[index] = value;
            expect(() => parseBatchArguments(args)).toThrow(`${name} must be a ${positive ? "positive " : ""}safe integer`);
            expect(() => parseBatchArguments(args)).toThrow("Usage: npm run batch --");
        }
    });

    it("rejects missing or extra arguments", () => {
        const args = ["plains_1", "1", "first", "2"];
        for (let count = 0; count < 4; count++) {
            expect(() => parseBatchArguments(args.slice(0, count))).toThrow("Usage: npm run batch --");
        }
        expect(() => parseBatchArguments([...args, "10", "extra"])).toThrow("optional maxActions");
    });

    it.each(["unknown", "constructor", ""])("rejects unknown policy %j and lists existing policies", (id) => {
        expect(() => parseBatchArguments(["plains_1", "1", id, "2"]))
            .toThrow(`Unknown policy: ${id}. Available policies: first, random, swing-only`);
    });

    it("rejects an empty encounter ID", () => {
        expect(() => parseBatchArguments([" ", "1", "first", "2"]))
            .toThrow("encounterId must not be empty");
    });
});

describe("batch summary console formatting", () => {
    it("prints the experiment identity and all four outcome counts and percentages", () => {
        expect(formatBatchSummary(summaryFixture()).slice(0, 7)).toEqual([
            "fixture / first",
            "4 runs / master seed 99",
            "",
            "Victory: 3 (75.0%)",
            "Defeat:  1 (25.0%)",
            "Max:     0 (0.0%)",
            "Errors:  0 (0.0%)",
        ]);
    });

    it("derives percentages only from the supplied rates", () => {
        const summary = summaryFixture();
        summary.outcomes.victory.rate = 0.1234;
        summary.outcomes.defeat.rate = 0.4567;
        summary.outcomes.maxActions = { count: 1, rate: 0.025 };
        summary.outcomes.error = { count: 1, rate: 0.015 };
        expect(formatBatchSummary(summary)).toEqual(expect.arrayContaining([
            "Victory: 3 (12.3%)",
            "Defeat:  1 (45.7%)",
            "Max:     1 (2.5%)",
            "Errors:  1 (1.5%)",
        ]));
    });

    it("formats the supplied action and round distributions", () => {
        expect(formatBatchSummary(summaryFixture())).toEqual(expect.arrayContaining([
            "Actions: min 2 / median 3.5 / mean 4.3 / p90 8 / max 8",
            "Rounds:  min 1 / median 2.5 / mean 2.8 / p90 5 / max 5",
        ]));
    });

    it("lists move counts by frequency with stable ties and all other action counts", () => {
        const lines = formatBatchSummary(summaryFixture());
        const start = lines.indexOf("Moves:");
        expect(lines.slice(start, start + 7)).toEqual([
            "Moves:",
            "  telekinesis  3",
            "  brace  2",
            "  whiteFlame  2",
            "Escape: 1",
            "Stance: 2",
            "End turn: 7",
        ]);
    });

    it("formats final binding totals per character in ID order", () => {
        const lines = formatBatchSummary(summaryFixture());
        const start = lines.indexOf("Final binding:");
        expect(lines.slice(start, start + 3)).toEqual([
            "Final binding:",
            "  ko  avg 5.8 / max 10",
            "  matsuko  avg 3.8 / max 8",
        ]);
    });

    it("prints defeat references using the recorded zero-based run index and both seeds", () => {
        const summary = summaryFixture();
        summary.interestingRuns.defeats.push(reference(0, "defeat"));
        const lines = formatBatchSummary(summary);
        expect(lines.slice(lines.indexOf("Defeats:"))).toEqual([
            "Defeats:",
            "  run 3  engine 1003  policy 2003  actions 8  round 5",
            "  run 0  engine 1000  policy 2000  actions 8  round 5",
        ]);
    });

    it("prints error and maxActions references when present", () => {
        const summary = summaryFixture();
        summary.interestingRuns.errors = [reference(8, "error")];
        summary.interestingRuns.maxActions = [reference(1, "maxActions")];
        const lines = formatBatchSummary(summary);
        expect(lines.slice(lines.indexOf("Errors:"))).toEqual([
            "Errors:",
            "  run 8  engine 1008  policy 2008  actions 8  round 5",
            "",
            "Max actions:",
            "  run 1  engine 1001  policy 2001  actions 8  round 5",
        ]);
    });

    it("omits empty optional sections and handles absent distributions without junk output", () => {
        const summary = summaryFixture();
        summary.runCount = 0;
        for (const outcome of Object.values(summary.outcomes)) {
            outcome.count = 0;
            outcome.rate = 0;
        }
        summary.fightLength = { actionCount: null, round: null };
        summary.actionUsage = { totalMoveActions: 0, moves: {}, escapeActions: 0, stanceActions: 0, endTurnActions: 0 };
        summary.finalParty = {};
        summary.interestingRuns = { defeats: [], errors: [], maxActions: [], shortest: null, longest: null };

        const lines = formatBatchSummary(summary);
        expect(lines).toContain("Actions: n/a");
        expect(lines).toContain("Rounds:  n/a");
        for (const heading of ["Moves:", "Final binding:", "Defeats:", "Errors:", "Max actions:"]) {
            expect(lines).not.toContain(heading);
        }
        expect(lines.at(-1)).toBe("End turn: 0");
        expect(lines.join("\n")).not.toMatch(/NaN|Infinity|undefined|null|\n{3}/);
    });

    it("does not mutate summary values or references when rounding or sorting for display", () => {
        const summary = summaryFixture();
        const before = structuredClone(summary);
        expect(formatBatchSummary(summary)).toEqual(formatBatchSummary(summary));
        expect(summary).toEqual(before);
    });
});
