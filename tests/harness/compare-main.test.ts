import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BatchResult } from "../../src/harness/batch/batch";
import {
    executePolicyComparison,
    type PolicyComparisonResult,
} from "../../src/harness/batch/comparison";
import { summarizeBatch } from "../../src/harness/batch/summary";

vi.mock("../../src/harness/batch/comparison", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../src/harness/batch/comparison")>();
    return { ...actual, executePolicyComparison: vi.fn() };
});

const originalArgv = process.argv;
const originalExitCode = process.exitCode;

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 21, 11, 15, 4));
    vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined);
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => { });
    vi.spyOn(console, "log").mockImplementation(() => { });
    vi.spyOn(console, "error").mockImplementation(() => { });
    process.argv = [
        process.execPath,
        "compare-main.ts",
        "plains_1",
        "4",
        "first,random",
        "3",
        "1000",
        "2",
    ];
    process.exitCode = undefined;
    vi.mocked(executePolicyComparison).mockResolvedValue(comparisonFixture());
});

afterEach(() => {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe("comparison CLI output", () => {
    it("writes one manifest and every policy summary to one one-level run directory", async () => {
        await import("../../src/harness/cli/compare-main");

        const runDir = path.resolve(
            "harness-output",
            "2026-09-21_11-15-04_1_level_2_policies",
        );
        const writes = vi.mocked(fs.writeFileSync).mock.calls;
        expect(writes.map(([file]) => String(file))).toEqual([
            path.join(runDir, "run.json"),
            path.join(runDir, "plains_1-first.json"),
            path.join(runDir, "plains_1-random.json"),
        ]);
        expect(JSON.parse(writes[0][1] as string)).toMatchObject({
            masterSeed: 4,
            runsPerEncounter: 3,
            maxActions: 1_000,
            parallelWorkers: 2,
            encounters: ["plains_1"],
            policies: ["first", "random"],
        });
        expect(console.log).toHaveBeenCalledWith(
            "Saved 2 summaries to:\n"
            + "harness-output/2026-09-21_11-15-04_1_level_2_policies/",
        );
        expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining("Wrote "));
        expect(console.error).not.toHaveBeenCalled();
    });
});

function comparisonFixture(): PolicyComparisonResult {
    const policies = ["first", "random"].map((policyId) => {
        const batch: BatchResult = {
            encounterId: "plains_1",
            policyId,
            masterSeed: 4,
            runs: [],
        };
        return {
            policyId,
            batch,
            summary: summarizeBatch(batch),
            timing: { runtimeMs: 10, meanPerRunMs: 10 / 3 },
        };
    });
    return {
        encounterId: "plains_1",
        masterSeed: 4,
        runs: 3,
        maxActions: 1_000,
        parallelWorkers: 2,
        policies,
        policyRuntimeTotalMs: 20,
        overallElapsedMs: 25,
    };
}
