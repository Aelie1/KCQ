import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState, PlayerAction } from "../../src/engine/public/types";
import { runBatch, type BatchResult } from "../../src/harness/batch/batch";
import { summarizeBatch } from "../../src/harness/batch/summary";
import { formatBatchSummary } from "../../src/harness/batch/summary-format";
import { runSingleFight } from "../../src/harness/harness";

vi.mock("../../src/harness/batch/batch", () => ({ runBatch: vi.fn() }));
vi.mock("../../src/harness/harness", () => ({ runSingleFight: vi.fn() }));

const originalArgv = process.argv;
const originalExitCode = process.exitCode;

function batchFixture(): BatchResult {
    const finalState: GameState = {
        turn: { round: 1, step: 1, phase: "player", outcome: "victory" },
        characters: [], enemies: [], traps: [], encounter: null,
    };
    return {
        encounterId: "plains_1",
        policyId: "first",
        masterSeed: 1,
        runs: [1, 1, 2].map((actionCount, runIndex) => ({
            runIndex,
            engineSeed: 100 + runIndex,
            policySeed: 200 + runIndex,
            result: {
                encounterId: "plains_1",
                engineSeed: 100 + runIndex,
                policyId: "first",
                policySeed: 200 + runIndex,
                termination: "victory",
                finalState,
                actionCount,
                metrics: { decisions: actionCount, damage: 10, peakBondage: 0, escapes: 0 },
                trace: Array.from({ length: actionCount }, (): PlayerAction => ({ type: "endTurn" })),
            },
        })),
    };
}

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 21, 21, 15, 4));
    vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined);
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => { });
    vi.spyOn(console, "log").mockImplementation(() => { });
    vi.spyOn(console, "error").mockImplementation(() => { });
    process.argv = [process.execPath, "batch-main.ts", "plains_1", "1", "first", "3"];
    process.exitCode = undefined;
    vi.mocked(runBatch).mockReturnValue(batchFixture());
});

afterEach(() => {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe("batch CLI entry point", () => {
    it("runs without replay, saves exactly the factual summary, and prints a compact save notice", async () => {
        const summary = summarizeBatch(batchFixture());
        await import("../../src/harness/cli/batch-main");

        expect(runBatch).toHaveBeenCalledExactlyOnceWith({
            encounterId: "plains_1", masterSeed: 1, policy: expect.objectContaining({ id: "first" }),
            runs: 3, maxActions: 1000, replay: false,
        }, { onProgress: expect.any(Function) });
        const outputDir = path.resolve("harness-output");
        const runDir = path.join(outputDir, "2026-09-21_21-15-04_1_level_1_policy");
        const outputPath = path.join(runDir, "plains_1-first.json");
        expect(fs.mkdirSync).toHaveBeenNthCalledWith(1, outputDir, { recursive: true });
        expect(fs.mkdirSync).toHaveBeenNthCalledWith(2, runDir);
        expect(fs.writeFileSync).toHaveBeenCalledWith(
            path.join(runDir, "run.json"), expect.any(String), "utf8",
        );
        expect(fs.writeFileSync).toHaveBeenCalledWith(outputPath, JSON.stringify(summary, null, 2), "utf8");
        const manifestCall = vi.mocked(fs.writeFileSync).mock.calls.find(([file]) => file === path.join(runDir, "run.json"));
        expect(JSON.parse(manifestCall?.[1] as string)).toEqual({
            startedAt: expect.stringMatching(/^2026-09-21T21:15:04[+-]\d{2}:\d{2}$/),
            masterSeed: 1,
            runsPerEncounter: 3,
            maxActions: 1_000,
            parallelWorkers: 1,
            encounters: ["plains_1"],
            policies: ["first"],
        });
        expect(summary.fightLength.actionCount?.mean).toBe(4 / 3);
        expect(console.log).toHaveBeenCalledWith(formatBatchSummary(summary).join("\n"));
        expect(console.log).toHaveBeenCalledWith(
            "Saved 1 summary to:\nharness-output/2026-09-21_21-15-04_1_level_1_policy/",
        );
        expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining("Wrote "));
        expect(console.error).not.toHaveBeenCalled();
        expect(process.exitCode).toBeUndefined();
    });

    it("includes the explicit action limit in the manifest but not the simplified filename", async () => {
        process.argv.push("7");
        await import("../../src/harness/cli/batch-main");

        expect(runBatch).toHaveBeenCalledWith(
            expect.objectContaining({ maxActions: 7, replay: false }),
            { onProgress: expect.any(Function) },
        );
        expect(fs.writeFileSync).toHaveBeenCalledWith(
            path.resolve(
                "harness-output",
                "2026-09-21_21-15-04_1_level_1_policy",
                "plains_1-first.json",
            ),
            expect.any(String), "utf8",
        );
        const manifestCall = vi.mocked(fs.writeFileSync).mock.calls.find(([file]) => String(file).endsWith("run.json"));
        expect(JSON.parse(manifestCall?.[1] as string)).toMatchObject({ maxActions: 7 });
    });

    it("sanitizes encounter IDs to keep the summary in harness-output", async () => {
        process.argv[2] = "../odd/encounter";
        await import("../../src/harness/cli/batch-main");

        expect(fs.writeFileSync).toHaveBeenCalledWith(
            path.resolve(
                "harness-output",
                "2026-09-21_21-15-04_1_level_1_policy",
                ".._odd_encounter-first.json",
            ),
            expect.any(String), "utf8",
        );
    });

    it("exits unsuccessfully on invalid arguments without running or writing anything", async () => {
        process.argv[5] = "0";
        await import("../../src/harness/cli/batch-main");

        expect(process.exitCode).toBe(1);
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining("runs must be a positive safe integer"));
        expect(runBatch).not.toHaveBeenCalled();
        expect(fs.mkdirSync).not.toHaveBeenCalled();
        expect(fs.writeFileSync).not.toHaveBeenCalled();
        expect(console.log).not.toHaveBeenCalled();
    });

    it("reports file write failures without claiming the artifact was written", async () => {
        vi.mocked(fs.writeFileSync).mockImplementation(() => { throw new Error("Output is not writable"); });
        await import("../../src/harness/cli/batch-main");

        expect(process.exitCode).toBe(1);
        expect(console.error).toHaveBeenCalledWith("Output is not writable");
        expect(console.log).not.toHaveBeenCalled();
    });

    it("keeps the existing fight entry point and replay artifact behavior unchanged", async () => {
        process.argv = [process.execPath, "main.ts", "plains_1", "12345", "first"];
        const result = { ...batchFixture().runs[0].result, replay: { initialState: batchFixture().runs[0].result.finalState, initialActions: [], steps: [] } };
        vi.mocked(runSingleFight).mockReturnValue(result);
        await import("../../src/harness/cli/fight-main");

        expect(runSingleFight).toHaveBeenCalledExactlyOnceWith({
            encounterId: "plains_1", engineSeed: 12345, policy: expect.objectContaining({ id: "first" }),
            policySeed: 0, maxActions: 1000, replay: true,
        });
        expect(fs.writeFileSync).toHaveBeenCalledWith(
            path.resolve("harness-output", "plains_1-engine-12345-first-policy-0.json"),
            JSON.stringify(result, null, 2), "utf8",
        );
        expect(runBatch).not.toHaveBeenCalled();
        expect(process.exitCode).toBeUndefined();
        const scripts = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8")).scripts;
        expect(scripts.fight).toBe("tsx src/harness/cli/fight-main.ts");
        expect(scripts.batch).toBe("tsx src/harness/cli/batch-main.ts");
    });
});
